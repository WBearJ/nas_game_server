#!/usr/bin/env python3
import hmac
import http.client
import json
import os
import re
import secrets
import socket
import struct
import tarfile
import threading
import time
from collections import deque
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, quote, unquote, urlencode, urlparse


APP_DIR = Path(__file__).resolve().parent
STATIC_DIR = APP_DIR / "static"
DOCKER_SOCKET = os.environ.get("DOCKER_SOCKET", "/var/run/docker.sock")
HOST = os.environ.get("CONTROL_HOST", "0.0.0.0")
PORT = int(os.environ.get("CONTROL_PORT", "8088"))
CONFIG_PATH = Path(os.environ.get("GAMES_CONFIG", APP_DIR / "games.json"))
HOST_PROJECT_MOUNT = Path(os.environ.get("HOST_PROJECT_MOUNT", "/host-project"))
ENV_PATTERN = re.compile(r"\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}")
ACTION_LOCK = threading.Lock()
STATE_LOCK = threading.Lock()
EVENT_LOG = deque(maxlen=1000)
METRICS_CACHE = {}
RUNTIME_METRICS_CACHE = {}
PLAYER_EVENTS_CACHE = {}
PALWORLD_DETAIL_CACHE = {}
TERRARIA_DETAIL_CACHE = {}
ZOMBOID_DETAIL_CACHE = {}
SESSIONS = {}
LOGIN_FAILURES = {}
SESSION_TTL_SECONDS = int(os.environ.get("CONTROL_SESSION_TTL_SECONDS", "43200"))
LOGIN_WINDOW_SECONDS = 300
LOGIN_MAX_FAILURES = 5
MAX_MOD_UPLOAD_BYTES = 512 * 1024 * 1024
OPERATION = {
    "running": False,
    "gameId": None,
    "gameName": None,
    "action": None,
    "message": "暂无进行中的操作",
    "startedAt": None,
    "finishedAt": None,
    "error": None
}


def now_iso():
    return datetime.now().astimezone().isoformat(timespec="seconds")


def load_accounts():
    raw = os.environ.get("CONTROL_ACCOUNTS_JSON") or '{"admin":"admin123"}'
    try:
        accounts = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RuntimeError("CONTROL_ACCOUNTS_JSON 不是有效的 JSON") from exc
    if not isinstance(accounts, dict) or not accounts:
        raise RuntimeError("CONTROL_ACCOUNTS_JSON 至少需要配置一个账号")
    validated = {}
    for username, password in accounts.items():
        name = str(username)
        secret = str(password)
        if not re.fullmatch(r"[A-Za-z0-9_.-]{1,32}", name):
            raise RuntimeError(f"登录账号格式无效：{name}")
        if not secret or len(secret) > 256:
            raise RuntimeError(f"登录密码格式无效：{name}")
        validated[name] = secret
    return validated


ACCOUNTS = load_accounts()


def authenticate_account(username, password, client_id):
    now = time.monotonic()
    with STATE_LOCK:
        recent = [
            timestamp for timestamp in LOGIN_FAILURES.get(client_id, [])
            if now - timestamp < LOGIN_WINDOW_SECONDS
        ]
        LOGIN_FAILURES[client_id] = recent
        if len(recent) >= LOGIN_MAX_FAILURES:
            raise DockerError(429, "登录失败次数过多，请 5 分钟后再试")
    expected = ACCOUNTS.get(str(username or ""), "invalid-account-password")
    valid = str(username or "") in ACCOUNTS and hmac.compare_digest(expected, str(password or ""))
    if not valid:
        with STATE_LOCK:
            LOGIN_FAILURES.setdefault(client_id, []).append(now)
        raise DockerError(401, "账号或密码错误")
    session_id = secrets.token_urlsafe(32)
    with STATE_LOCK:
        LOGIN_FAILURES.pop(client_id, None)
        SESSIONS[session_id] = {
            "username": str(username),
            "expiresAt": now + SESSION_TTL_SECONDS
        }
    return session_id


def session_account(session_id):
    if not session_id:
        return None
    now = time.monotonic()
    with STATE_LOCK:
        expired = [key for key, value in SESSIONS.items() if value["expiresAt"] <= now]
        for key in expired:
            SESSIONS.pop(key, None)
        session = SESSIONS.get(session_id)
        if not session:
            return None
        session["expiresAt"] = now + SESSION_TTL_SECONDS
        return session["username"]


def revoke_session(session_id):
    with STATE_LOCK:
        SESSIONS.pop(session_id, None)


def record_log(message, source="controller", level="info"):
    entry = {
        "timestamp": now_iso(),
        "source": source,
        "level": level,
        "message": str(message)
    }
    with STATE_LOCK:
        EVENT_LOG.append(entry)
    print(f"[{entry['source']}] {entry['message']}", flush=True)


def update_operation(**changes):
    with STATE_LOCK:
        OPERATION.update(changes)
        return dict(OPERATION)


def operation_snapshot():
    with STATE_LOCK:
        return dict(OPERATION)


class DockerError(RuntimeError):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status


class UnixHTTPConnection(http.client.HTTPConnection):
    def __init__(self, socket_path, timeout=300):
        super().__init__("localhost", timeout=timeout)
        self.socket_path = socket_path

    def connect(self):
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.settimeout(self.timeout)
        self.sock.connect(self.socket_path)


