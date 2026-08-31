import copy
import importlib.util
import io
import tarfile
import tempfile
import time
import unittest
from pathlib import Path
from unittest import mock


SPEC = importlib.util.spec_from_file_location("game_controller", Path(__file__).with_name("server.py"))
SERVER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SERVER)


class FakeDocker:
    def inspect(self, _name):
        return None


class FakeManagedDocker:
    def __init__(self):
        self.commands = []

    def inspect(self, _name):
        return {
            "State": {"Status": "running"},
            "Config": {"Labels": {"nas-game-server.managed": "true", "nas-game-server.game": "minecraft"}}
        }

    def exec_command(self, name, command, user=None):
        self.commands.append((name, command, user))
        return ""


class FakePalworldDocker:
    def __init__(self):
        self.commands = []

    def inspect(self, _name):
        return {
            "State": {"Status": "running"},
            "Config": {"Labels": {"nas-game-server.managed": "true", "nas-game-server.game": "palworld"}}
        }

    def exec_command(self, name, command, user=None):
        self.commands.append((name, command, user))
        return '{"ok":true}'


class ControllerTests(unittest.TestCase):
    def setUp(self):
        self.original_mount = SERVER.HOST_PROJECT_MOUNT
        self.original_docker = SERVER.DOCKER
        self.original_accounts = SERVER.ACCOUNTS
        self.original_start_verify = SERVER.START_VERIFY_SECONDS
        SERVER.PLAYER_EVENTS_CACHE.clear()
        SERVER.RUNTIME_METRICS_CACHE.clear()
        SERVER.PALWORLD_DETAIL_CACHE.clear()
        SERVER.TERRARIA_DETAIL_CACHE.clear()
        SERVER.ZOMBOID_DETAIL_CACHE.clear()
        SERVER.SESSIONS.clear()
        SERVER.LOGIN_FAILURES.clear()
        SERVER.MINECRAFT_CATALOG_CACHE["payload"] = None
        SERVER.MINECRAFT_CATALOG_CACHE["time"] = 0
        SERVER.GAME_LAST_ERROR.clear()
        SERVER.START_VERIFY_SECONDS = 0

    def tearDown(self):
        SERVER.HOST_PROJECT_MOUNT = self.original_mount
        SERVER.DOCKER = self.original_docker
        SERVER.ACCOUNTS = self.original_accounts
        SERVER.START_VERIFY_SECONDS = self.original_start_verify
        SERVER.PLAYER_EVENTS_CACHE.clear()
        SERVER.RUNTIME_METRICS_CACHE.clear()
        SERVER.PALWORLD_DETAIL_CACHE.clear()
        SERVER.TERRARIA_DETAIL_CACHE.clear()
        SERVER.ZOMBOID_DETAIL_CACHE.clear()
        SERVER.SESSIONS.clear()
        SERVER.LOGIN_FAILURES.clear()
        SERVER.MINECRAFT_CATALOG_CACHE["payload"] = None
        SERVER.MINECRAFT_CATALOG_CACHE["time"] = 0
        SERVER.GAME_LAST_ERROR.clear()

    def test_multiple_accounts_create_independent_sessions(self):
        SERVER.ACCOUNTS = {"admin": "admin123", "operator": "another-password"}
        first = SERVER.authenticate_account("admin", "admin123", "127.0.0.1")
        second = SERVER.authenticate_account("operator", "another-password", "127.0.0.2")
        self.assertEqual(SERVER.session_account(first), "admin")
        self.assertEqual(SERVER.session_account(second), "operator")
        SERVER.revoke_session(first)
        self.assertIsNone(SERVER.session_account(first))
        self.assertEqual(SERVER.session_account(second), "operator")

    def test_invalid_account_password_is_rejected(self):
        SERVER.ACCOUNTS = {"admin": "admin123"}
        with self.assertRaises(SERVER.DockerError) as context:
            SERVER.authenticate_account("admin", "wrong", "127.0.0.3")
        self.assertEqual(context.exception.status, 401)

    def test_game_library_is_empty_before_games_are_added(self):
        with tempfile.TemporaryDirectory() as directory:
            SERVER.HOST_PROJECT_MOUNT = Path(directory)
            self.assertEqual(SERVER.read_added_game_ids(), [])
            self.assertEqual(SERVER.added_games(), [])

    def test_game_library_persists_added_games_in_catalog_order(self):
        with tempfile.TemporaryDirectory() as directory:
            SERVER.HOST_PROJECT_MOUNT = Path(directory)
            selected = [SERVER.GAMES[-1]["id"], SERVER.GAMES[0]["id"], SERVER.GAMES[-1]["id"]]
            SERVER.persist_added_game_ids(selected)
            self.assertEqual(SERVER.read_added_game_ids(), selected[:2])
            self.assertEqual(
                [game["id"] for game in SERVER.added_games()],
                [game["id"] for game in SERVER.GAMES if game["id"] in set(selected)]
            )

    def test_game_library_ignores_unknown_catalog_entries(self):
        with tempfile.TemporaryDirectory() as directory:
            SERVER.HOST_PROJECT_MOUNT = Path(directory)
            store = SERVER.game_library_store_path()
            store.parent.mkdir(parents=True)
            store.write_text('{"games":["unknown-game"]}\n', encoding="utf-8")
            self.assertEqual(SERVER.read_added_game_ids(), [])

    def test_docker_stream_decode(self):
        payload = (
            b"\x01\x00\x00\x00\x00\x00\x00\x05hello"
            b"\x02\x00\x00\x00\x00\x00\x00\x05world"
        )
        self.assertEqual(SERVER.DockerClient.decode_output(payload), "helloworld")

    def test_container_stats_calculation(self):
        client = SERVER.DockerClient("unused")
        client.inspect = lambda _name: {"State": {"Status": "running"}}
        client._request = lambda *_args, **_kwargs: {
            "cpu_stats": {
                "cpu_usage": {"total_usage": 300},
                "system_cpu_usage": 2000,
                "online_cpus": 2
            },
            "precpu_stats": {
                "cpu_usage": {"total_usage": 200},
                "system_cpu_usage": 1000
            },
            "memory_stats": {
                "usage": 1000,
                "limit": 2000,
                "stats": {"inactive_file": 100}
            }
        }
        self.assertEqual(client.stats("minecraft"), {
            "cpuPercent": 20.0,
            "memoryBytes": 900,
            "memoryLimitBytes": 2000
        })

    def test_container_stats_uses_previous_one_shot_sample(self):
        client = SERVER.DockerClient("unused")
        client.inspect = lambda _name: {"State": {"Status": "running"}}
        samples = iter([
            {
                "cpu_stats": {
                    "cpu_usage": {"total_usage": 1000000000},
                    "online_cpus": 2
                },
                "precpu_stats": {},
                "memory_stats": {"usage": 1000, "limit": 2000, "stats": {}}
            },
            {
                "cpu_stats": {
                    "cpu_usage": {"total_usage": 2000000000},
                    "online_cpus": 2
                },
                "precpu_stats": {},
                "memory_stats": {"usage": 1000, "limit": 2000, "stats": {}}
            }
        ])
        client._request = lambda *_args, **_kwargs: next(samples)

        with mock.patch.object(SERVER.time, "monotonic_ns", side_effect=[1000000000, 2000000000]):
            self.assertEqual(client.stats("minecraft")["cpuPercent"], 0.0)
            self.assertEqual(client.stats("minecraft")["cpuPercent"], 100.0)

    def test_container_create_publishes_only_declared_udp_ports(self):
        client = SERVER.DockerClient("unused")
        client.ensure_image = lambda *_args: None
        captured = {}

        def request(_method, _path, body=None, **_kwargs):
            captured.update(body or {})
            return {"Id": "container-id"}

        client._request = request
        client.create_container(
            {"id": "palworld"},
            {
                "name": "palworld-server",
                "image": "example/palworld:latest",
                "ports": [
                    {"containerPort": "8211/udp", "hostPort": "8211"},
                    {"containerPort": "27015/udp", "hostPort": "27015"}
                ]
            }
        )
        self.assertEqual(set(captured["ExposedPorts"]), {"8211/udp", "27015/udp"})
        self.assertNotIn("8212/tcp", captured["HostConfig"]["PortBindings"])

    def test_terraria_container_keeps_management_port_local(self):
        client = SERVER.DockerClient("unused")
        client.ensure_image = lambda *_args: None
        captured = {}

        def request(_method, _path, body=None, **_kwargs):
            captured.update(body or {})
            return {"Id": "container-id"}

        client._request = request
        game = next(item for item in SERVER.GAMES if item["id"] == "terraria")
        client.create_container(game, game["containers"][0])
        bindings = captured["HostConfig"]["PortBindings"]
        self.assertEqual(bindings["7777/tcp"][0]["HostIp"], "0.0.0.0")
        self.assertEqual(bindings["7878/tcp"][0]["HostIp"], "127.0.0.1")
        self.assertIn("-rest-enabled", captured["Cmd"])

    def test_image_pull_reports_progress_to_game_log(self):
        client = SERVER.DockerClient("unused")
        client._request = mock.Mock(side_effect=SERVER.DockerError(404, "missing"))
        client._stream_request = lambda _method, _path, callback, timeout=0: callback({
            "status": "Downloading",
            "id": "layer1234567890",
            "progress": "10MB/20MB"
        })
        messages = []
        with mock.patch.object(SERVER, "record_log", side_effect=lambda message, source="controller", level="info": messages.append((message, source))):
            client.ensure_image("example/palworld:latest", "palworld")
        self.assertTrue(any("10MB/20MB" in message for message, _source in messages))
        self.assertTrue(all(source == "palworld" for _message, source in messages))

    def test_recent_logs_include_game_metadata_for_missing_containers(self):
        SERVER.DOCKER = FakeDocker()
        payload = SERVER.recent_logs(20)
        game_ids = {container["gameId"] for container in payload["containers"]}
        self.assertIn("minecraft", game_ids)
        self.assertIn("palworld", game_ids)
        self.assertIn("terraria", game_ids)
        self.assertIn("zomboid", game_ids)
        palworld = next(item for item in payload["containers"] if item["gameId"] == "palworld")
        self.assertIn("首次点击启动", palworld["logs"])

    def test_extract_json_output_ignores_log_prefix(self):
        payload = SERVER.extract_json_output("rest-cli: connected\n{\"players\":[]}")
        self.assertEqual(payload, {"players": []})

    def test_player_events_track_login_and_leave(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            log = root / "minecraft/data/logs/latest.log"
            log.parent.mkdir(parents=True)
            log.write_text(
                "[12:00:00] PlayerOne[/192.168.1.50:51234] logged in\n"
                "[12:01:00] PlayerTwo[/10.0.0.8:50000] logged in\n"
                "[12:02:00] PlayerTwo left the game\n",
                encoding="utf-8"
            )
            SERVER.HOST_PROJECT_MOUNT = root
            players = SERVER.player_events({"latestLogPath": "minecraft/data/logs/latest.log"})
            self.assertEqual(list(players), ["playerone"])
            self.assertEqual(players["playerone"]["ip"], "192.168.1.50")
            cached = SERVER.player_events({"latestLogPath": "minecraft/data/logs/latest.log"})
            self.assertEqual(cached, players)
            self.assertEqual(len(SERVER.PLAYER_EVENTS_CACHE), 1)

    def test_mod_upload_list_and_delete(self):
        with tempfile.TemporaryDirectory() as directory:
            SERVER.HOST_PROJECT_MOUNT = Path(directory)
            game = {"id": "minecraft", "modsPath": "minecraft/mods"}
            payload = b"test-mod-content"

            saved = SERVER.save_mod_upload(game, "example-mod.jar", io.BytesIO(payload), len(payload))
            self.assertEqual(saved["name"], "example-mod.jar")
            self.assertEqual(SERVER.mods_info(game)[0]["sizeBytes"], len(payload))

            SERVER.delete_mod(game, "example-mod.jar")
            self.assertEqual(SERVER.mods_info(game), [])

    def test_mod_filename_rejects_path_traversal(self):
        with self.assertRaises(SERVER.DockerError):
            SERVER.validate_mod_filename("../outside.jar")
        with self.assertRaises(SERVER.DockerError):
            SERVER.validate_mod_filename("not-a-mod.zip")

    def test_backup_replaces_latest_archive(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            data = root / "minecraft/data/world"
            data.mkdir(parents=True)
            (data / "level.dat").write_bytes(b"world-data")
            game = {
                "id": "minecraft",
                "name": "Minecraft",
                "primary": "minecraft-neoforge",
                "dataPath": "minecraft/data",
                "hostDirectories": ["minecraft/data", "minecraft/backups"],
                "backup": {
                    "directory": "minecraft/backups",
                    "filename": "minecraft-latest.tar.gz"
                },
                "containers": [{"name": "minecraft-neoforge"}]
            }
            SERVER.HOST_PROJECT_MOUNT = root
            SERVER.DOCKER = FakeDocker()
            SERVER.create_backup(game)
            archive_path = root / "minecraft/backups/minecraft-latest.tar.gz"
            self.assertTrue(archive_path.is_file())
            with tarfile.open(archive_path, "r:gz") as archive:
                self.assertIn("data/world/level.dat", archive.getnames())

    def test_player_action_rejects_invalid_name(self):
        with self.assertRaises(SERVER.DockerError):
            SERVER.run_player_action({}, "bad name", "kick")

    def test_player_action_uses_fixed_console_command(self):
        docker = FakeManagedDocker()
        SERVER.DOCKER = docker
        game = {
            "id": "minecraft",
            "primary": "minecraft-neoforge",
            "containers": [{
                "name": "minecraft-neoforge",
                "environment": {"UID": "1000"}
            }]
        }
        message = SERVER.run_player_action(game, "PlayerOne", "op")
        self.assertIn("授予管理员", message)
        self.assertEqual(
            docker.commands,
            [("minecraft-neoforge", ["mc-send-to-console", "op PlayerOne"], "1000")]
        )

    def test_palworld_player_action_uses_container_rest_client(self):
        docker = FakePalworldDocker()
        SERVER.DOCKER = docker
        game = {
            "id": "palworld",
            "detailType": "palworld",
            "primary": "palworld-server",
            "containers": [{"name": "palworld-server"}]
        }
        message = SERVER.run_palworld_player_action(game, "steam_123456", "kick")
        self.assertIn("踢出", message)
        self.assertEqual(docker.commands[0][1][0:2], ["rest-cli", "kick"])
        self.assertIn('"userid":"steam_123456"', docker.commands[0][1][2])

    def test_terraria_player_action_uses_fixed_rest_endpoint(self):
        game = {"id": "terraria", "detailType": "terraria"}
        with mock.patch.object(SERVER, "terraria_rest") as rest:
            message = SERVER.run_terraria_player_action(game, "Player One", "kick")
        self.assertIn("踢出", message)
        rest.assert_called_once_with(
            game,
            "/v2/players/kick",
            {"player": "Player One", "reason": "由服务器管理员执行"}
        )

    def test_zomboid_config_keeps_rcon_local(self):
        client = SERVER.DockerClient("unused")
        client.ensure_image = lambda *_args: None
        captured = {}
        client._request = lambda _method, _path, body=None, **_kwargs: captured.update(body or {}) or {"Id": "container-id"}
        game = next(item for item in SERVER.GAMES if item["id"] == "zomboid")
        client.create_container(game, game["containers"][0])
        bindings = captured["HostConfig"]["PortBindings"]
        self.assertEqual(bindings["16261/udp"][0]["HostIp"], "0.0.0.0")
        self.assertEqual(bindings["27015/tcp"][0]["HostIp"], "127.0.0.1")

    def test_zomboid_players_and_fixed_moderation_command(self):
        online, players = SERVER.parse_zomboid_players("Players connected (2):\n-Alice\n-Bob Smith")
        self.assertEqual(online, 2)
        self.assertEqual([item["name"] for item in players], ["Alice", "Bob Smith"])
        game = {"id": "zomboid"}
        with mock.patch.object(SERVER, "zomboid_rcon") as rcon:
            message = SERVER.run_zomboid_player_action(game, "Alice", "kick")
        self.assertIn("踢出", message)
        rcon.assert_called_once_with(game, 'kickuser "Alice" -r "由服务器管理员移出"')

    def test_zomboid_empty_mod_lists_are_valid(self):
        game = next(item for item in SERVER.GAMES if item["id"] == "zomboid")
        values = SERVER.validate_settings(game, {"workshopIds": "", "modNames": ""})
        self.assertEqual(values, {"workshopIds": "", "modNames": ""})

    def test_settings_are_validated_persisted_and_applied(self):
        game = {
            "id": "sample",
            "primary": "sample-server",
            "containers": [{"name": "sample-server", "environment": {"MAX_PLAYERS": "8"}}],
            "settings": [{
                "key": "maxPlayers",
                "label": "最大玩家",
                "type": "integer",
                "min": 1,
                "max": 32,
                "target": {"kind": "environment", "name": "MAX_PLAYERS"}
            }]
        }
        values = SERVER.validate_settings(game, {"maxPlayers": 12})
        with tempfile.TemporaryDirectory() as directory:
            SERVER.HOST_PROJECT_MOUNT = Path(directory)
            SERVER.persist_settings(game, values)
            stored = SERVER.read_settings_store()
        self.assertEqual(stored["sample"]["maxPlayers"], "12")
        self.assertEqual(game["containers"][0]["environment"]["MAX_PLAYERS"], "12")

    def test_settings_reject_unknown_and_out_of_range_values(self):
        game = next(item for item in SERVER.GAMES if item["id"] == "minecraft")
        with self.assertRaises(SERVER.DockerError):
            SERVER.validate_settings(game, {"unknown": "value"})
        with self.assertRaises(SERVER.DockerError):
            SERVER.validate_settings(game, {"viewDistance": 100})

    def test_password_left_blank_is_not_overwritten(self):
        game = next(item for item in SERVER.GAMES if item["id"] == "palworld")
        with self.assertRaises(SERVER.DockerError):
            SERVER.validate_settings(game, {"serverPassword": ""})
        self.assertEqual(SERVER.validate_settings(game, {"serverPassword": None}), {"serverPassword": ""})

    def test_purge_game_removes_container_files_settings_and_library(self):
        class RecordingDocker:
            def inspect(self, _name):
                return {
                    "State": {"Status": "exited"},
                    "Config": {"Labels": {"nas-game-server.managed": "true", "nas-game-server.game": "minecraft"}}
                }

            def disable_auto_restart(self, _name):
                return None

            def stop(self, _name, _timeout=120):
                return None

            def remove(self, name):
                self.removed = name

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            SERVER.HOST_PROJECT_MOUNT = root
            data = root / "minecraft" / "data"
            mods = root / "minecraft" / "mods"
            backups = root / "minecraft" / "backups"
            data.mkdir(parents=True)
            mods.mkdir(parents=True)
            backups.mkdir(parents=True)
            (data / "world.dat").write_text("world", encoding="utf-8")
            (mods / "demo.jar").write_text("mod", encoding="utf-8")
            (backups / "latest.tar.gz").write_text("backup", encoding="utf-8")
            game = copy.deepcopy(next(item for item in SERVER.GAMES if item["id"] == "minecraft"))
            game["hostDirectories"] = ["minecraft/data", "minecraft/mods", "minecraft/backups"]
            game["backup"] = {"directory": "minecraft/backups"}
            SERVER.persist_added_game_ids(["minecraft"])
            SERVER.write_settings_store_update("minecraft", {"maxPlayers": "8"})
            docker = RecordingDocker()
            original = SERVER.DOCKER
            SERVER.DOCKER = docker
            try:
                SERVER.purge_game(game)
            finally:
                SERVER.DOCKER = original
            self.assertEqual(docker.removed, game["primary"])
            self.assertFalse(data.exists())
            self.assertFalse(mods.exists())
            self.assertFalse(backups.exists())
            self.assertEqual(SERVER.read_added_game_ids(), [])
            self.assertNotIn("minecraft", SERVER.read_settings_store())

    def test_neoforge_version_maps_to_minecraft_release(self):
        self.assertEqual(SERVER.neoforge_minecraft_version("47.1.79"), "1.20.1")
        self.assertEqual(SERVER.neoforge_minecraft_version("20.4.237"), "1.20.4")
        self.assertEqual(SERVER.neoforge_minecraft_version("21.1.133"), "1.21.1")
        self.assertEqual(SERVER.neoforge_minecraft_version("26.2.0.62"), "26.2")

    def test_loader_minimum_versions_are_enforced(self):
        self.assertTrue(SERVER.version_at_least("1.14.4", "1.14.4"))
        self.assertFalse(SERVER.version_at_least("1.12.2", "1.14.4"))
        self.assertTrue(SERVER.version_at_least("26.2", "1.20.1"))
        fabric = SERVER.filter_loader_versions(["1.12.2", "1.14.4", "1.20.1", "26.2"], "fabric")
        neoforge = SERVER.filter_loader_versions(["1.12.2", "1.14.4", "1.20.1", "26.2"], "neoforge")
        self.assertEqual(fabric, ["26.2", "1.20.1", "1.14.4"])
        self.assertEqual(neoforge, ["26.2", "1.20.1"])

    def test_minecraft_runtime_applies_loader_and_java_image(self):
        game = copy.deepcopy(next(item for item in SERVER.GAMES if item["id"] == "minecraft"))
        SERVER.apply_minecraft_runtime(game, {"loader": "fabric", "mcVersion": "1.20.1"})
        spec = SERVER.primary_spec_from_game(game)
        self.assertEqual(spec["environment"]["TYPE"], "FABRIC")
        self.assertEqual(spec["environment"]["VERSION"], "1.20.1")
        self.assertNotIn("NEOFORGE_INSTALLER", spec["environment"])
        self.assertEqual(spec["image"], "itzg/minecraft-server:java17")
        SERVER.apply_minecraft_runtime(game, {"loader": "vanilla", "mcVersion": "1.16.5"})
        spec = SERVER.primary_spec_from_game(game)
        self.assertEqual(spec["environment"]["TYPE"], "VANILLA")
        self.assertEqual(spec["image"], "itzg/minecraft-server:java8")
        self.assertFalse(game["supportsMods"])

    def test_safe_host_path_is_defined_before_games_load(self):
        source = Path(SERVER.__file__).read_text(encoding="utf-8")
        defined_at = source.find("def safe_host_path(")
        loaded_at = source.find("GAMES = load_games()")
        self.assertGreater(defined_at, -1)
        self.assertGreater(loaded_at, defined_at)

    def test_local_neoforge_installer_is_used_for_matching_version(self):
        game = copy.deepcopy(next(item for item in SERVER.GAMES if item["id"] == "minecraft"))
        with tempfile.TemporaryDirectory() as directory:
            installer = Path(directory) / "minecraft" / "installer"
            installer.mkdir(parents=True)
            (installer / "neoforge-21.1.200-installer.jar").write_bytes(b"old")
            (installer / "neoforge-26.2.0.62-installer.jar").write_bytes(b"jar")
            SERVER.HOST_PROJECT_MOUNT = Path(directory)
            SERVER.apply_minecraft_runtime(game, {"loader": "neoforge", "mcVersion": "26.2"})
        spec = SERVER.primary_spec_from_game(game)
        self.assertEqual(spec["environment"]["NEOFORGE_VERSION"], "26.2.0.62")
        self.assertEqual(
            spec["environment"]["NEOFORGE_INSTALLER"],
            "/installer/neoforge-26.2.0.62-installer.jar"
        )

    def test_local_neoforge_installer_falls_back_to_any_jar(self):
        game = copy.deepcopy(next(item for item in SERVER.GAMES if item["id"] == "minecraft"))
        with tempfile.TemporaryDirectory() as directory:
            installer = Path(directory) / "minecraft" / "installer"
            installer.mkdir(parents=True)
            (installer / "neoforge-21.1.200-installer.jar").write_bytes(b"jar")
            SERVER.HOST_PROJECT_MOUNT = Path(directory)
            SERVER.apply_minecraft_runtime(game, {"loader": "neoforge", "mcVersion": "26.2"})
        spec = SERVER.primary_spec_from_game(game)
        self.assertEqual(spec["environment"]["NEOFORGE_INSTALLER"], "/installer/neoforge-21.1.200-installer.jar")
        self.assertEqual(spec["environment"]["VERSION"], "1.21.1")

    def test_ensure_game_recreates_when_installer_env_added(self):
        game = copy.deepcopy(next(item for item in SERVER.GAMES if item["id"] == "minecraft"))

        class RecreateDocker:
            def __init__(self):
                self.removed = []
                self.created = []

            def inspect(self, _name):
                if self.created:
                    return None
                return {
                    "State": {"Status": "exited"},
                    "Config": {
                        "Labels": {
                            "nas-game-server.managed": "true",
                            "nas-game-server.game": "minecraft"
                        },
                        "Env": ["TYPE=NEOFORGE", "NEOFORGE_VERSION=latest", "VERSION=26.2"]
                    }
                }

            def create_container(self, _game, spec):
                self.created.append(spec["environment"].get("NEOFORGE_INSTALLER"))
                return {}

            def remove(self, name):
                self.removed.append(name)

            def disable_auto_restart(self, _name):
                return None

            def stop(self, _name, _timeout=120):
                return None

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            installer = root / "minecraft" / "installer"
            installer.mkdir(parents=True)
            (installer / "neoforge-26.2.0.62-installer.jar").write_bytes(b"jar")
            SERVER.HOST_PROJECT_MOUNT = root
            docker = RecreateDocker()
            SERVER.DOCKER = docker
            SERVER.ensure_game(game)
        self.assertEqual(docker.removed, ["minecraft-neoforge"])
        self.assertEqual(docker.created, ["/installer/neoforge-26.2.0.62-installer.jar"])

    def test_minecraft_settings_reject_version_below_loader_minimum(self):
        game = next(item for item in SERVER.GAMES if item["id"] == "minecraft")
        SERVER.MINECRAFT_CATALOG_CACHE["payload"] = {
            "versions": {
                "vanilla": ["26.2", "1.16.5", "1.12.2"],
                "forge": ["26.2", "1.16.5", "1.12.2"],
                "fabric": ["26.2", "1.16.5", "1.14.4"],
                "neoforge": ["26.2", "1.21.1", "1.20.1"]
            },
            "defaults": {"loader": "neoforge", "mcVersion": "26.2"}
        }
        SERVER.MINECRAFT_CATALOG_CACHE["time"] = time.monotonic()
        with self.assertRaises(SERVER.DockerError):
            SERVER.validate_settings(game, {"loader": "neoforge", "mcVersion": "1.16.5"})
        values = SERVER.validate_settings(game, {"loader": "fabric", "mcVersion": "1.16.5", "maxPlayers": 8})
        self.assertEqual(values["loader"], "fabric")
        self.assertEqual(values["mcVersion"], "1.16.5")

    def test_public_game_includes_start_error(self):
        game = next(item for item in SERVER.GAMES if item["id"] == "minecraft")
        SERVER.DOCKER = FakeDocker()
        SERVER.set_game_error(game["id"], "启动失败：镜像不存在")
        payload = SERVER.public_game(game)
        self.assertEqual(payload["error"], "启动失败：镜像不存在")
        SERVER.clear_game_error(game["id"])
        self.assertEqual(SERVER.public_game(game)["error"], "")

    def test_action_worker_stores_and_clears_start_error(self):
        game = copy.deepcopy(next(item for item in SERVER.GAMES if item["id"] == "minecraft"))
        SERVER.DOCKER = FakeDocker()
        SERVER.ACTION_LOCK.acquire()
        with mock.patch.object(SERVER, "run_action", side_effect=SERVER.DockerError(500, "镜像不存在")):
            SERVER.action_worker(game, "start")
        self.assertEqual(SERVER.public_game(game)["error"], "启动失败：镜像不存在")
        SERVER.ACTION_LOCK.acquire()
        with mock.patch.object(SERVER, "run_action"):
            SERVER.action_worker(game, "start")
        self.assertEqual(SERVER.public_game(game)["error"], "")

    def test_ensure_start_succeeded_raises_when_container_exits(self):
        class ExitedDocker:
            def inspect(self, _name):
                return {"State": {"Status": "exited", "ExitCode": 127, "Error": "executable file not found"}}

            def logs(self, _name, tail=40):
                return ""

        SERVER.DOCKER = ExitedDocker()
        with self.assertRaises(SERVER.DockerError) as context:
            SERVER.ensure_start_succeeded({"name": "minecraft-server"})
        self.assertIn("executable file not found", str(context.exception))


if __name__ == "__main__":
    unittest.main()
