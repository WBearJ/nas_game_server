# Synology NAS Game Server Controller

[简体中文](README.md) | **English** | [繁體中文](README.zh-TW.md) | [日本語](README.ja.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

This project keeps only the controller running and starts game servers on demand. When the NAS or project starts, only `nas-game-controller` starts automatically. Minecraft and every other registered game remain stopped until you start them from the web interface. Game containers use `restart: no`, so they remain stopped after a NAS reboot. Automatic backups are scheduled inside the controller and require no separate backup container.

**Contents**

<pre>
nas_game_server
├── <a href="#guide">Quick start</a>
├── <a href="#resources">Resource use</a>
├── <a href="#layout">Project layout</a>
│   ├── <a href="LICENSE">LICENSE</a>
│   ├── <a href="compose.yaml">compose.yaml</a>
│   ├── <a href=".env.example">.env.example</a>
│   ├── <a href="controller/">controller/</a>
│   │   ├── <a href="controller/Dockerfile">Dockerfile</a>
│   │   ├── <a href="controller/server.py">server.py</a>
│   │   ├── <a href="controller/games.json">games.json</a>
│   │   └── <a href="controller/static/">static/</a>
│   ├── <a href="minecraft/">minecraft/</a> · <a href="minecraft/README.md">notes</a>
│   ├── <a href="palworld/">palworld/</a> · <a href="palworld/README.md">notes</a>
│   ├── <a href="terraria/">terraria/</a> · <a href="terraria/README.md">notes</a>
│   └── <a href="zomboid/">zomboid/</a> · <a href="zomboid/README.md">notes</a>
├── <a href="#deploy">Deploy notes</a>
├── <a href="#accounts">Administrator accounts</a>
├── <a href="#runtime">Runtime behavior</a>
├── <a href="#details">Details and player management</a>
├── <a href="#register">Register another game</a>
├── <a href="#security">Security</a>
├── <a href="#disclaimer">Disclaimer</a>
└── <a href="#license">License</a>
</pre>

<a id="guide"></a>
## Quick start

1. Copy the whole project into a folder on the NAS, for example `/volume1/docker/nas_game_server`.
2. Copy [`.env.example`](.env.example) to `.env`. If the path is not `/volume1/docker/nas_game_server`, also set `HOST_PROJECT_PATH`.
3. Open **Container Manager → Project**, choose **Create**, set the path to that folder, then **Add**. After build and start, only `nas-game-controller` should run.
4. Open `http://NAS-LAN-IP:8088` in a browser. Default username `admin`, password `admin123`.
5. Select **Start** on a game. The first start creates its containers; later you can stop or start it again at any time.

<a id="resources"></a>
## Resource use

Figures below are from a home LAN. `MEMORY=14G` and `PZ_MAX_RAM=6G` in `.env` are ceilings, not typical use.

| Game | RAM in use | Notes |
| --- | --- | --- |
| Minecraft Java (NeoForge) | About 2–4 GB | Grows with mods and player count |
| Palworld | About 2 GB | Grows with players and bases |
| Terraria (TShock) | About 400 MB | Lightest |
| Project Zomboid | 6 GB Java heap cap by default | Also downloads server files on first start |

A 20 GB NAS can run Minecraft, Palworld, and Terraria together. Watch total use if you also start Project Zomboid, so DSM does not start swapping.

<a id="layout"></a>
## Project layout

Click a name to open that file or folder. Runtime directories such as `data/` and `backups/` are created on first start and are not stored in the repository.

- [`LICENSE`](LICENSE) — MIT license
- [`compose.yaml`](compose.yaml) — Starts only the web controller
- [`.env.example`](.env.example) — Template for admin accounts, NAS paths, and game options; copy to `.env`
- `config/game-settings.json` — Common settings saved from the web UI (created at runtime)
- [`controller/`](controller/)
  - [`Dockerfile`](controller/Dockerfile)
  - [`server.py`](controller/server.py) — Docker control API and static file server
  - [`games.json`](controller/games.json) — Game, data path, and container registry
  - [`static/`](controller/static/) — Web dashboard and local game icons
- [`minecraft/`](minecraft/) — [Notes](minecraft/README.md)
  - `data/` — World and server data
  - [`mods/`](minecraft/mods/) — NeoForge mods
  - [`installer/`](minecraft/installer/) — Offline NeoForge installer
  - `backups/` — Latest automatic or manual backup
- [`palworld/`](palworld/) — [Notes](palworld/README.md)
  - `data/` — Steam server, configuration, and world save
  - `backups/` — Latest Palworld backup
- [`terraria/`](terraria/) — [Notes](terraria/README.md)
  - `data/` — World, TShock configuration, and plugins
  - `backups/` — Latest Terraria backup
- [`zomboid/`](zomboid/) — [Notes](zomboid/README.md)
  - `data/` — Saves, configuration, and Workshop data
  - `server-files/` — Build 42 server files
  - `backups/` — Latest Project Zomboid backup

<a id="deploy"></a>
## Deploy notes

If an older `minecraft-neoforge` project is running, back it up, confirm that its world is in `minecraft/data`, then stop and remove the old `minecraft-neoforge` container. You may also remove the obsolete `minecraft-backup` container. Remove containers only: do not delete their data or the `minecraft/data`, `mods`, `installer`, or `backups` directories.

The Palworld REST administration password, `PALWORLD_ADMIN_PASSWORD`, also defaults to `admin123`. It is separate from the web admin password. The LAN game port is UDP `8211` and Steam queries use UDP `27015`. REST port `8212` is used only inside the container.

Start, stop, and restart operations run in the background. Open **Logs** from the home page to view all games, or open it from a game details page to preselect that game. The log view refreshes every two seconds. During a slow first start, controller logs show directory checks, image download progress, container creation, and the start command. Do not repeatedly select Start while this is in progress.

Before the first Minecraft start, the controller creates `minecraft/data`, `mods`, `installer`, and `backups`. The path in `HOST_PROJECT_PATH` is mounted at `/host-project`; after changing that path, recreate the controller container instead of merely restarting it.

The `${HOST_PROJECT_PATH}/controller` directory is mounted read-only at `/app`. Recreate the controller once when upgrading from a version without this mount. Afterward, replacing `server.py`, `games.json`, or web files requires only:

```bash
cd /volume1/docker/nas_game_server
docker restart nas-game-controller
```

Force-refresh the browser after updating web files to avoid stale cached assets.

<a id="accounts"></a>
## Administrator accounts

Configure accounts with `CONTROL_ACCOUNTS_JSON` in the root `.env`:

```env
CONTROL_ACCOUNTS_JSON={"admin":"admin123"}
CONTROL_SESSION_TTL_SECONDS=43200
```

Multiple accounts are supported:

```env
CONTROL_ACCOUNTS_JSON={"admin":"use-a-strong-password","family":"another-password","operator":"third-password"}
```

Usernames may contain letters, numbers, dots, hyphens, and underscores and are limited to 32 characters. Escape quotes and backslashes in passwords according to JSON rules. After changing accounts, run `docker compose up -d --force-recreate controller`. Existing sessions become invalid immediately.

“Migration required” means an unmanaged old container has the same name. Remove that container while keeping its data, then refresh. If the web port conflicts, change `CONTROL_PORT` in `.env` and recreate the controller. Do not deploy `minecraft/compose.yaml` as another permanent project; it remains only as a legacy reference.

<a id="runtime"></a>
## Runtime behavior

- The controller accesses Docker Engine through `/var/run/docker.sock` and can operate only fixed container names registered in `controller/games.json`.
- Web actions return immediately. The controller runs one game operation at a time and exposes its current stage in the dashboard and logs.
- Minecraft receives up to 120 seconds for a graceful world save and stop.
- Every start or stop sets the game container restart policy to `no`.
- Every game is backed up automatically every 72 hours and can also be backed up manually. A world save is requested first, and only the latest archive is retained. Project Zomboid uses `zomboid/backups/zomboid-latest.tar.gz`.

<a id="details"></a>
## Details and player management

- Game cards show live CPU, memory, and total game-directory size.
- Details show container health, uptime, world, mode, difficulty, view distance, authentication, allowlist, and latest backup.
- Common settings are editable for every game. They are stored in `config/game-settings.json`. If containers exist, the controller saves the world, recreates them, then restores their previous running or stopped state without deleting data or backups.
- Passwords are never displayed. Leave a password blank to keep it or select the clear option. New passwords are stored as plain text on the NAS in `config/game-settings.json`; never share that file publicly.
- Minecraft online counts use the status protocol. Names, UUIDs, IPs, and join times combine live status, logs, and player data. A server may hide player samples while still reporting an accurate count.
- Player actions are limited to kick, operator grant/revoke, and allowlist add/remove. The backend validates names and generates fixed commands; it does not accept arbitrary console commands.
- **Save world** runs `save-all flush`. **Back up now** creates a consistent archive in the background.
- Minecraft mods can be uploaded or removed from the details page. Only `.jar` files up to 512 MB are accepted; restart Minecraft after changing the mod set.
- Palworld details show server version, world GUID, FPS, frame time, world days, settings, and player account/IP/level/ping/building/location data. Players may be kicked or banned.
- Terraria uses a stable TShock image and supports players, IPs, account groups, kick, ban, announcements, saves, and backups. The LAN game port is TCP `7777`; management port `7878` is bound only to the NAS.
- Project Zomboid uses an automatically updated Build 42 image and supports RCON players, kick, ban, announcements, saves, backups, and Workshop/Mod IDs. LAN game ports are UDP `16261`–`16263`; RCON TCP `27016` is bound only to the NAS.
- See **Resource use** for typical RAM. Game cards also show live CPU, memory, and directory size.

<a id="register"></a>
## Register another game

Add a game object to the `games` array in `controller/games.json`. A game can contain one primary service and companion services. `startOrder` controls start order; stop order is reversed automatically.

```json
{
  "id": "game-id",
  "name": "Display name",
  "description": "Server type",
  "version": "Actual version",
  "endpoint": "UDP/TCP port",
  "primary": "primary-container-name",
  "containers": [
    {
      "name": "fixed-container-name",
      "role": "server",
      "startOrder": 10,
      "image": "image-name",
      "networkMode": "host",
      "environment": {},
      "binds": []
    }
  ]
}
```

The registry supports `${ENV_NAME:-default}` templates. Pass every new variable through the root `compose.yaml`. Restart `nas-game-controller` after editing the registry. Registering a game never starts it automatically. An optional `"icon": "/assets/file.png"` points to a local icon in `controller/static/assets/`; avoid runtime dependencies on external sites.

<a id="security"></a>
## Security

Docker Socket access effectively grants elevated container-management privileges. The UI does not accept arbitrary container names, images, or commands. Use the controller only on a trusted LAN. Successful login creates a temporary 12-hour session. Plain HTTP does not encrypt credentials or sessions.

Player IP addresses are sensitive. Open the details page only on a trusted LAN. If Minecraft uses `ONLINE_MODE=FALSE` for offline launchers, player names can be impersonated.

<a id="disclaimer"></a>
## Disclaimer

This project is intended only for **learning and personal use on a trusted home or campus LAN**. The authors do not support internet-facing deployments and make no warranty about how you use it.

If you publish this project or its game servers on the public internet, use it commercially, distribute infringing content, or violate a game publisher’s EULA, terms of use, or local law, **you accept full responsibility**. The authors and contributors are not liable for any resulting loss, penalty, or dispute.

<a id="license"></a>
## License

Source code, Compose files, and documentation in this repository are released under the [MIT License](LICENSE).

The following are **not** covered by that license and remain the property of their owners:

- Minecraft, Palworld, Terraria, and Project Zomboid games, dedicated servers, mods, and saves (downloaded at runtime; follow each product’s EULA / terms)
- Game icons in [`controller/static/assets/`](controller/static/assets/); see [ATTRIBUTION.md](controller/static/assets/ATTRIBUTION.md)
- Third-party Docker images (such as `itzg/minecraft-server` and the Palworld / Terraria / Zomboid images), which follow their own licenses

This project is independent and is not affiliated with or endorsed by those publishers.
