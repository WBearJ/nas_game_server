# 群晖 NAS Minecraft NeoForge 服务器

这是一套适用于群晖 DSM 7 Container Manager 的 Minecraft Java 模组服务器配置。默认组合为 **Minecraft 26.2 + NeoForge 26.2.0.62 + Java 25**，地图、配置和玩家数据会持久化到 `data/`。

> 这里使用成熟的 `itzg/minecraft-server` 镜像，因此不需要自行维护 Dockerfile。首次启动时容器会下载 Mojang 服务端和 NeoForge；请确保 NAS 能访问相关下载站点。

## 目录说明

```text
minecraft-synology/
├── compose.yaml       # Container Manager 项目配置
├── .env               # 版本、内存、端口等参数
├── installer/         # 预下载的 NeoForge 安装器
├── mods/              # 把兼容的模组 jar 放在这里
└── data/              # 世界、服务端配置、日志等持久数据
```

## 部署前修改

打开 `.env`，至少检查以下项目：

1. `MEMORY=14G`：这是 Java 堆上限，不是平时实际占用。家庭模组服实测大约 2–4 GB。NAS 总内存 20 GB 时，给 DSM 和文件缓存留出余量即可。
2. `OPS`：可填写管理员的正版 Java 版用户名，多个名字用英文逗号分隔。
3. 可选启用白名单：设置 `ENABLE_WHITELIST=TRUE`，并在 `WHITELIST` 填写允许加入的用户名。
4. `EULA=TRUE` 表示接受 [Minecraft EULA](https://aka.ms/MinecraftEULA)；如不同意，请不要启动。

中国大陆网络若无法稳定访问 NeoForge Maven，可在 `.env` 的 `PROXY` 填入 NAS 能访问的 HTTP 代理，格式为 `主机:端口`。代理运行在 NAS 本机且允许相关连接时可使用 `127.0.0.1:端口`；代理运行在路由器或另一台电脑时填写它的局域网 IP，且必须开启“允许局域网连接”。

本项目默认从 `installer/neoforge-26.2.0.62-installer.jar` 使用本地安装器。请确保该文件随项目一起上传；如果升级 NeoForge，需要同时修改 `.env` 中的 `NEOFORGE_VERSION`、`NEOFORGE_INSTALLER` 和安装器文件名。

如遇到 `Permission denied`，通过 SSH 执行 `id 你的群晖用户名`，把输出中的 `uid` 和 `gid` 分别填入 `PUID`、`PGID`。

## 安装模组

把 `.jar` 文件放进 `mods/`。模组必须与 **Minecraft 26.2、NeoForge 和 Java 25** 同时兼容，不能混放 Forge 或 Fabric 模组。

许多内容型模组需要玩家客户端安装完全相同的版本和依赖。仅客户端模组不要放到服务器。每次增删或更新模组后，在 Container Manager 中重启项目。

## 在群晖 Container Manager 中启动

1. 将整个 `minecraft-synology` 文件夹上传到群晖，例如 `/volume1/docker/minecraft`。
2. 打开 **Container Manager → 项目 → 新增**。
3. 项目名称填写 `minecraft`，路径选择上面的文件夹，并使用现有的 `compose.yaml`。
4. 构建并启动项目。首次启动需要下载文件，通常比后续启动慢。
5. 在项目日志看到 `Done` 后，用 Java 版客户端连接 `NAS局域网IP:25566`。

如果群晖项目界面没有读取 `.env`，可在项目的 Compose 内容中使用默认值；本配置已为所有变量提供默认值。

## 命令行管理（可选）

在此目录执行：

```bash
docker compose up -d
docker compose ps
docker compose logs -f minecraft
docker compose restart minecraft
docker compose stop
```

在游戏控制台执行命令（当前主机网络模式已关闭 RCON）：

```bash
docker exec --user 1000 minecraft-neoforge mc-send-to-console list
docker exec --user 1000 minecraft-neoforge mc-send-to-console say Server maintenance in 5 minutes
docker exec --user 1000 minecraft-neoforge mc-send-to-console whitelist add PlayerName
docker exec --user 1000 minecraft-neoforge mc-send-to-console op PlayerName
```

## 局域网连接

当前配置使用主机网络模式，Minecraft 直接监听 TCP `25566`，RCON 已关闭。用 Java 版客户端连接 `NAS局域网IP:25566`。

## 备份与升级

`data/` 是必须备份的目录。可用群晖 Hyper Backup 或快照定期备份它。做一致性最强的冷备份时，先停止项目，备份完成后再启动。

升级镜像前先备份：在 Container Manager 中重新拉取镜像并重建项目即可。不要直接跨大版本修改 `VERSION`；Minecraft、NeoForge、Java、世界和每个模组都必须兼容。本配置使用 `stable-java25`，避免跟随每日构建镜像。

## 常见问题

- **容器持续重启**：先查看日志；通常是模组版本错误、缺少前置依赖、内存不足或文件权限问题。
- **客户端提示模组不匹配**：确保客户端与服务端的 Minecraft、NeoForge、模组及依赖版本一致。
- **改了模组但未生效**：确认 jar 位于项目的 `mods/`，然后重启容器。不要只改 `data/mods/`，因为启动时会按 `mods/` 同步。