class DockerClient:
    def __init__(self, socket_path):
        self.socket_path = socket_path
        self.api_prefix = None
        self._stats_samples = {}
        self._stats_lock = threading.Lock()

    def _request(self, method, path, body=None, versioned=True, timeout=300, raw_response=False):
        if versioned and self.api_prefix is None:
            info = self._request("GET", "/version", versioned=False, timeout=10)
            api_version = info.get("ApiVersion", "1.41")
            self.api_prefix = f"/v{api_version}"

        target = f"{self.api_prefix}{path}" if versioned else path
        payload = None if body is None else json.dumps(body).encode("utf-8")
        headers = {"Content-Type": "application/json"} if payload is not None else {}
        conn = UnixHTTPConnection(self.socket_path, timeout=timeout)
        try:
            conn.request(method, target, body=payload, headers=headers)
            response = conn.getresponse()
            raw = response.read()
        except (OSError, http.client.HTTPException) as exc:
            raise DockerError(503, f"无法连接 Docker：{exc}") from exc
        finally:
            conn.close()

        if response.status >= 400:
            try:
                message = json.loads(raw.decode("utf-8")).get("message", raw.decode("utf-8"))
            except (ValueError, UnicodeDecodeError):
                message = raw.decode("utf-8", errors="replace")
            raise DockerError(response.status, message or f"Docker API {response.status}")

        if not raw:
            return b"" if raw_response else {}
        if raw_response:
            return raw
        try:
            return json.loads(raw.decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            return {"raw": raw.decode("utf-8", errors="replace")}

    def _stream_request(self, method, path, on_event, timeout=1800):
        if self.api_prefix is None:
            info = self._request("GET", "/version", versioned=False, timeout=10)
            self.api_prefix = f"/v{info.get('ApiVersion', '1.41')}"
        conn = UnixHTTPConnection(self.socket_path, timeout=timeout)
        try:
            conn.request(method, f"{self.api_prefix}{path}")
            response = conn.getresponse()
            if response.status >= 400:
                raw = response.read()
                try:
                    message = json.loads(raw.decode("utf-8")).get("message", raw.decode("utf-8"))
                except (ValueError, UnicodeDecodeError):
                    message = raw.decode("utf-8", errors="replace")
                raise DockerError(response.status, message or f"Docker API {response.status}")
            while True:
                raw_line = response.readline()
                if not raw_line:
                    break
                try:
                    event = json.loads(raw_line.decode("utf-8"))
                except (UnicodeDecodeError, json.JSONDecodeError):
                    continue
                error = event.get("error") or (event.get("errorDetail") or {}).get("message")
                if error:
                    raise DockerError(502, error)
                on_event(event)
        except (OSError, http.client.HTTPException) as exc:
            raise DockerError(503, f"Docker 镜像下载连接失败：{exc}") from exc
        finally:
            conn.close()

    def inspect(self, name):
        try:
            return self._request("GET", f"/containers/{quote(name, safe='')}/json")
        except DockerError as exc:
            if exc.status == 404:
                return None
            raise

    def ensure_volume(self, name):
        try:
            self._request("GET", f"/volumes/{quote(name, safe='')}")
        except DockerError as exc:
            if exc.status != 404:
                raise
            self._request("POST", "/volumes/create", {"Name": name})

    def ensure_image(self, image, source="controller"):
        try:
            self._request("GET", f"/images/{quote(image, safe='')}/json")
            record_log(f"镜像已存在：{image}", source)
            return
        except DockerError as exc:
            if exc.status != 404:
                raise
        record_log(f"本地没有镜像 {image}，开始从镜像仓库下载", source)
        update_operation(message=f"正在下载镜像 {image}；首次启动可能需要较长时间")
        progress = {"lastAt": 0.0, "lastMessage": ""}

        def report(event):
            status = str(event.get("status") or "正在下载")
            layer = str(event.get("id") or "")
            detail = str(event.get("progress") or "").strip()
            suffix = f" · 层 {layer[:12]}" if layer else ""
            message = f"镜像下载：{status}{f' {detail}' if detail else ''}{suffix}"
            update_operation(message=message)
            now = time.monotonic()
            if message != progress["lastMessage"] and now - progress["lastAt"] >= 2:
                record_log(message, source)
                progress["lastAt"] = now
                progress["lastMessage"] = message

        self._stream_request(
            "POST",
            f"/images/create?fromImage={quote(image, safe='')}",
            report,
            timeout=1800
        )
        record_log(f"镜像下载完成：{image}", source)
        update_operation(message=f"镜像下载完成：{image}")

    def create_container(self, game, spec):
        image = spec["image"]
        self.ensure_image(image, game["id"])
        labels = {
            "nas-game-server.managed": "true",
            "nas-game-server.game": game["id"],
            "nas-game-server.role": spec.get("role", "server")
        }
        mounts = [
            {
                "Type": item["type"],
                "Source": item["source"],
                "Target": item["target"],
                "ReadOnly": item.get("readOnly", False)
            }
            for item in spec.get("mounts", [])
        ]
        port_bindings = {}
        exposed_ports = {}
        for item in spec.get("ports", []):
            container_port = str(item["containerPort"])
            exposed_ports[container_port] = {}
            port_bindings[container_port] = [{
                "HostIp": str(item.get("hostIp", "0.0.0.0")),
                "HostPort": str(item["hostPort"])
            }]
        config = {
            "Image": image,
            "Env": [f"{key}={value}" for key, value in spec.get("environment", {}).items()],
            "Labels": labels,
            "Tty": spec.get("tty", False),
            "OpenStdin": spec.get("openStdin", False),
            "StopTimeout": spec.get("stopTimeout", 30),
            "HostConfig": {
                "NetworkMode": spec.get("networkMode", "bridge"),
                "Binds": spec.get("binds", []),
                "Mounts": mounts,
                "RestartPolicy": {"Name": "no"},
                "Init": True
            }
        }
        if exposed_ports:
            config["ExposedPorts"] = exposed_ports
            config["HostConfig"]["PortBindings"] = port_bindings
        if spec.get("entrypoint"):
            config["Entrypoint"] = spec["entrypoint"]
        if spec.get("command"):
            config["Cmd"] = spec["command"]
        if spec.get("healthcheck"):
            health = spec["healthcheck"]
            config["Healthcheck"] = {
                "Test": health["test"],
                "StartPeriod": health.get("startPeriod", 0),
                "Interval": health.get("interval", 0),
                "Timeout": health.get("timeout", 0),
                "Retries": health.get("retries", 0)
            }
        return self._request(
            "POST",
            f"/containers/create?name={quote(spec['name'], safe='')}",
            config
        )

    def disable_auto_restart(self, name):
        self._request(
            "POST",
            f"/containers/{quote(name, safe='')}/update",
            {"RestartPolicy": {"Name": "no"}}
        )

    def start(self, name):
        try:
            self._request("POST", f"/containers/{quote(name, safe='')}/start")
        except DockerError as exc:
            if exc.status != 304:
                raise

    def stop(self, name, timeout=120):
        try:
            self._request("POST", f"/containers/{quote(name, safe='')}/stop?t={int(timeout)}")
        except DockerError as exc:
            if exc.status != 304:
                raise

    def remove(self, name):
        self._request("DELETE", f"/containers/{quote(name, safe='')}?v=0&force=0")

    def logs(self, name, tail=500):
        info = self.inspect(name)
        if info is None:
            return ""
        raw = self._request(
            "GET",
            f"/containers/{quote(name, safe='')}/logs?stdout=1&stderr=1&timestamps=1&tail={int(tail)}",
            timeout=15,
            raw_response=True
        )
        return self.decode_output(raw, info.get("Config", {}).get("Tty", False))

    @staticmethod
    def decode_output(raw, tty=False):
        if tty:
            return raw.decode("utf-8", errors="replace")
        chunks = []
        position = 0
        while position + 8 <= len(raw):
            header = raw[position:position + 8]
            size = int.from_bytes(header[4:8], "big")
            end = position + 8 + size
            if header[1:4] != b"\x00\x00\x00" or end > len(raw):
                return raw.decode("utf-8", errors="replace")
            chunks.append(raw[position + 8:end])
            position = end
        if position != len(raw):
            chunks.append(raw[position:])
        return b"".join(chunks).decode("utf-8", errors="replace")

    def stats(self, name):
        info = self.inspect(name)
        if info is None or info.get("State", {}).get("Status") != "running":
            return None
        stats = self._request(
            "GET",
            f"/containers/{quote(name, safe='')}/stats?stream=false&one-shot=true",
            timeout=15
        )
        cpu_stats = stats.get("cpu_stats", {})
        docker_previous = stats.get("precpu_stats", {})
        current_total = cpu_stats.get("cpu_usage", {}).get("total_usage", 0)
        current_system = cpu_stats.get("system_cpu_usage", 0)
        observed_at = time.monotonic_ns()
        with self._stats_lock:
            cached_previous = self._stats_samples.get(name)
            self._stats_samples[name] = {
                "total_usage": current_total,
                "system_cpu_usage": current_system,
                "observed_at": observed_at
            }
        previous_total = (
            cached_previous.get("total_usage", 0)
            if cached_previous
            else docker_previous.get("cpu_usage", {}).get("total_usage", 0)
        )
        previous_system = (
            cached_previous.get("system_cpu_usage", 0)
            if cached_previous
            else docker_previous.get("system_cpu_usage", 0)
        )
        cpu_delta = (
            current_total - previous_total
        )
        system_delta = current_system - previous_system
        online_cpus = cpu_stats.get("online_cpus") or len(
            cpu_stats.get("cpu_usage", {}).get("percpu_usage") or []
        ) or 1
        cpu_percent = 0.0
        if cpu_delta > 0 and system_delta > 0:
            cpu_percent = cpu_delta / system_delta * online_cpus * 100
        elif cpu_delta > 0 and cached_previous:
            elapsed = observed_at - cached_previous.get("observed_at", observed_at)
            if elapsed > 0:
                cpu_percent = cpu_delta / elapsed * 100
        memory = stats.get("memory_stats", {})
        memory_usage = memory.get("usage", 0)
        cache = memory.get("stats", {}).get("inactive_file", 0)
        return {
            "cpuPercent": round(cpu_percent, 2),
            "memoryBytes": max(0, memory_usage - cache),
            "memoryLimitBytes": memory.get("limit", 0)
        }

    def exec_command(self, name, command, user=None):
        config = {
            "AttachStdout": True,
            "AttachStderr": True,
            "Tty": False,
            "Cmd": command
        }
        if user:
            config["User"] = str(user)
        created = self._request(
            "POST",
            f"/containers/{quote(name, safe='')}/exec",
            config,
            timeout=20
        )
        exec_id = created.get("Id")
        if not exec_id:
            raise DockerError(500, "Docker 没有返回命令执行 ID")
        raw = self._request(
            "POST",
            f"/exec/{quote(exec_id, safe='')}/start",
            {"Detach": False, "Tty": False},
            timeout=30,
            raw_response=True
        )
        result = self._request("GET", f"/exec/{quote(exec_id, safe='')}/json", timeout=10)
        output = self.decode_output(raw).strip()
        if result.get("ExitCode") not in (0, None):
            raise DockerError(500, output or f"容器命令退出码 {result.get('ExitCode')}")
        return output


def expand(value):
    if isinstance(value, str):
        def replace(match):
            key, default = match.group(1), match.group(2)
            current = os.environ.get(key)
            return current if current not in (None, "") else (default or "")
        return ENV_PATTERN.sub(replace, value)
    if isinstance(value, list):
        return [expand(item) for item in value]
    if isinstance(value, dict):
        return {key: expand(item) for key, item in value.items()}
    return value


def load_games():
    with CONFIG_PATH.open("r", encoding="utf-8") as handle:
        config = expand(json.load(handle))
    games = config.get("games", [])
    ids = set()
    container_names = set()
    for game in games:
        game_id = game.get("id", "")
        if not re.fullmatch(r"[a-z0-9][a-z0-9_-]*", game_id) or game_id in ids:
            raise RuntimeError(f"无效或重复的游戏 ID：{game_id}")
        ids.add(game_id)
        for spec in game.get("containers", []):
            name = spec.get("name", "")
            if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]*", name) or name in container_names:
                raise RuntimeError(f"无效或重复的容器名称：{name}")
            container_names.add(name)
    apply_persisted_settings(games)
    return games


def settings_store_path():
    return HOST_PROJECT_MOUNT / "config" / "game-settings.json"


def read_settings_store():
    path = settings_store_path()
    if not path.is_file():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise RuntimeError(f"无法读取网页配置：{exc}") from exc
    return payload if isinstance(payload, dict) else {}


def primary_spec_from_game(game):
    return next((item for item in game.get("containers", []) if item.get("name") == game.get("primary")), None)


def command_flag_value(command, flag, default=""):
    try:
        return command[command.index(flag) + 1]
    except (ValueError, IndexError):
        return default


def set_command_flag(command, flag, value):
    try:
        index = command.index(flag)
    except ValueError:
        command.extend([flag, str(value)])
    else:
        if index + 1 >= len(command):
            command.append(str(value))
        else:
            command[index + 1] = str(value)


def apply_setting_value(game, definition, value):
    spec = primary_spec_from_game(game)
    if not spec:
        return
    target = definition.get("target") or {}
    if target.get("kind") == "environment":
        spec.setdefault("environment", {})[target["name"]] = str(value)
        for name in definition.get("linkedEnvironment", []):
            spec["environment"][name] = str(value)
    elif target.get("kind") == "command":
        command = spec.setdefault("command", [])
        set_command_flag(command, target["flag"], value)
        if definition.get("key") == "worldName":
            set_command_flag(command, "-world", f"/worlds/{value}.wld")


def apply_persisted_settings(games):
    stored = read_settings_store()
    for game in games:
        values = stored.get(game.get("id"), {})
        definitions = {item.get("key"): item for item in game.get("settings", [])}
        if not isinstance(values, dict):
            continue
        for key, value in values.items():
            definition = definitions.get(key)
            if definition is not None:
                apply_setting_value(game, definition, value)


GAMES = load_games()
GAME_INDEX = {game["id"]: game for game in GAMES}
DOCKER = DockerClient(DOCKER_SOCKET)


def container_state(spec):
    info = DOCKER.inspect(spec["name"])
    if info is None:
        return {
            "name": spec["name"],
            "role": spec.get("role", "server"),
            "state": "missing",
            "status": "尚未创建",
            "health": None
        }
    labels = info.get("Config", {}).get("Labels") or {}
    if labels.get("nas-game-server.managed") != "true":
        return {
            "name": spec["name"],
            "role": spec.get("role", "server"),
            "state": "conflict",
            "status": "存在未受总控管理的同名容器",
            "health": None
        }
    state = info.get("State", {})
    return {
        "name": spec["name"],
        "role": spec.get("role", "server"),
        "state": state.get("Status", "unknown"),
        "status": state.get("Status", "unknown"),
        "health": state.get("Health", {}).get("Status"),
        "startedAt": state.get("StartedAt")
    }


def public_game(game):
    containers = [container_state(spec) for spec in game.get("containers", [])]
    primary_name = game.get("primary")
    primary = next((item for item in containers if item["name"] == primary_name), None)
    state = primary["state"] if primary else "missing"
    return {
        "id": game["id"],
        "name": game["name"],
        "description": game.get("description", ""),
        "icon": game.get("icon", ""),
        "version": game.get("version", ""),
        "loader": game.get("loader", ""),
        "endpoint": game.get("endpoint", ""),
        "port": int(game.get("port", 0) or 0),
        "detailType": game.get("detailType", "minecraft"),
        "state": state,
        "health": primary.get("health") if primary else None,
        "containers": containers,
        "metrics": game_metrics(game, containers)
    }


