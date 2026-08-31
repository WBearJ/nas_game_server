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

## Recommended hardware and resource use

This project is tuned for a home LAN: the controller stays running, and game servers start on demand. Reserve about **4–6 GB** of RAM for DSM, Docker, and file cache. Do not assign all physical memory to games. Dedicated servers in this repo are x86_64; ARM Synology models generally will not run them.

### NAS hardware

| Item | Minimum | Recommended |
| --- | --- | --- |
| CPU | x86_64 quad-core | 6+ cores with strong single-thread performance (Intel / AMD) |
| RAM | 16 GB | **20 GB or more** (defaults assume a 20 GB NAS and `MEMORY=14G` for Minecraft) |
| Storage | HDD is acceptable only for light servers such as Terraria | **SSD / NVMe**. Palworld and Project Zomboid write saves frequently; HDDs can stutter or corrupt worlds |
| Free space | 40 GB | **80 GB or more** (Docker images + Steam server files + worlds + one backup each) |
| Network | Gigabit LAN | Gigabit LAN; add stable upload if you host over the internet |

With 32 GB or more, you can keep Minecraft at `12G` alongside Terraria, or raise Project Zomboid to 8 GB. Even then, do not run two heavy servers at once (Minecraft, Palworld, and Project Zomboid should not overlap).

### Per-game resources

Figures below assume a home group of 2–10 players and this repo’s default player caps. Disk use grows with worlds, mods, and backups; each game keeps only the latest archive.

| | Web controller | Minecraft Java (NeoForge) | Palworld | Terraria (TShock) | Project Zomboid (Build 42) |
| --- | --- | --- | --- | --- | --- |
| RAM in use | About 100–300 MB | About 12–16 GB | About 8–16 GB | About 0.5–2 GB | About 5–9 GB |
| Repo default | Always on | `MEMORY=14G` | No container memory cap; grows with players and bases | About 1 GB for 8 players on a medium world | `PZ_MAX_RAM=6144m` (6 GB Java heap; 4 / 6 / 8 GB in the UI) |
| First-start disk | Image about 0.2–0.5 GB | Image 1–2 GB; server + mods about 2–5 GB | Steam server about 12–20 GB | Image about 0.5–1 GB | Steam server about 10–15 GB |
| Ongoing disk | Negligible | Worlds often 2–10 GB+ | World about 1–5 GB | World 50–400 MB | Saves about 2–10 GB, plus Workshop mods |
| CPU | Very low | 2–4 cores; mods stress single-thread performance | 4+ cores | 1–2 cores | 4 cores, single-thread heavy |
| Default players | — | 10 | 16 | 8 | 8 |
| 20 GB NAS | Always fine | One heavy server; Terraria can share if you lower Minecraft to `12G` | One heavy server; Terraria can share | Can run with any one heavy server | One heavy server; Terraria can share |

**On a 20 GB NAS, run at the same time:**

- Yes: controller + any one heavy server + Terraria
- No: Minecraft + Palworld; Minecraft + Project Zomboid; Palworld + Project Zomboid; all three heavy servers

If RAM runs out, DSM starts swapping or kills containers. That shows up as stuttering, corrupt saves, or restart loops. Stop the current heavy server in the web UI before starting another.

If other memory-heavy packages are running, lower Minecraft `MEMORY` from `14G` to `12G` in `.env`. Palworld officially recommends 16 GB; 8 GB will boot but is prone to out-of-memory crashes. Project Zomboid downloads server files on first start; Java heap can be set to 4 / 6 / 8 GB in the UI.

## Deploy on Synology

1. Upload the entire directory to `/volume1/docker/nas_game_server`. If you use another path, update `HOST_PROJECT_PATH` in `.env`.
2. Open `.env` and verify the admin accounts, `EULA=TRUE`, memory, ports, and Minecraft options. The defaults are username `admin` and password `admin123`. See **Recommended hardware and resource use** for RAM and disk.
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
- See **Recommended hardware and resource use** for RAM, disk, and which servers may run together. Game cards also show live CPU, memory, and directory size.

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
