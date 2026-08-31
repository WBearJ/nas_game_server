# Synology NAS Game Server Controller

[简体中文](README.md) | **English** | [繁體中文](README.zh-TW.md) | [日本語](README.ja.md)

This project keeps only the controller running and starts game servers on demand. When the NAS or project starts, only `nas-game-controller` starts automatically. Minecraft and every other registered game remain stopped until you start them from the web interface. Game containers use `restart: no`, so they remain stopped after a NAS reboot. Automatic backups are scheduled inside the controller and require no separate backup container.

## Project layout

```text
nas_game_server/
├── compose.yaml              # Starts only the web controller
├── .env                      # Admin accounts, NAS paths, and game options
├── config/game-settings.json # Common settings saved from the web UI
├── controller/
│   ├── Dockerfile
│   ├── server.py             # Docker control API and static file server
│   ├── games.json            # Game, data path, and container registry
│   └── static/               # Web dashboard and local game icons
├── minecraft/
│   ├── data/                 # World and server data
│   ├── mods/                 # NeoForge mods
│   ├── installer/            # Offline NeoForge installer
│   └── backups/              # Latest automatic or manual backup
├── palworld/
│   ├── data/                 # Steam server, configuration, and world save
│   └── backups/              # Latest Palworld backup
├── terraria/
│   ├── data/                 # World, TShock configuration, and plugins
│   └── backups/              # Latest Terraria backup
└── zomboid/
    ├── data/                 # Saves, configuration, and Workshop data
    ├── server-files/         # Build 42 server files
    └── backups/              # Latest Project Zomboid backup
```

## Deploy on Synology

1. Upload the entire directory to `/volume1/docker/nas_game_server`. If you use another path, update `HOST_PROJECT_PATH` in `.env`.
2. Open `.env` and verify the admin accounts, `EULA=TRUE`, memory, ports, and Minecraft options. The defaults are username `admin` and password `admin123`.
3. If an older `minecraft-neoforge` project is running, back it up, confirm that its world is in `minecraft/data`, then stop and remove the old `minecraft-neoforge` container. You may also remove the obsolete `minecraft-backup` container. Remove containers only: do not delete their data or the `minecraft/data`, `mods`, `installer`, or `backups` directories.
4. Open **Container Manager → Project → Create**, use `nas-game-server` as the project name, select the project root, and use its `compose.yaml`.
5. Build and start the project. Only `nas-game-controller` should appear and run.
6. On a trusted LAN or VPN, open `http://NAS-LAN-IP:8088` and sign in with an account from `.env`.
7. Select **Start** for any game. The first start creates its containers; later you can start, stop, or restart it directly.

The Palworld REST administration password, `PALWORLD_ADMIN_PASSWORD`, also defaults to `admin123`. It is separate from the web admin password. Change both to different strong passwords for regular use. Palworld uses UDP `8211` and Steam queries use UDP `27015`. To allow internet players, open both ports in the router and Synology firewall. REST port `8212` is not published and must not be forwarded to the internet.

Start, stop, and restart operations run in the background. Open **Logs** from the home page to view all games, or open it from a game details page to preselect that game. The log view refreshes every two seconds. During a slow first start, controller logs show directory checks, image download progress, container creation, and the start command. Do not repeatedly select Start while this is in progress.

Before the first Minecraft start, the controller creates `minecraft/data`, `mods`, `installer`, and `backups`. The path in `HOST_PROJECT_PATH` is mounted at `/host-project`; after changing that path, recreate the controller container instead of merely restarting it.

The `${HOST_PROJECT_PATH}/controller` directory is mounted read-only at `/app`. Recreate the controller once when upgrading from a version without this mount. Afterward, replacing `server.py`, `games.json`, or web files requires only:

```bash
cd /volume1/docker/nas_game_server
docker restart nas-game-controller
```

Force-refresh the browser after updating web files to avoid stale cached assets.

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

Usernames may contain letters, numbers, dots, hyphens, and underscores and are limited to 32 characters. Escape quotes and backslashes in passwords according to JSON rules. After changing accounts, run `docker compose up -d --force-recreate controller`. Existing sessions become invalid immediately. The default password is suitable only for initial setup on a trusted LAN and should be changed promptly.

“Migration required” means an unmanaged old container has the same name. Remove that container while keeping its data, then refresh. If the web port conflicts, change `CONTROL_PORT` in `.env` and recreate the controller. Do not deploy `minecraft/compose.yaml` as another permanent project; it remains only as a legacy reference.

## Runtime behavior

- The controller accesses Docker Engine through `/var/run/docker.sock` and can operate only fixed container names registered in `controller/games.json`.
- Web actions return immediately. The controller runs one game operation at a time and exposes its current stage in the dashboard and logs.
- Minecraft receives up to 120 seconds for a graceful world save and stop.
- Every start or stop sets the game container restart policy to `no`.
- Every game is backed up automatically every 72 hours and can also be backed up manually. A world save is requested first, and only the latest archive is retained. Project Zomboid uses `zomboid/backups/zomboid-latest.tar.gz`.

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
- Terraria uses a stable TShock image and supports players, IPs, account groups, kick, ban, announcements, saves, and backups. Game port TCP `7777` may be published; management port `7878` is bound only to the NAS and must not be forwarded.
- Project Zomboid uses an automatically updated Build 42 image and supports RCON players, kick, ban, announcements, saves, backups, and Workshop/Mod IDs. Internet play needs UDP `16261`–`16263`; RCON TCP `27016` is NAS-local only.
- Palworld and Project Zomboid require substantial memory. On a 20 GB NAS, run large servers on demand and avoid running Minecraft, Palworld, and Project Zomboid simultaneously.

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

## Security

Docker Socket access effectively grants elevated container-management privileges. The UI does not accept arbitrary container names, images, or commands, but the controller must still be used only on a trusted LAN or VPN. Successful login creates a temporary 12-hour session. Plain HTTP does not encrypt credentials or sessions, so never expose port `8088` directly to the internet. For remote administration, use Tailscale or a trusted HTTPS reverse proxy.

Player IP addresses are sensitive. Open the details page only on a trusted LAN or VPN. If Minecraft uses `ONLINE_MODE=FALSE` for offline launchers, player names can be impersonated and the server should not be exposed directly to the internet.