def safe_host_path(relative):
    relative_path = Path(relative)
    if relative_path.is_absolute() or ".." in relative_path.parts:
        raise DockerError(400, f"无效的项目内路径：{relative}")
    root = HOST_PROJECT_MOUNT.resolve()
    target = (root / relative_path).resolve()
    if root not in target.parents:
        raise DockerError(400, f"项目内路径越界：{relative}")
    return target


def directory_size(path):
    total = 0
    if not path.exists():
        return 0
    for root, directories, files in os.walk(path, followlinks=False):
        directories[:] = [name for name in directories if not (Path(root) / name).is_symlink()]
        for filename in files:
            candidate = Path(root) / filename
            try:
                if not candidate.is_symlink():
                    total += candidate.stat().st_size
            except OSError:
                continue
    return total


def cached_disk_size(game):
    relative = game.get("diskPath")
    if not relative or not HOST_PROJECT_MOUNT.is_dir():
        return 0
    now = time.monotonic()
    with STATE_LOCK:
        cached = METRICS_CACHE.get(game["id"])
        if cached and now - cached["time"] < 30:
            return cached["bytes"]
    size = directory_size(safe_host_path(relative))
    with STATE_LOCK:
        METRICS_CACHE[game["id"]] = {"time": now, "bytes": size}
    return size


def parse_started_at(value):
    if not value or value.startswith("0001-"):
        return 0
    try:
        started = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return max(0, int((datetime.now().astimezone() - started).total_seconds()))
    except ValueError:
        return 0


def game_metrics(game, containers=None):
    now = time.monotonic()
    with STATE_LOCK:
        cached = RUNTIME_METRICS_CACHE.get(game["id"])
        if cached and now - cached["time"] < 2:
            return dict(cached["metrics"])
    containers = containers or [container_state(spec) for spec in game.get("containers", [])]
    cpu = 0.0
    memory = 0
    memory_limit = 0
    uptime = 0
    for item in containers:
        uptime = max(uptime, parse_started_at(item.get("startedAt")))
        if item.get("state") != "running":
            continue
        try:
            stats = DOCKER.stats(item["name"])
        except DockerError:
            stats = None
        if stats:
            cpu += stats["cpuPercent"]
            memory += stats["memoryBytes"]
            memory_limit += stats["memoryLimitBytes"]
    metrics = {
        "cpuPercent": round(cpu, 2),
        "memoryBytes": memory,
        "memoryLimitBytes": memory_limit,
        "diskBytes": cached_disk_size(game),
        "uptimeSeconds": uptime
    }
    with STATE_LOCK:
        RUNTIME_METRICS_CACHE[game["id"]] = {"time": now, "metrics": dict(metrics)}
    return metrics


def read_json_file(relative, default):
    if not relative or not HOST_PROJECT_MOUNT.is_dir():
        return default
    path = safe_host_path(relative)
    if not path.is_file():
        return default
    try:
        with path.open("r", encoding="utf-8") as handle:
            return json.load(handle)
    except (OSError, ValueError):
        return default


def read_properties(relative):
    result = {}
    if not relative or not HOST_PROJECT_MOUNT.is_dir():
        return result
    path = safe_host_path(relative)
    if not path.is_file():
        return result
    try:
        for raw_line in path.read_text(encoding="utf-8", errors="replace").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            result[key.strip()] = value.strip()
    except OSError:
        return {}
    return result


def encode_varint(value):
    output = bytearray()
    while True:
        current = value & 0x7F
        value >>= 7
        if value:
            current |= 0x80
        output.append(current)
        if not value:
            return bytes(output)


def read_varint(connection):
    value = 0
    for position in range(5):
        raw = connection.recv(1)
        if not raw:
            raise OSError("服务器状态响应提前结束")
        current = raw[0]
        value |= (current & 0x7F) << (7 * position)
        if not current & 0x80:
            return value
    raise OSError("服务器状态响应无效")


def recv_exact(connection, length):
    chunks = bytearray()
    while len(chunks) < length:
        chunk = connection.recv(length - len(chunks))
        if not chunk:
            raise OSError("服务器状态响应不完整")
        chunks.extend(chunk)
    return bytes(chunks)


def minecraft_status(game):
    port = int(game.get("port", 25565))
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=2) as connection:
            host = b"localhost"
            handshake = (
                encode_varint(0)
                + encode_varint(0)
                + encode_varint(len(host))
                + host
                + struct.pack(">H", port)
                + encode_varint(1)
            )
            connection.sendall(encode_varint(len(handshake)) + handshake)
            connection.sendall(b"\x01\x00")
            read_varint(connection)
            if read_varint(connection) != 0:
                return {}
            payload_length = read_varint(connection)
            payload = recv_exact(connection, payload_length)
            return json.loads(payload.decode("utf-8"))
    except (OSError, ValueError, json.JSONDecodeError):
        return {}


LOGIN_PATTERN = re.compile(r"\b([A-Za-z0-9_]{1,16})\[/([^\]]+)\] logged in")
LEAVE_PATTERN = re.compile(r"\b([A-Za-z0-9_]{1,16}) (?:left the game|lost connection)")


def player_events(game):
    relative = game.get("latestLogPath")
    if not relative or not HOST_PROJECT_MOUNT.is_dir():
        return {}
    path = safe_host_path(relative)
    if not path.is_file():
        return {}
    try:
        stat = path.stat()
    except OSError:
        return {}
    cache_key = (stat.st_mtime_ns, stat.st_size)
    with STATE_LOCK:
        cached = PLAYER_EVENTS_CACHE.get(str(path))
        if cached and cached["key"] == cache_key:
            return {key: dict(value) for key, value in cached["players"].items()}
    players = {}
    try:
        lines = path.read_text(encoding="utf-8", errors="replace").splitlines()[-10000:]
    except OSError:
        return {}
    for line in lines:
        login = LOGIN_PATTERN.search(line)
        if login:
            address = login.group(2)
            ip = address.rsplit(":", 1)[0].strip("[]")
            time_match = re.search(r"\[(\d\d:\d\d:\d\d)\]", line)
            players[login.group(1).lower()] = {
                "name": login.group(1),
                "ip": ip,
                "joinedAt": time_match.group(1) if time_match else None
            }
            continue
        leave = LEAVE_PATTERN.search(line)
        if leave:
            players.pop(leave.group(1).lower(), None)
    with STATE_LOCK:
        PLAYER_EVENTS_CACHE[str(path)] = {
            "key": cache_key,
            "players": {key: dict(value) for key, value in players.items()}
        }
    return players


def minecraft_players(game):
    status = minecraft_status(game)
    status_players = status.get("players", {})
    events = player_events(game)
    sample = status_players.get("sample") or []
    online_names = [item.get("name", "") for item in sample if item.get("name")]
    if not online_names and status_players.get("online", 0) == len(events):
        online_names = [item["name"] for item in events.values()]
    ops = {str(item.get("name", "")).lower(): item for item in read_json_file(game.get("opsPath"), [])}
    whitelist = {
        str(item.get("name", "")).lower(): item
        for item in read_json_file(game.get("whitelistPath"), [])
    }
    cache = {
        str(item.get("name", "")).lower(): item
        for item in read_json_file(game.get("usercachePath"), [])
    }
    players = []
    for name in online_names:
        key = name.lower()
        event = events.get(key, {})
        cached = cache.get(key, {})
        players.append({
            "name": name,
            "uuid": cached.get("uuid") or next(
                (item.get("id") for item in sample if item.get("name", "").lower() == key),
                None
            ),
            "ip": event.get("ip"),
            "joinedAt": event.get("joinedAt"),
            "isOp": key in ops,
            "isWhitelisted": key in whitelist
        })
    return {
        "online": int(status_players.get("online", len(players))),
        "max": int(status_players.get("max", 0)),
        "players": players,
        "listComplete": len(players) == int(status_players.get("online", len(players)))
    }


def backup_info(game):
    config = game.get("backup") or {}
    if not config or not HOST_PROJECT_MOUNT.is_dir():
        return {"exists": False, "sizeBytes": 0, "createdAt": None}
    path = safe_host_path(str(Path(config["directory"]) / config["filename"]))
    if not path.is_file():
        return {"exists": False, "sizeBytes": 0, "createdAt": None}
    stat = path.stat()
    return {
        "exists": True,
        "sizeBytes": stat.st_size,
        "createdAt": datetime.fromtimestamp(stat.st_mtime).astimezone().isoformat(timespec="seconds")
    }


def validate_mod_filename(filename):
    name = str(filename or "").strip()
    if (
        not name
        or len(name) > 200
        or name.startswith(".")
        or Path(name).name != name
        or Path(name).suffix.lower() != ".jar"
        or any(character in name for character in ("\x00", "/", "\\"))
    ):
        raise DockerError(400, "Mod 文件名无效，只允许上传单个 .jar 文件")
    return name


def mods_info(game):
    relative = game.get("modsPath")
    if not relative or not HOST_PROJECT_MOUNT.is_dir():
        return []
    directory = safe_host_path(relative)
    if not directory.is_dir():
        return []
    result = []
    try:
        for path in directory.iterdir():
            if path.suffix.lower() != ".jar" or not path.is_file() or path.is_symlink():
                continue
            stat = path.stat()
            result.append({
                "name": path.name,
                "sizeBytes": stat.st_size,
                "modifiedAt": datetime.fromtimestamp(stat.st_mtime).astimezone().isoformat(timespec="seconds")
            })
    except OSError as exc:
        raise DockerError(500, f"无法读取 Mod 目录：{exc}") from exc
    return sorted(result, key=lambda item: item["name"].lower())


def save_mod_upload(game, filename, stream, length):
    name = validate_mod_filename(filename)
    if length <= 0:
        raise DockerError(400, "上传的 Mod 文件为空")
    if length > MAX_MOD_UPLOAD_BYTES:
        raise DockerError(413, "Mod 文件不能超过 512 MB")
    relative = game.get("modsPath")
    if not relative:
        raise DockerError(400, "该游戏没有配置 Mod 目录")
    directory = safe_host_path(relative)
    try:
        directory.mkdir(parents=True, exist_ok=True)
        destination = directory / name
        temporary = directory / f".upload-{threading.get_ident()}-{time.monotonic_ns()}"
        remaining = length
        with temporary.open("wb") as handle:
            while remaining:
                chunk = stream.read(min(1024 * 1024, remaining))
                if not chunk:
                    raise DockerError(400, "Mod 文件上传不完整")
                handle.write(chunk)
                remaining -= len(chunk)
        os.replace(temporary, destination)
    except DockerError:
        if 'temporary' in locals() and temporary.exists():
            temporary.unlink(missing_ok=True)
        raise
    except OSError as exc:
        if 'temporary' in locals() and temporary.exists():
            temporary.unlink(missing_ok=True)
        raise DockerError(500, f"无法保存 Mod：{exc}") from exc
    with STATE_LOCK:
        METRICS_CACHE.pop(game["id"], None)
    record_log(f"已上传 Mod：{name}", game["id"])
    return {"name": name, "sizeBytes": length}


def delete_mod(game, filename):
    name = validate_mod_filename(filename)
    relative = game.get("modsPath")
    if not relative:
        raise DockerError(400, "该游戏没有配置 Mod 目录")
    path = safe_host_path(str(Path(relative) / name))
    if not path.is_file() or path.is_symlink():
        raise DockerError(404, "Mod 文件不存在")
    try:
        path.unlink()
    except OSError as exc:
        raise DockerError(500, f"无法删除 Mod：{exc}") from exc
    with STATE_LOCK:
        METRICS_CACHE.pop(game["id"], None)
    record_log(f"已删除 Mod：{name}", game["id"])


def minecraft_detail(game):
    public = public_game(game)
    properties = read_properties(game.get("propertiesPath"))
    public.update({
        "players": minecraft_players(game) if public["state"] == "running" else {
            "online": 0,
            "max": int(properties.get("max-players", 0) or 0),
            "players": [],
            "listComplete": True
        },
        "world": {
            "name": properties.get("level-name", "world"),
            "gamemode": properties.get("gamemode"),
            "difficulty": properties.get("difficulty"),
            "maxPlayers": properties.get("max-players"),
            "viewDistance": properties.get("view-distance"),
            "simulationDistance": properties.get("simulation-distance"),
            "onlineMode": properties.get("online-mode"),
            "whitelistEnabled": properties.get("white-list"),
            "motd": properties.get("motd")
        },
        "backup": backup_info(game),
        "mods": mods_info(game),
        "settings": settings_info(game)
    })
    return public


def extract_json_output(output):
    text = str(output or "").strip()
    decoder = json.JSONDecoder()
    for index, character in enumerate(text):
        if character not in "[{":
            continue
        try:
            payload, _end = decoder.raw_decode(text[index:])
            return payload
        except json.JSONDecodeError:
            continue
    raise DockerError(502, "服务器管理接口返回了无法识别的数据")


def palworld_rest(game, endpoint, payload=None):
    spec = primary_spec(game)
    if not spec:
        raise DockerError(404, "游戏没有注册主容器")
    info = DOCKER.inspect(spec["name"])
    if info is None or info.get("State", {}).get("Status") != "running":
        raise DockerError(409, "服务器尚未运行")
    assert_managed(game, spec, info)
    command = ["rest-cli", endpoint]
    if payload is not None:
        command.append(json.dumps(payload, ensure_ascii=False, separators=(",", ":")))
    output = DOCKER.exec_command(spec["name"], command)
    if not output:
        return {}
    return extract_json_output(output)


def palworld_value(data, *keys, default=None):
    if not isinstance(data, dict):
        return default
    lower = {str(key).lower(): value for key, value in data.items()}
    for key in keys:
        if key in data:
            return data[key]
        if str(key).lower() in lower:
            return lower[str(key).lower()]
    return default


def display_boolean(value):
    if isinstance(value, bool):
        return "开启" if value else "关闭"
    normalized = str(value or "").strip().lower()
    if normalized in ("true", "1", "yes", "on"):
        return "开启"
    if normalized in ("false", "0", "no", "off"):
        return "关闭"
    return value


def palworld_detail(game):
    public = public_game(game)
    spec = primary_spec(game) or {}
    environment = spec.get("environment", {})
    default_players = int(environment.get("PLAYERS", 0) or 0)
    public.update({
        "players": {"online": 0, "max": default_players, "players": [], "listComplete": True},
        "world": {},
        "serverInfo": {},
        "configuration": [],
        "features": {"playerModeration": True, "broadcast": True, "mods": False},
        "managementAvailable": False,
        "managementError": None,
        "backup": backup_info(game),
        "mods": [],
        "settings": settings_info(game)
    })
    if public["state"] != "running":
        return public

    now = time.monotonic()
    with STATE_LOCK:
        cached = PALWORLD_DETAIL_CACHE.get(game["id"])
        if cached and now - cached["time"] < 8:
            cached_payload = json.loads(json.dumps(cached["payload"], ensure_ascii=False))
            public.update(cached_payload)
            return public

    try:
        info = palworld_rest(game, "info")
        players_payload = palworld_rest(game, "players")
        settings = palworld_rest(game, "settings")
        metrics = palworld_rest(game, "metrics")
        raw_players = players_payload.get("players", []) if isinstance(players_payload, dict) else []
        players = []
        for player in raw_players:
            if not isinstance(player, dict):
                continue
            players.append({
                "name": palworld_value(player, "name", default="未知玩家"),
                "accountName": palworld_value(player, "accountName", "account_name"),
                "playerId": palworld_value(player, "playerId", "player_id"),
                "userId": palworld_value(player, "userId", "user_id"),
                "ip": palworld_value(player, "ip"),
                "ping": palworld_value(player, "ping"),
                "level": palworld_value(player, "level"),
                "buildingCount": palworld_value(player, "building_count", "buildingCount"),
                "locationX": palworld_value(player, "location_x", "locationX"),
                "locationY": palworld_value(player, "location_y", "locationY")
            })
        current_players = int(palworld_value(metrics, "currentplayernum", "currentPlayerNum", default=len(players)) or 0)
        max_players = int(palworld_value(metrics, "maxplayernum", "maxPlayerNum", default=default_players) or 0)
        server_name = palworld_value(info, "servername", "serverName", default=environment.get("SERVER_NAME"))
        payload = {
            "managementAvailable": True,
            "managementError": None,
            "players": {
                "online": current_players,
                "max": max_players,
                "players": players,
                "listComplete": len(players) == current_players
            },
            "serverInfo": {
                "name": server_name,
                "description": palworld_value(info, "description", default=environment.get("SERVER_DESCRIPTION")),
                "version": palworld_value(info, "version"),
                "worldGuid": palworld_value(info, "worldguid", "worldGuid")
            },
            "world": {
                "name": server_name,
                "days": palworld_value(metrics, "days"),
                "serverFps": palworld_value(metrics, "serverfps", "serverFps"),
                "frameTime": palworld_value(metrics, "serverframetime", "serverFrameTime")
            },
            "configuration": [
                {"label": "难度", "value": palworld_value(settings, "Difficulty", default=environment.get("DIFFICULTY"))},
                {"label": "经验倍率", "value": palworld_value(settings, "ExpRate", default=environment.get("EXP_RATE"))},
                {"label": "捕获倍率", "value": palworld_value(settings, "PalCaptureRate", default=environment.get("PAL_CAPTURE_RATE"))},
                {"label": "白天速度", "value": palworld_value(settings, "DayTimeSpeedRate")},
                {"label": "夜晚速度", "value": palworld_value(settings, "NightTimeSpeedRate")},
                {"label": "PvP", "value": display_boolean(palworld_value(settings, "bIsPvP", "IsPvP", default=environment.get("IS_PVP")))},
                {"label": "友军伤害", "value": display_boolean(palworld_value(settings, "bEnableFriendlyFire", "EnableFriendlyFire", default=environment.get("ENABLE_FRIENDLY_FIRE")))},
                {"label": "死亡惩罚", "value": palworld_value(settings, "DeathPenalty", default=environment.get("DEATH_PENALTY"))},
                {"label": "蛋孵化时间", "value": palworld_value(settings, "PalEggDefaultHatchingTime", default=environment.get("PAL_EGG_DEFAULT_HATCHING_TIME"))},
                {"label": "自动保存间隔", "value": palworld_value(settings, "AutoSaveSpan", default=environment.get("AUTO_SAVE_SPAN"))},
                {"label": "社区服务器", "value": display_boolean(environment.get("COMMUNITY"))},
                {"label": "跨平台", "value": environment.get("CROSSPLAY_PLATFORMS")}
            ]
        }
        payload["configuration"] = [
            item for item in payload["configuration"] if item.get("value") not in (None, "")
        ]
        with STATE_LOCK:
            PALWORLD_DETAIL_CACHE[game["id"]] = {"time": now, "payload": payload}
        public.update(payload)
    except DockerError as exc:
        public["managementError"] = str(exc)
    return public


def terraria_rest(game, endpoint, params=None):
    spec = primary_spec(game)
    if not spec:
        raise DockerError(404, "游戏没有注册主容器")
    info = DOCKER.inspect(spec["name"])
    if info is None or info.get("State", {}).get("Status") != "running":
        raise DockerError(409, "服务器尚未运行")
    assert_managed(game, spec, info)
    management = game.get("management") or {}
    port = int(management.get("restPort", 7878))
    query = dict(params or {})
    query["token"] = management.get("restToken", "")
    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
    try:
        connection.request("GET", f"{endpoint}?{urlencode(query)}")
        response = connection.getresponse()
        body = response.read().decode("utf-8", errors="replace")
    except (OSError, http.client.HTTPException) as exc:
        raise DockerError(502, f"TShock 管理接口暂不可用：{exc}") from exc
    finally:
        connection.close()
    try:
        payload = json.loads(body)
    except json.JSONDecodeError as exc:
        raise DockerError(502, "TShock 管理接口返回了无法识别的数据") from exc
    api_status = str(payload.get("status", response.status)) if isinstance(payload, dict) else str(response.status)
    if response.status >= 400 or not api_status.startswith("2"):
        message = payload.get("error") if isinstance(payload, dict) else None
        raise DockerError(502, str(message or f"TShock 管理接口返回 {api_status}"))
    nested = payload.get("response") if isinstance(payload, dict) else None
    return nested if isinstance(nested, dict) else payload


def terraria_detail(game):
    public = public_game(game)
    spec = primary_spec(game) or {}
    command = spec.get("command", [])

    def command_value(flag, default=None):
        try:
            return command[command.index(flag) + 1]
        except (ValueError, IndexError):
            return default

    max_players = int(command_value("-maxplayers", 0) or 0)
    difficulty_value = str(command_value("-difficulty", "1"))
    difficulty = {"0": "普通", "1": "专家", "2": "大师", "3": "旅途"}.get(difficulty_value, difficulty_value)
    world_size_value = str(command_value("-autocreate", "2"))
    world_size = {"1": "小型", "2": "中型", "3": "大型"}.get(world_size_value, world_size_value)
    world_name = command_value("-worldname", "nas-world")
    public.update({
        "players": {"online": 0, "max": max_players, "players": [], "listComplete": True},
        "world": {"name": world_name, "difficulty": difficulty, "size": world_size, "maxPlayers": max_players},
        "serverInfo": {},
        "configuration": [
            {"label": "世界大小", "value": world_size},
            {"label": "难度", "value": difficulty},
            {"label": "最大玩家", "value": max_players},
            {"label": "服务器密码", "value": "已设置" if command_value("-password") else "未设置"},
            {"label": "自动保存", "value": "开启"}
        ],
        "features": {"playerModeration": True, "broadcast": True, "mods": False},
        "managementAvailable": False,
        "managementError": None,
        "backup": backup_info(game),
        "mods": [],
        "settings": settings_info(game)
    })
    if public["state"] != "running":
        return public
    now = time.monotonic()
    with STATE_LOCK:
        cached = TERRARIA_DETAIL_CACHE.get(game["id"])
        if cached and now - cached["time"] < 8:
            public.update(json.loads(json.dumps(cached["payload"], ensure_ascii=False)))
            return public
    try:
        status = terraria_rest(game, "/v2/server/status", {"players": "true", "rules": "true"})
        raw_players = status.get("players", []) if isinstance(status, dict) else []
        players = [{
            "name": player.get("nickname") or player.get("username") or "未知玩家",
            "username": player.get("username"),
            "ip": player.get("ip"),
            "group": player.get("group"),
            "state": player.get("state"),
            "team": player.get("team")
        } for player in raw_players if isinstance(player, dict)]
        online = int(status.get("playercount", len(players)) or 0)
        maximum = int(status.get("maxplayers", max_players) or 0)
        payload = {
            "managementAvailable": True,
            "players": {"online": online, "max": maximum, "players": players, "listComplete": len(players) == online},
            "world": {"name": status.get("world") or world_name, "difficulty": difficulty, "size": world_size, "maxPlayers": maximum},
            "serverInfo": {"name": status.get("name"), "port": status.get("port")},
            "configuration": public["configuration"]
        }
        with STATE_LOCK:
            TERRARIA_DETAIL_CACHE[game["id"]] = {"time": now, "payload": payload}
        public.update(payload)
    except DockerError as exc:
        public["managementError"] = str(exc)
    return public


def rcon_packet(request_id, packet_type, body):
    encoded = str(body).encode("utf-8")
    payload = struct.pack("<ii", int(request_id), int(packet_type)) + encoded + b"\x00\x00"
    return struct.pack("<i", len(payload)) + payload


def receive_exact(sock, length):
    chunks = []
    remaining = length
    while remaining:
        chunk = sock.recv(remaining)
        if not chunk:
            raise DockerError(502, "Project Zomboid RCON 连接意外关闭")
        chunks.append(chunk)
        remaining -= len(chunk)
    return b"".join(chunks)


def receive_rcon_packet(sock):
    size = struct.unpack("<i", receive_exact(sock, 4))[0]
    if size < 10 or size > 4 * 1024 * 1024:
        raise DockerError(502, "Project Zomboid RCON 返回了无效数据")
    payload = receive_exact(sock, size)
    request_id, packet_type = struct.unpack("<ii", payload[:8])
    return request_id, packet_type, payload[8:-2].decode("utf-8", errors="replace")


def zomboid_rcon(game, command):
    spec = primary_spec(game)
    if not spec:
        raise DockerError(404, "游戏没有注册主容器")
    info = DOCKER.inspect(spec["name"])
    if info is None or info.get("State", {}).get("Status") != "running":
        raise DockerError(409, "服务器尚未运行")
    assert_managed(game, spec, info)
    management = game.get("management") or {}
    port = int(management.get("rconPort", 27016))
    password = str(management.get("rconPassword", ""))
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=5) as connection:
            connection.settimeout(5)
            auth_id = secrets.randbelow(2_000_000_000) + 1
            connection.sendall(rcon_packet(auth_id, 3, password))
            authenticated = False
            for _index in range(3):
                response_id, response_type, _body = receive_rcon_packet(connection)
                if response_id == -1:
                    raise DockerError(502, "Project Zomboid RCON 密码验证失败")
                if response_id == auth_id and response_type == 2:
                    authenticated = True
                    break
            if not authenticated:
                raise DockerError(502, "Project Zomboid RCON 验证没有完成")
            command_id = auth_id + 1
            connection.sendall(rcon_packet(command_id, 2, command))
            parts = []
            while True:
                try:
                    response_id, _response_type, body = receive_rcon_packet(connection)
                except socket.timeout:
                    break
                if response_id == command_id:
                    parts.append(body)
                if parts:
                    connection.settimeout(0.2)
            return "".join(parts).strip()
    except DockerError:
        raise
    except (OSError, struct.error) as exc:
        raise DockerError(502, f"Project Zomboid RCON 暂不可用：{exc}") from exc


def parse_zomboid_players(output):
    text = str(output or "").replace("\r", "")
    count_match = re.search(r"Players connected\s*\((\d+)\)", text, re.IGNORECASE)
    declared = int(count_match.group(1)) if count_match else 0
    players = []
    for line in text.splitlines()[1:]:
        name = line.strip().lstrip("-").strip()
        if not name or name.lower().startswith(("players connected", "no players")):
            continue
        if re.fullmatch(r"[A-Za-z0-9_. -]{1,64}", name):
            players.append({"name": name, "ip": None})
    return declared if count_match else len(players), players


def zomboid_detail(game):
    public = public_game(game)
    spec = primary_spec(game) or {}
    environment = spec.get("environment", {})
    maximum = int(environment.get("MAX_PLAYERS", 0) or 0)
    public.update({
        "players": {"online": 0, "max": maximum, "players": [], "listComplete": True},
        "world": {
            "name": environment.get("SERVER_NAME"),
            "map": environment.get("MAP_NAMES"),
            "maxPlayers": maximum,
            "pvp": display_boolean(environment.get("PVP")),
            "pauseOnEmpty": display_boolean(environment.get("PAUSE_ON_EMPTY")),
            "publicServer": display_boolean(environment.get("PUBLIC_SERVER")),
            "autosave": environment.get("AUTOSAVE_INTERVAL"),
            "maxRam": environment.get("MAX_RAM")
        },
        "serverInfo": {"name": environment.get("PUBLIC_NAME"), "version": "Build 42"},
        "configuration": [],
        "features": {"playerModeration": True, "broadcast": True, "mods": True},
        "managementAvailable": False,
        "managementError": None,
        "backup": backup_info(game),
        "mods": [],
        "settings": settings_info(game)
    })
    if public["state"] != "running":
        return public
    now = time.monotonic()
    with STATE_LOCK:
        cached = ZOMBOID_DETAIL_CACHE.get(game["id"])
        if cached and now - cached["time"] < 8:
            public.update(json.loads(json.dumps(cached["payload"], ensure_ascii=False)))
            return public
    try:
        online, players = parse_zomboid_players(zomboid_rcon(game, "players"))
        payload = {
            "managementAvailable": True,
            "players": {"online": online, "max": maximum, "players": players, "listComplete": len(players) == online}
        }
        with STATE_LOCK:
            ZOMBOID_DETAIL_CACHE[game["id"]] = {"time": now, "payload": payload}
        public.update(payload)
    except DockerError as exc:
        public["managementError"] = str(exc)
    return public


def game_detail(game):
    if game.get("detailType") == "palworld":
        return palworld_detail(game)
    if game.get("detailType") == "terraria":
        return terraria_detail(game)
    if game.get("detailType") == "zomboid":
        return zomboid_detail(game)
    return minecraft_detail(game)


def prepare_host_paths(game):
    if not HOST_PROJECT_MOUNT.is_dir():
        raise DockerError(
            500,
            f"总控无法访问项目目录 {HOST_PROJECT_MOUNT}；请重新创建总控容器以加载项目目录挂载"
        )
    for relative in game.get("hostDirectories", []):
        target = safe_host_path(relative)
        try:
            target.mkdir(parents=True, exist_ok=True)
            ownership = game.get("hostOwnership") or {}
            if "uid" in ownership and "gid" in ownership:
                os.chown(target, int(ownership["uid"]), int(ownership["gid"]))
        except OSError as exc:
            raise DockerError(500, f"无法创建目录 {relative}：{exc}") from exc
        record_log(f"已确认数据目录 {relative}", game["id"])
    for relative in game.get("hostFiles", []):
        target = safe_host_path(relative)
        if not target.is_file():
            raise DockerError(500, f"缺少项目文件 {relative}；请重新上传完整项目后重试")


def ensure_game(game):
    update_operation(message="正在检查 NAS 数据目录")
    prepare_host_paths(game)
    for requirement in game.get("requiredEnvironment", []):
        value = str(os.environ.get(requirement.get("name", ""), "")).strip()
        invalid = {str(item) for item in requirement.get("invalid", [])}
        if not value or value in invalid:
            raise DockerError(400, requirement.get("message", "缺少服务器必需配置"))
    for volume in game.get("volumes", []):
        record_log(f"检查共享卷 {volume}", game["id"])
        DOCKER.ensure_volume(volume)
    for spec in sorted(game.get("containers", []), key=lambda item: item.get("startOrder", 0)):
        info = DOCKER.inspect(spec["name"])
        if info is None:
            record_log(f"容器 {spec['name']} 尚未创建，开始创建", game["id"])
            DOCKER.create_container(game, spec)
            record_log(f"容器 {spec['name']} 创建完成", game["id"])
        else:
            assert_managed(game, spec, info)
            record_log(f"容器 {spec['name']} 已存在，继续使用", game["id"])
        DOCKER.disable_auto_restart(spec["name"])


def assert_managed(game, spec, info):
    labels = info.get("Config", {}).get("Labels") or {}
    if (
        labels.get("nas-game-server.managed") != "true"
        or labels.get("nas-game-server.game") != game["id"]
    ):
        raise DockerError(
            409,
            f"容器 {spec['name']} 已存在但不属于总控；请先在 Container Manager 删除旧容器，保留数据目录，然后重试"
        )


def primary_spec(game):
    return next(
        (spec for spec in game.get("containers", []) if spec["name"] == game.get("primary")),
        None
    )


def setting_current_value(game, definition):
    spec = primary_spec(game) or {}
    target = definition.get("target") or {}
    if target.get("kind") == "environment":
        value = spec.get("environment", {}).get(target.get("name"), "")
    else:
        value = command_flag_value(spec.get("command", []), target.get("flag"), "")
    if definition.get("type") == "boolean":
        return str(value).strip().lower() in ("true", "1", "yes", "on")
    if definition.get("type") == "password":
        return ""
    return value


def settings_info(game):
    result = []
    for definition in game.get("settings", []):
        item = {
            key: value for key, value in definition.items()
            if key not in ("target", "linkedFlags", "linkedEnvironment")
        }
        item["value"] = setting_current_value(game, definition)
        if definition.get("type") == "password":
            target = definition.get("target") or {}
            spec = primary_spec(game) or {}
            if target.get("kind") == "environment":
                current = spec.get("environment", {}).get(target.get("name"), "")
            else:
                current = command_flag_value(spec.get("command", []), target.get("flag"), "")
            item["configured"] = bool(current)
            item.setdefault("hint", "留空保持现有密码不变")
        result.append(item)
    return result


def validate_settings(game, submitted):
    if not isinstance(submitted, dict) or not submitted:
        raise DockerError(400, "没有提交任何配置")
    definitions = {item.get("key"): item for item in game.get("settings", [])}
    unknown = set(submitted) - set(definitions)
    if unknown:
        raise DockerError(400, f"包含不支持的配置：{', '.join(sorted(unknown))}")
    normalized = {}
    for key, raw in submitted.items():
        definition = definitions[key]
        field_type = definition.get("type", "text")
        if field_type == "password" and raw == "":
            continue
        if field_type == "password" and raw is None:
            normalized[key] = ""
            continue
        if field_type == "boolean":
            if not isinstance(raw, bool):
                raise DockerError(400, f"{definition['label']} 必须是开关值")
            value = "true" if raw else "false"
        elif field_type in ("integer", "number"):
            try:
                number = int(raw) if field_type == "integer" else float(raw)
            except (TypeError, ValueError) as exc:
                raise DockerError(400, f"{definition['label']} 必须是数字") from exc
            if number < definition.get("min", number) or number > definition.get("max", number):
                raise DockerError(400, f"{definition['label']} 超出允许范围")
            value = str(number).rstrip("0").rstrip(".") if field_type == "number" else str(number)
        else:
            value = str(raw or "").strip()
            if not value and field_type != "password" and not definition.get("allowEmpty"):
                raise DockerError(400, f"{definition['label']} 不能为空")
            if len(value) > int(definition.get("maxLength", 256)) or any(ord(char) < 32 for char in value):
                raise DockerError(400, f"{definition['label']} 格式无效")
        options = definition.get("options") or []
        if options and value not in {str(item.get("value")) for item in options}:
            raise DockerError(400, f"{definition['label']} 不是允许的选项")
        pattern = definition.get("pattern")
        if pattern and not re.fullmatch(pattern, value):
            raise DockerError(400, f"{definition['label']} 格式无效")
        normalized[key] = value
    if not normalized:
        raise DockerError(400, "配置没有变化")
    return normalized


def persist_settings(game, values):
    path = settings_store_path()
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        stored = read_settings_store()
        current = stored.get(game["id"], {})
        if not isinstance(current, dict):
            current = {}
        current.update(values)
        stored[game["id"]] = current
        temporary = path.with_name(f".{path.name}.{threading.get_ident()}.tmp")
        temporary.write_text(json.dumps(stored, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        os.replace(temporary, path)
    except OSError as exc:
        raise DockerError(500, f"无法保存网页配置：{exc}") from exc
    for definition in game.get("settings", []):
        if definition.get("key") in values:
            apply_setting_value(game, definition, values[definition["key"]])
    with STATE_LOCK:
        PALWORLD_DETAIL_CACHE.pop(game["id"], None)
        TERRARIA_DETAIL_CACHE.pop(game["id"], None)
        ZOMBOID_DETAIL_CACHE.pop(game["id"], None)


def send_console(game, command):
    spec = primary_spec(game)
    if not spec:
        raise DockerError(404, "游戏没有注册主容器")
    info = DOCKER.inspect(spec["name"])
    if info is None or info.get("State", {}).get("Status") != "running":
        raise DockerError(409, "服务器尚未运行")
    assert_managed(game, spec, info)
    user = spec.get("environment", {}).get("UID", "1000")
    DOCKER.exec_command(spec["name"], ["mc-send-to-console", command], user=user)
    record_log(f"已执行受限服务器命令：{command.split()[0]}", game["id"])


def save_world(game):
    if game.get("detailType") == "palworld":
        palworld_rest(game, "save")
        with STATE_LOCK:
            PALWORLD_DETAIL_CACHE.pop(game["id"], None)
        record_log("已请求帕鲁服务器保存世界", game["id"])
        return
    if game.get("detailType") == "terraria":
        terraria_rest(game, "/v2/world/save")
        with STATE_LOCK:
            TERRARIA_DETAIL_CACHE.pop(game["id"], None)
        record_log("已请求 Terraria 服务器保存世界", game["id"])
        return
    if game.get("detailType") == "zomboid":
        zomboid_rcon(game, "save")
        with STATE_LOCK:
            ZOMBOID_DETAIL_CACHE.pop(game["id"], None)
        record_log("已请求 Project Zomboid 服务器保存世界", game["id"])
        return
    send_console(game, "save-all flush")


def run_palworld_player_action(game, user_id, action):
    if not re.fullmatch(r"[A-Za-z0-9_:-]{1,128}", user_id or ""):
        raise DockerError(400, "玩家用户 ID 格式无效")
    if action not in ("kick", "ban"):
        raise DockerError(400, "不支持的玩家操作")
    message = "由服务器管理员移出" if action == "kick" else "由服务器管理员封禁"
    palworld_rest(game, action, {"userid": user_id, "message": message})
    with STATE_LOCK:
        PALWORLD_DETAIL_CACHE.pop(game["id"], None)
    label = "踢出" if action == "kick" else "封禁"
    record_log(f"已{label}帕鲁玩家 {user_id}", game["id"])
    return f"已{label}该玩家"


def announce_palworld(game, message):
    content = str(message or "").strip()
    if not content or len(content) > 200:
        raise DockerError(400, "公告内容需要在 1 到 200 个字符之间")
    palworld_rest(game, "announce", {"message": content})
    record_log("已发送帕鲁服务器公告", game["id"])
    return "服务器公告已发送"


def run_terraria_player_action(game, player_name, action):
    if not re.fullmatch(r"[A-Za-z0-9 _.\-]{1,32}", player_name or ""):
        raise DockerError(400, "玩家昵称格式无效")
    if action not in ("kick", "ban"):
        raise DockerError(400, "不支持的玩家操作")
    endpoint = "/v2/players/kick" if action == "kick" else "/v2/players/ban"
    terraria_rest(game, endpoint, {"player": player_name, "reason": "由服务器管理员执行"})
    with STATE_LOCK:
        TERRARIA_DETAIL_CACHE.pop(game["id"], None)
    label = "踢出" if action == "kick" else "封禁"
    record_log(f"已{label} Terraria 玩家 {player_name}", game["id"])
    return f"已{label}该玩家"


def run_zomboid_player_action(game, player_name, action):
    if not re.fullmatch(r"[A-Za-z0-9_. -]{1,64}", player_name or ""):
        raise DockerError(400, "玩家名称格式无效")
    if action not in ("kick", "ban"):
        raise DockerError(400, "不支持的玩家操作")
    command = f'kickuser "{player_name}" -r "由服务器管理员移出"' if action == "kick" else f'banuser "{player_name}"'
    zomboid_rcon(game, command)
    with STATE_LOCK:
        ZOMBOID_DETAIL_CACHE.pop(game["id"], None)
    label = "踢出" if action == "kick" else "封禁"
    record_log(f"已{label} Project Zomboid 玩家 {player_name}", game["id"])
    return f"已{label}该玩家"


def announce_game(game, message):
    content = str(message or "").strip()
    if not content or len(content) > 200:
        raise DockerError(400, "公告内容需要在 1 到 200 个字符之间")
    if game.get("detailType") == "palworld":
        return announce_palworld(game, content)
    if game.get("detailType") == "terraria":
        terraria_rest(game, "/v2/server/broadcast", {"msg": content})
        record_log("已发送 Terraria 服务器公告", game["id"])
        return "服务器公告已发送"
    if game.get("detailType") == "zomboid":
        safe_content = re.sub(r"[\r\n\t]+", " ", content).replace('"', "'")
        zomboid_rcon(game, f'servermsg "{safe_content}"')
        record_log("已发送 Project Zomboid 服务器公告", game["id"])
        return "服务器公告已发送"
    raise DockerError(400, "当前游戏不支持服务器公告")


def create_backup(game):
    config = game.get("backup") or {}
    data_relative = game.get("dataPath")
    if not config or not data_relative:
        raise DockerError(400, "该游戏没有配置备份")
    prepare_host_paths(game)
    data_path = safe_host_path(data_relative)
    if not data_path.is_dir():
        raise DockerError(404, "游戏数据目录不存在")
    backup_dir = safe_host_path(config["directory"])
    backup_dir.mkdir(parents=True, exist_ok=True)
    destination = backup_dir / config["filename"]
    temporary = backup_dir / f".{config['filename']}.tmp"
    running = False
    spec = primary_spec(game)
    if spec:
        info = DOCKER.inspect(spec["name"])
        running = bool(info and info.get("State", {}).get("Status") == "running")
    try:
        if running and game.get("detailType") in ("palworld", "terraria", "zomboid"):
            update_operation(message="正在请求服务器保存世界")
            save_world(game)
            time.sleep(2)
        elif running:
            update_operation(message="正在保存并暂停世界写入")
            send_console(game, "save-off")
            send_console(game, "save-all flush")
            time.sleep(2)
        update_operation(message="正在压缩游戏数据")
        record_log("开始创建世界备份", game["id"])
        with tarfile.open(temporary, "w:gz") as archive:
            archive.add(data_path, arcname="data", recursive=True)
        os.replace(temporary, destination)
        with STATE_LOCK:
            METRICS_CACHE.pop(game["id"], None)
        record_log(f"备份完成：{destination.name}", game["id"])
    finally:
        if temporary.exists():
            try:
                temporary.unlink()
            except OSError:
                pass
        if running and game.get("detailType") not in ("palworld", "terraria", "zomboid"):
            try:
                send_console(game, "save-on")
            except DockerError as exc:
                record_log(f"恢复世界写入失败：{exc}", game["id"], "error")


def run_action(game, action):
    specs = sorted(game.get("containers", []), key=lambda item: item.get("startOrder", 0))
    if action == "start":
        ensure_game(game)
        for spec in specs:
            update_operation(message=f"正在启动 {spec['name']}")
            record_log(f"正在启动容器 {spec['name']}", game["id"])
            DOCKER.start(spec["name"])
            record_log(f"容器 {spec['name']} 启动指令已发送", game["id"])
    elif action == "stop":
        for spec in reversed(specs):
            info = DOCKER.inspect(spec["name"])
            if info is not None:
                assert_managed(game, spec, info)
                DOCKER.disable_auto_restart(spec["name"])
                update_operation(message=f"正在停止 {spec['name']}")
                record_log(f"正在停止容器 {spec['name']}", game["id"])
                DOCKER.stop(spec["name"], spec.get("stopTimeout", 120))
                record_log(f"容器 {spec['name']} 已停止", game["id"])
    elif action == "restart":
        for spec in reversed(specs):
            info = DOCKER.inspect(spec["name"])
            if info is not None:
                assert_managed(game, spec, info)
                DOCKER.disable_auto_restart(spec["name"])
                update_operation(message=f"正在停止 {spec['name']}")
                record_log(f"正在停止容器 {spec['name']}", game["id"])
                DOCKER.stop(spec["name"], spec.get("stopTimeout", 120))
                record_log(f"容器 {spec['name']} 已停止", game["id"])
        ensure_game(game)
        for spec in specs:
            update_operation(message=f"正在启动 {spec['name']}")
            record_log(f"正在启动容器 {spec['name']}", game["id"])
            DOCKER.start(spec["name"])
            record_log(f"容器 {spec['name']} 启动指令已发送", game["id"])
    elif action == "backup":
        create_backup(game)
    elif action == "save":
        update_operation(message="正在强制保存世界")
        save_world(game)
    else:
        raise ValueError("不支持的操作")


ACTION_LABELS = {
    "start": "启动",
    "stop": "停止",
    "restart": "重启",
    "backup": "备份",
    "save": "保存世界",
    "settings": "应用配置"
}


def action_worker(game, action):
    label = ACTION_LABELS[action]
    try:
        record_log(f"开始{label} {game['name']}", game["id"])
        run_action(game, action)
        message = f"{game['name']} {label}操作已完成"
        record_log(message, game["id"])
        update_operation(
            running=False,
            message=message,
            finishedAt=now_iso(),
            error=None
        )
    except (DockerError, KeyError, ValueError, RuntimeError) as exc:
        message = f"{game['name']} {label}失败：{exc}"
        record_log(message, game["id"], "error")
        update_operation(
            running=False,
            message=message,
            finishedAt=now_iso(),
            error=str(exc)
        )
    except Exception as exc:
        message = f"{game['name']} {label}发生未预期错误：{exc}"
        record_log(message, game["id"], "error")
        update_operation(
            running=False,
            message=message,
            finishedAt=now_iso(),
            error=str(exc)
        )
    finally:
        ACTION_LOCK.release()


def settings_worker(game):
    try:
        specs = sorted(game.get("containers", []), key=lambda item: item.get("startOrder", 0))
        existing = []
        was_running = False
        for spec in specs:
            info = DOCKER.inspect(spec["name"])
            if info is None:
                continue
            assert_managed(game, spec, info)
            existing.append((spec, info))
            if spec["name"] == game.get("primary"):
                was_running = info.get("State", {}).get("Status") == "running"
        if was_running:
            update_operation(message="正在保存世界")
            save_world(game)
        for spec, info in reversed(existing):
            if info.get("State", {}).get("Status") == "running":
                update_operation(message=f"正在停止 {spec['name']}")
                DOCKER.stop(spec["name"], spec.get("stopTimeout", 120))
            update_operation(message=f"正在重建 {spec['name']}")
            DOCKER.remove(spec["name"])
            record_log(f"已移除旧容器 {spec['name']}，数据目录保持不变", game["id"])
        if existing:
            ensure_game(game)
            if was_running:
                for spec in specs:
                    update_operation(message=f"正在启动 {spec['name']}")
                    DOCKER.start(spec["name"])
        message = f"{game['name']} 配置已保存并应用"
        if not existing:
            message = f"{game['name']} 配置已保存，将在首次启动时应用"
        record_log(message, game["id"])
        update_operation(running=False, message=message, finishedAt=now_iso(), error=None)
    except Exception as exc:
        message = f"{game['name']} 配置应用失败：{exc}"
        record_log(message, game["id"], "error")
        update_operation(running=False, message=message, finishedAt=now_iso(), error=str(exc))
    finally:
        ACTION_LOCK.release()


def recent_logs(tail):
    with STATE_LOCK:
        controller = list(EVENT_LOG)[-tail:]
    operation = operation_snapshot()
    containers = []
    seen = set()
    for game in GAMES:
        for spec in game.get("containers", []):
            name = spec["name"]
            if name in seen:
                continue
            seen.add(name)
            try:
                info = DOCKER.inspect(name)
                if info is None:
                    waiting = operation.get("running") and operation.get("gameId") == game["id"]
                    message = (
                        "容器尚未创建。总控正在执行首次部署，请查看上方操作日志中的目录、镜像下载和创建进度。"
                        if waiting else
                        "容器尚未创建；首次点击启动后，总控会自动下载镜像并创建容器。"
                    )
                    containers.append({
                        "name": name,
                        "gameId": game["id"],
                        "gameName": game["name"],
                        "state": "missing",
                        "logs": message
                    })
                    continue
                state = info.get("State", {}).get("Status", "unknown")
                containers.append({
                    "name": name,
                    "gameId": game["id"],
                    "gameName": game["name"],
                    "state": state,
                    "logs": DOCKER.logs(name, tail)
                })
            except DockerError as exc:
                containers.append({
                    "name": name,
                    "gameId": game["id"],
                    "gameName": game["name"],
                    "state": "error",
                    "logs": f"读取日志失败：{exc}"
                })
    return {
        "operation": operation,
        "controller": controller,
        "containers": containers,
        "games": [{"id": game["id"], "name": game["name"]} for game in GAMES]
    }


PLAYER_ACTIONS = {
    "kick": lambda name: f"kick {name} 由服务器管理员移出",
    "op": lambda name: f"op {name}",
    "deop": lambda name: f"deop {name}",
    "whitelist-add": lambda name: f"whitelist add {name}",
    "whitelist-remove": lambda name: f"whitelist remove {name}"
}


def run_player_action(game, player_name, action):
    if not re.fullmatch(r"[A-Za-z0-9_]{1,16}", player_name):
        raise DockerError(400, "玩家昵称格式无效")
    command_factory = PLAYER_ACTIONS.get(action)
    if not command_factory:
        raise DockerError(400, "不支持的玩家操作")
    send_console(game, command_factory(player_name))
    labels = {
        "kick": "踢出",
        "op": "授予管理员",
        "deop": "取消管理员",
        "whitelist-add": "加入白名单",
        "whitelist-remove": "移出白名单"
    }
    return f"已对 {player_name} 执行：{labels[action]}"


def backup_due(game):
    config = game.get("backup") or {}
    if not config or not game.get("dataPath") or not HOST_PROJECT_MOUNT.is_dir():
        return False
    data_path = safe_host_path(game["dataPath"])
    if not data_path.is_dir() or not any(data_path.iterdir()):
        return False
    spec = primary_spec(game)
    if not spec:
        return False
    info = DOCKER.inspect(spec["name"])
    state = (info or {}).get("State", {})
    if state.get("Status") != "running" or state.get("Health", {}).get("Status") not in (None, "healthy"):
        return False
    info = backup_info(game)
    if not info["exists"]:
        return True
    created = datetime.fromisoformat(info["createdAt"])
    return (datetime.now().astimezone() - created).total_seconds() >= int(config["intervalSeconds"])


def backup_scheduler():
    while True:
        sleep_seconds = 3600
        try:
            for game in GAMES:
                config = game.get("backup") or {}
                if config:
                    sleep_seconds = min(sleep_seconds, max(60, int(config.get("checkIntervalSeconds", 3600))))
                if not backup_due(game) or not ACTION_LOCK.acquire(blocking=False):
                    continue
                operation = update_operation(
                    running=True,
                    gameId=game["id"],
                    gameName=game["name"],
                    action="backup",
                    message=f"准备自动备份 {game['name']}",
                    startedAt=now_iso(),
                    finishedAt=None,
                    error=None
                )
                record_log(operation["message"], game["id"])
                worker = threading.Thread(
                    target=action_worker,
                    args=(game, "backup"),
                    name=f"scheduled-backup-{game['id']}",
                    daemon=True
                )
                try:
                    worker.start()
                except Exception:
                    ACTION_LOCK.release()
                    raise
                break
        except Exception as exc:
            record_log(f"自动备份检查失败：{exc}", "backup", "error")
        time.sleep(sleep_seconds)


class Handler(BaseHTTPRequestHandler):
    server_version = "GameControl/1.0"

    def log_message(self, fmt, *args):
        print(f"{self.address_string()} - {fmt % args}", flush=True)

    def _headers(self, content_type="application/json; charset=utf-8", length=None):
        self.send_header("Content-Type", content_type)
        if length is not None:
            self.send_header("Content-Length", str(length))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header(
            "Content-Security-Policy",
            "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'"
        )

    def json_response(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self._headers(length=len(body))
        self.end_headers()
        self.wfile.write(body)

    def supplied_session(self):
        return self.headers.get("X-Control-Session", "")

    def authorized_account(self):
        return session_account(self.supplied_session())

    def require_auth(self):
        account = self.authorized_account()
        if account:
            return True
        self.json_response(401, {"error": "登录会话已失效，请重新登录"})
        return False

    def read_json_body(self, maximum=4096):
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError as exc:
            raise DockerError(400, "请求体大小无效") from exc
        if length <= 0 or length > maximum:
            raise DockerError(400, "请求体为空或过大")
        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise DockerError(400, "请求体不是有效的 JSON") from exc
        if not isinstance(payload, dict):
            raise DockerError(400, "请求体必须是对象")
        return payload

    def serve_static(self, request_path):
        relative = "index.html" if request_path == "/" else request_path.lstrip("/")
        candidate = (STATIC_DIR / relative).resolve()
        if STATIC_DIR not in candidate.parents and candidate != STATIC_DIR:
            self.json_response(404, {"error": "未找到"})
            return
        if not candidate.is_file():
            candidate = STATIC_DIR / "index.html"
        mime = {
            ".html": "text/html; charset=utf-8",
            ".css": "text/css; charset=utf-8",
            ".js": "application/javascript; charset=utf-8",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".png": "image/png",
            ".webp": "image/webp",
            ".svg": "image/svg+xml"
        }.get(candidate.suffix, "application/octet-stream")
        body = candidate.read_bytes()
        self.send_response(200)
        self._headers(mime, len(body))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/health":
            self.json_response(200, {"status": "ok"})
            return
        if path == "/api/session":
            account = self.authorized_account()
            if account:
                self.json_response(200, {"authenticated": True, "username": account})
            else:
                self.json_response(401, {"error": "登录会话已失效，请重新登录"})
            return
        if path == "/api/games":
            if not self.require_auth():
                return
            try:
                games = [public_game(game) for game in GAMES]
                self.json_response(200, {"games": games, "operation": operation_snapshot()})
            except DockerError as exc:
                self.json_response(503, {"error": str(exc)})
            return
        detail_match = re.fullmatch(r"/api/games/([a-z0-9_-]+)/detail", path)
        if detail_match:
            if not self.require_auth():
                return
            game = GAME_INDEX.get(detail_match.group(1))
            if game is None:
                self.json_response(404, {"error": "游戏未注册"})
                return
            try:
                self.json_response(200, {
                    "game": game_detail(game),
                    "operation": operation_snapshot()
                })
            except DockerError as exc:
                self.json_response(503, {"error": str(exc)})
            return
        if path == "/api/logs":
            if not self.require_auth():
                return
            try:
                query = parse_qs(urlparse(self.path).query)
                tail = max(20, min(int(query.get("tail", ["500"])[0]), 1000))
                self.json_response(200, recent_logs(tail))
            except ValueError:
                self.json_response(400, {"error": "日志行数参数无效"})
            return
        if path.startswith("/api/"):
            self.json_response(404, {"error": "未找到"})
            return
        self.serve_static(path)

    def do_POST(self):
        path = urlparse(self.path).path
        if path == "/api/login":
            try:
                payload = self.read_json_body()
                session_id = authenticate_account(
                    payload.get("username"),
                    payload.get("password"),
                    self.client_address[0]
                )
                username = str(payload.get("username"))
                record_log(f"管理账号 {username} 已登录", "auth")
                self.json_response(200, {
                    "authenticated": True,
                    "username": username,
                    "session": session_id,
                    "expiresIn": SESSION_TTL_SECONDS
                })
            except DockerError as exc:
                self.json_response(exc.status, {"error": str(exc)})
            return
        if not self.require_auth():
            return
        if path == "/api/logout":
            username = self.authorized_account()
            revoke_session(self.supplied_session())
            if username:
                record_log(f"管理账号 {username} 已退出", "auth")
            self.json_response(200, {"authenticated": False})
            return
        settings_match = re.fullmatch(r"/api/games/([a-z0-9_-]+)/settings", path)
        if settings_match:
            game = GAME_INDEX.get(settings_match.group(1))
            if game is None:
                self.json_response(404, {"error": "游戏未注册"})
                return
            if not ACTION_LOCK.acquire(blocking=False):
                operation = operation_snapshot()
                self.json_response(409, {
                    "error": f"另一个操作正在执行：{operation.get('message', '请稍后再试')}",
                    "operation": operation
                })
                return
            try:
                payload = self.read_json_body(maximum=16384)
                values = validate_settings(game, payload.get("settings"))
                persist_settings(game, values)
                operation = update_operation(
                    running=True,
                    gameId=game["id"],
                    gameName=game["name"],
                    action="settings",
                    message=f"准备应用 {game['name']} 配置",
                    startedAt=now_iso(),
                    finishedAt=None,
                    error=None
                )
                worker = threading.Thread(
                    target=settings_worker,
                    args=(game,),
                    name=f"game-settings-{game['id']}",
                    daemon=True
                )
                worker.start()
            except DockerError as exc:
                ACTION_LOCK.release()
                self.json_response(exc.status, {"error": str(exc)})
            except Exception as exc:
                ACTION_LOCK.release()
                self.json_response(500, {"error": f"无法应用配置：{exc}"})
            else:
                self.json_response(202, {"accepted": True, "operation": operation})
            return
        mod_upload_match = re.fullmatch(r"/api/games/([a-z0-9_-]+)/mods/upload", path)
        if mod_upload_match:
            game = GAME_INDEX.get(mod_upload_match.group(1))
            if game is None:
                self.json_response(404, {"error": "游戏未注册"})
                return
            if game.get("detailType", "minecraft") != "minecraft":
                self.json_response(400, {"error": "该游戏不支持 Mod 文件管理"})
                return
            try:
                length = int(self.headers.get("Content-Length", "0"))
                filename = unquote(self.headers.get("X-Mod-Filename", ""))
                mod = save_mod_upload(game, filename, self.rfile, length)
                self.json_response(201, {
                    "message": f"已添加 {mod['name']}，重启服务器后生效",
                    "mod": mod
                })
            except ValueError:
                self.json_response(400, {"error": "上传文件大小无效"})
            except DockerError as exc:
                self.json_response(exc.status, {"error": str(exc)})
            return
        player_match = re.fullmatch(
            r"/api/games/([a-z0-9_-]+)/players/([A-Za-z0-9_]{1,16})/(kick|op|deop|whitelist-add|whitelist-remove)",
            path
        )
        if player_match:
            game_id, player_name, player_action = player_match.groups()
            game = GAME_INDEX.get(game_id)
            if game is None:
                self.json_response(404, {"error": "游戏未注册"})
                return
            if game.get("detailType", "minecraft") != "minecraft":
                self.json_response(400, {"error": "该玩家操作不适用于当前游戏"})
                return
            try:
                message = run_player_action(game, player_name, player_action)
                self.json_response(200, {"message": message})
            except DockerError as exc:
                self.json_response(exc.status if exc.status < 500 else 502, {"error": str(exc)})
            return
        palworld_player_match = re.fullmatch(
            r"/api/games/([a-z0-9_-]+)/palworld-players/([A-Za-z0-9_:-]{1,128})/(kick|ban)",
            path
        )
        if palworld_player_match:
            game_id, user_id, player_action = palworld_player_match.groups()
            game = GAME_INDEX.get(game_id)
            if game is None or game.get("detailType") != "palworld":
                self.json_response(404, {"error": "帕鲁服务器未注册"})
                return
            try:
                message = run_palworld_player_action(game, user_id, player_action)
                self.json_response(200, {"message": message})
            except DockerError as exc:
                self.json_response(exc.status if exc.status < 500 else 502, {"error": str(exc)})
            return
        terraria_player_match = re.fullmatch(
            r"/api/games/([a-z0-9_-]+)/terraria-players/([^/]{1,128})/(kick|ban)",
            path
        )
        if terraria_player_match:
            game_id, encoded_name, player_action = terraria_player_match.groups()
            game = GAME_INDEX.get(game_id)
            if game is None or game.get("detailType") != "terraria":
                self.json_response(404, {"error": "Terraria 服务器未注册"})
                return
            try:
                message = run_terraria_player_action(game, unquote(encoded_name), player_action)
                self.json_response(200, {"message": message})
            except DockerError as exc:
                self.json_response(exc.status if exc.status < 500 else 502, {"error": str(exc)})
            return
        zomboid_player_match = re.fullmatch(
            r"/api/games/([a-z0-9_-]+)/zomboid-players/([^/]{1,128})/(kick|ban)",
            path
        )
        if zomboid_player_match:
            game_id, encoded_name, player_action = zomboid_player_match.groups()
            game = GAME_INDEX.get(game_id)
            if game is None or game.get("detailType") != "zomboid":
                self.json_response(404, {"error": "Project Zomboid 服务器未注册"})
                return
            try:
                message = run_zomboid_player_action(game, unquote(encoded_name), player_action)
                self.json_response(200, {"message": message})
            except DockerError as exc:
                self.json_response(exc.status if exc.status < 500 else 502, {"error": str(exc)})
            return
        announce_match = re.fullmatch(r"/api/games/([a-z0-9_-]+)/announce", path)
        if announce_match:
            game = GAME_INDEX.get(announce_match.group(1))
            if game is None or game.get("detailType") not in ("palworld", "terraria", "zomboid"):
                self.json_response(404, {"error": "服务器未注册或不支持公告"})
                return
            try:
                payload = self.read_json_body()
                message = announce_game(game, payload.get("message"))
                self.json_response(200, {"message": message})
            except DockerError as exc:
                self.json_response(exc.status if exc.status < 500 else 502, {"error": str(exc)})
            return
        match = re.fullmatch(r"/api/games/([a-z0-9_-]+)/(start|stop|restart|backup|save)", path)
        if not match:
            self.json_response(404, {"error": "未找到"})
            return
        game_id, action = match.groups()
        game = GAME_INDEX.get(game_id)
        if game is None:
            self.json_response(404, {"error": "游戏未注册"})
            return
        if not ACTION_LOCK.acquire(blocking=False):
            operation = operation_snapshot()
            self.json_response(409, {
                "error": f"另一个操作正在执行：{operation.get('message', '请稍后再试')}",
                "operation": operation
            })
            return
        operation = update_operation(
            running=True,
            gameId=game["id"],
            gameName=game["name"],
            action=action,
            message=f"准备{ACTION_LABELS[action]} {game['name']}",
            startedAt=now_iso(),
            finishedAt=None,
            error=None
        )
        worker = threading.Thread(
            target=action_worker,
            args=(game, action),
            name=f"game-action-{game['id']}-{action}",
            daemon=True
        )
        try:
            worker.start()
        except Exception as exc:
            ACTION_LOCK.release()
            update_operation(
                running=False,
                message=f"无法创建后台操作：{exc}",
                finishedAt=now_iso(),
                error=str(exc)
            )
            raise
        self.json_response(202, {"accepted": True, "operation": operation})

    def do_DELETE(self):
        path = urlparse(self.path).path
        if not self.require_auth():
            return
        mod_match = re.fullmatch(r"/api/games/([a-z0-9_-]+)/mods/(.+)", path)
        if not mod_match:
            self.json_response(404, {"error": "未找到"})
            return
        game = GAME_INDEX.get(mod_match.group(1))
        if game is None:
            self.json_response(404, {"error": "游戏未注册"})
            return
        if game.get("detailType", "minecraft") != "minecraft":
            self.json_response(400, {"error": "该游戏不支持 Mod 文件管理"})
            return
        try:
            name = unquote(mod_match.group(2))
            delete_mod(game, name)
            self.json_response(200, {"message": f"已删除 {name}，重启服务器后生效"})
        except DockerError as exc:
            self.json_response(exc.status, {"error": str(exc)})


if __name__ == "__main__":
    if ACCOUNTS == {"admin": "admin123"}:
        record_log("当前仍在使用默认管理账号 admin / admin123，请仅在可信局域网中使用并尽快修改", "auth", "error")
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    record_log(f"游戏服务器总控正在监听 {HOST}:{PORT}")
    threading.Thread(target=backup_scheduler, name="backup-scheduler", daemon=True).start()
    server.serve_forever()
