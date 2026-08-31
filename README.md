# 群晖 NAS 游戏服务器总控

**简体中文** | [English](README.en.md) | [繁體中文](README.zh-TW.md) | [日本語](README.ja.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

该项目采用“总控常驻、游戏按需启动”的方式运行。NAS 或项目首次启动时只有 `nas-game-controller` 自动启动；Minecraft 和以后注册的其他游戏服务都不会自动启动。游戏容器由网页端创建和控制，并统一使用 `restart: no`，因此 NAS 重启后仍保持停止，直到你再次点击启动。自动备份由总控内部定时器负责，不需要额外的备份容器。

**文档目录**

<pre>
nas_game_server
├── <a href="#guide">使用教程</a>
├── <a href="#resources">资源占用</a>
├── <a href="#layout">目录结构</a>
│   ├── <a href="LICENSE">LICENSE</a>
│   ├── <a href="compose.yaml">compose.yaml</a>
│   ├── <a href=".env.example">.env.example</a>
│   ├── <a href="controller/">controller/</a>
│   │   ├── <a href="controller/Dockerfile">Dockerfile</a>
│   │   ├── <a href="controller/server.py">server.py</a>
│   │   ├── <a href="controller/games.json">games.json</a>
│   │   └── <a href="controller/static/">static/</a>
│   ├── <a href="minecraft/">minecraft/</a> · <a href="minecraft/README.md">说明</a>
│   ├── <a href="palworld/">palworld/</a> · <a href="palworld/README.md">说明</a>
│   ├── <a href="terraria/">terraria/</a> · <a href="terraria/README.md">说明</a>
│   └── <a href="zomboid/">zomboid/</a> · <a href="zomboid/README.md">说明</a>
├── <a href="#deploy">部署说明</a>
├── <a href="#accounts">管理账号</a>
├── <a href="#runtime">运行逻辑</a>
├── <a href="#details">网页详情与玩家管理</a>
├── <a href="#register">注册其他游戏</a>
├── <a href="#security">安全说明</a>
├── <a href="#disclaimer">责任说明</a>
└── <a href="#license">开源协议</a>
</pre>

<a id="guide"></a>
## 使用教程

1. 把整个项目复制到 NAS 的一个文件夹，例如 `/volume1/docker/nas_game_server`。
2. 把 [`.env.example`](.env.example) 复制为 `.env`。路径如果不是 `/volume1/docker/nas_game_server`，把其中的 `HOST_PROJECT_PATH` 改成实际路径。
3. 打开群晖 **Container Manager → 项目**，点 **新增**，路径选刚复制的项目文件夹，再点 **添加**。构建并启动后，只会运行总控 `nas-game-controller`。
4. 浏览器打开 `http://NAS的局域网IP:8088` 进入管理页。默认账号 `admin`，默认密码 `admin123`。
5. 在管理页点击某个游戏的「启动」。第一次会创建对应容器，之后可随时停止或再启动。

<a id="resources"></a>
## 资源占用

家庭局域网实测大约如下。`.env` 里的 `MEMORY=14G`、`PZ_MAX_RAM=6G` 是上限，不是平时实际占用。

| 游戏 | 实际内存 | 说明 |
| --- | --- | --- |
| Minecraft Java（NeoForge） | 约 2–4 GB | 随模组和在线人数上升 |
| 幻兽帕鲁 | 约 2 GB | 玩家和建筑增多后会再涨 |
| Terraria（TShock） | 约 400 MB | 最轻 |
| Project Zomboid | 默认 Java 堆上限 6 GB | 首次启动还会下载服务端 |

20 GB 内存的 NAS 可以同时开 Minecraft、幻兽帕鲁和 Terraria。再加上 Project Zomboid 时注意总占用，避免 DSM 开始使用交换分区。

<a id="layout"></a>
## 目录结构

点击文件名可直接打开对应内容。`data/`、`backups/` 等运行时目录首次启动游戏时自动创建，仓库里默认不包含。

- [`LICENSE`](LICENSE) — MIT 开源协议
- [`compose.yaml`](compose.yaml) — 只启动网页总控
- [`.env.example`](.env.example) — 管理账号、NAS 路径和游戏参数模板，复制为 `.env` 后填写
- `config/game-settings.json` — 网页保存的游戏常用配置（运行后生成）
- [`controller/`](controller/)
  - [`Dockerfile`](controller/Dockerfile)
  - [`server.py`](controller/server.py) — Docker 控制 API 与静态文件服务
  - [`games.json`](controller/games.json) — 游戏、数据路径和容器注册表
  - [`static/`](controller/static/) — 网页控制面板与本地游戏图标
- [`minecraft/`](minecraft/) — [说明](minecraft/README.md)
  - `data/` — 世界和服务端数据
  - [`mods/`](minecraft/mods/) — NeoForge 模组
  - [`installer/`](minecraft/installer/) — 离线 NeoForge 安装器
  - `backups/` — 自动与手动备份，只保留 latest
- [`palworld/`](palworld/) — [说明](palworld/README.md)
  - `data/` — Steam 服务端、配置与世界存档
  - `backups/` — 帕鲁最新备份
- [`terraria/`](terraria/) — [说明](terraria/README.md)
  - `data/` — 世界、TShock 配置与插件
  - `backups/` — Terraria 最新备份
- [`zomboid/`](zomboid/) — [说明](zomboid/README.md)
  - `data/` — 存档、配置和 Workshop 数据
  - `server-files/` — Build 42 服务端文件
  - `backups/` — Project Zomboid 最新备份

<a id="deploy"></a>
## 部署说明

若旧的 `minecraft-neoforge` 项目仍在运行，先备份并确认世界位于 `minecraft/data`，再停止并删除旧项目中的 `minecraft-neoforge` 容器。旧版本若还留有 `minecraft-backup` 容器，也可停止并删除；新版已经不再使用它。只删除容器，不要勾选删除数据，也不要删除 `minecraft/data`、`mods`、`installer` 或 `backups` 文件夹。

幻兽帕鲁内部 REST 管理密码 `PALWORLD_ADMIN_PASSWORD` 默认也是 `admin123`，首次部署可以直接启动。它与网页管理账号是两个独立配置。局域网游戏端口为 UDP `8211`，Steam 查询为 UDP `27015`。REST 管理端口 `8212` 仅在容器内部使用。

启动、停止和重启会在后台执行，网页不会因镜像下载或游戏初始化而长时间卡住。点击首页顶部的“日志”默认查看全部游戏；从游戏详情页点击“查看日志”会默认筛选当前游戏，也可以通过下拉框切换任意游戏。日志窗口每2秒自动刷新。

首次启动时间较长时，总控日志会依次显示目录检查、镜像下载层与进度、容器创建和启动指令；容器还没创建时不会有容器自身输出，这是正常阶段。若镜像仓库、网络、磁盘权限或端口发生错误，失败原因会记录在当前游戏的总控日志中。请以这些进度为准，不要重复点击启动。

总控会在首次启动 Minecraft 前自动创建 `minecraft/data`、`mods`、`installer` 和 `backups` 目录。为此，总控容器会把 `.env` 中的 `HOST_PROJECT_PATH` 挂载到内部的 `/host-project`；修改 NAS 项目路径后必须重新创建总控容器，不能只重启旧容器。

总控代码目录也会从 `${HOST_PROJECT_PATH}/controller` 直接只读挂载到容器的 `/app`。第一次升级到这个版本时，需要重新创建一次总控容器以加载新增挂载；以后替换 `controller` 中的文件后不必重新构建镜像，只需重启 `nas-game-controller`。如果使用 SSH，可执行：

```bash
cd /volume1/docker/nas_game_server
docker compose up -d --force-recreate controller
```

以后更新 `server.py`、`games.json` 或网页文件时执行 `docker restart nas-game-controller` 即可。网页文件更新后再对浏览器执行一次强制刷新，避免浏览器继续显示旧缓存。

<a id="accounts"></a>
## 管理账号

管理账号在根目录 `.env` 的 `CONTROL_ACCOUNTS_JSON` 中配置。默认配置为：

```env
CONTROL_ACCOUNTS_JSON={"admin":"admin123"}
CONTROL_SESSION_TTL_SECONDS=43200
```

支持同时配置多个账号，例如：

```env
CONTROL_ACCOUNTS_JSON={"admin":"换成高强度密码","family":"另一个密码","operator":"第三个密码"}
```

账号只能使用英文字母、数字、点、横线和下划线，最长32个字符。密码写在 JSON 字符串中，若包含双引号或反斜杠，需要按 JSON 规则转义。修改账号后执行 `docker compose up -d --force-recreate controller`；已有网页会话会立即失效，需要重新登录。

如果页面显示“需迁移”，说明仍存在同名旧容器。删除旧容器并保留数据后刷新页面即可；总控不会擅自接管或删除非本项目创建的容器。

如果网页端口冲突，修改 `.env` 的 `CONTROL_PORT` 后重新创建总控容器。不要再把 `minecraft/compose.yaml` 单独创建成常驻项目；它仅保留为旧部署参考。

<a id="runtime"></a>
## 运行逻辑

- 总控通过 `/var/run/docker.sock` 访问 Docker Engine，仅允许操作 `controller/games.json` 注册的固定容器名称。
- 网页提交操作后会立即返回；总控在后台串行执行，同一时间只允许一个游戏操作，并在页面和日志窗口中公开当前阶段。
- Minecraft 最长等待120秒优雅停止并保存世界。
- 每次启动或停止都会把游戏容器的 Docker 重启策略更新为 `no`。
- 所有游戏每72小时自动备份，也可在详情页手动备份。备份前会请求游戏保存世界，每个游戏都只保留最新一份；Project Zomboid 输出到 `zomboid/backups/zomboid-latest.tar.gz`。

<a id="details"></a>
## 网页详情与玩家管理

- 游戏库采用横向卡片，显示容器实时 CPU、内存占用和游戏目录总大小。
- 详情页显示容器健康状态、运行时间、世界名称、模式、难度、视距、验证方式、白名单和最近备份。
- 所有游戏详情页的“常用配置”均可直接编辑。保存后配置写入 `config/game-settings.json`；如果容器已经存在，总控会先保存世界，再重建容器并恢复原来的运行/停止状态。所有数据目录和备份都会保留。
- 游戏密码在网页中不会回显；留空表示保持原值，也可以勾选“清除现有密码”。新密码会以明文保存在 NAS 本地的 `config/game-settings.json`，不要将该文件公开分享。
- 在线人数从 Minecraft 状态协议读取；昵称、UUID、IP 和本次加入时间结合服务器当前日志与玩家数据解析。服务器隐藏玩家样本时，在线总数仍准确，但玩家列表可能不完整。
- 玩家操作仅开放踢出、授予/取消管理员以及加入/移出白名单；后端校验昵称并生成固定命令，不接受网页提交任意控制台命令。
- “保存世界”会执行 `save-all flush`；“立即备份”会在后台生成一致性压缩包。操作进度可在顶部日志窗口查看。
- 详情页的“Mod 管理”可以直接上传或删除 `.jar` 文件，单个文件最大 512 MB。文件写入 `minecraft/mods`；增删完成后需要重启 Minecraft 服务器才能加载新的 Mod 集合。
- 幻兽帕鲁详情页通过容器内部 REST 客户端显示服务端版本、世界 GUID、服务器 FPS、帧耗时、世界天数和常用配置；在线玩家显示昵称、账号、用户 ID、IP、等级、延迟、建筑数与坐标，可执行踢出或封禁。
- 幻兽帕鲁支持网页发送服务器公告、立即保存、手动备份、启动、停止、重启与日志查看。服务端更新由容器在启动时自动检查。
- Terraria 使用 TShock 稳定版镜像，详情页支持在线玩家、IP、TShock 账号组、踢出、封禁、服务器公告、保存世界和备份。局域网游戏端口为 TCP `7777`；管理端口 `7878` 只绑定 NAS 本机。
- Project Zomboid 使用 Build 42 自动更新镜像，详情页支持 RCON 在线玩家、踢出、封禁、公告、保存、备份以及 Workshop ID/Mod ID 配置。局域网游戏端口为 UDP `16261`–`16263`；RCON TCP `27016` 只绑定 NAS 本机。
- 各游戏内存占用见上文「资源占用」。网页游戏卡片也会显示实时 CPU、内存和目录大小。

<a id="register"></a>
## 注册其他游戏

在 `controller/games.json` 的 `games` 数组中添加一个游戏对象即可。每个游戏可以包含一个主服务和多个伴随服务，并使用 `startOrder` 控制启动顺序；停止时自动按相反顺序执行。通用字段包括：

```json
{
  "id": "game-id",
  "name": "页面显示名称",
  "description": "服务器类型",
  "version": "实际版本",
  "endpoint": "UDP/TCP 端口",
  "primary": "主容器名称",
  "containers": [
    {
      "name": "固定容器名称",
      "role": "server",
      "startOrder": 10,
      "image": "镜像名称",
      "networkMode": "host",
      "environment": {},
      "binds": []
    }
  ]
}
```

注册表支持 `${ENV_NAME:-default}` 环境变量模板。添加游戏所需的新变量时，也要在根 `compose.yaml` 中把变量传入总控容器。修改注册表后重启 `nas-game-controller` 即可加载；新游戏不会因注册而自动启动。

每个游戏还可以配置 `"icon": "/assets/文件名"`。图标应下载到 `controller/static/assets/`，避免 NAS 页面运行时依赖外网。Minecraft 当前使用 Microsoft Store 官方产品素材，来源记录在该目录的 `ATTRIBUTION.md`。

<a id="security"></a>
## 安全说明

Docker Socket 等同于较高的 NAS 容器管理权限。本项目没有提供任意容器名称、镜像或命令的网页输入，总控仅应在可信局域网中使用。账号密码登录成功后会签发12小时的临时会话；HTTP 不会加密登录密码或会话。

玩家 IP 属于敏感管理信息，详情页只应在可信局域网中使用。Minecraft 若为了兼容 PCL 离线账号设置 `ONLINE_MODE=FALSE`，玩家名称可被冒用。

<a id="disclaimer"></a>
## 责任说明

本项目仅供家庭或校园等**可信内网学习、自用**。作者不提供公网部署支持，也不对任何人的使用方式作担保。

将本项目或其中的游戏服务端部署到公网、用于商业运营、传播侵权内容，或违反游戏厂商 EULA、用户协议及当地法律法规的行为，**均由使用者自行承担全部责任**。由此产生的任何损失、处罚或纠纷，与作者和贡献者无关。

<a id="license"></a>
## 开源协议

本仓库由本项目编写的源代码、Compose 配置和文档采用 [MIT License](LICENSE)，可自由使用、修改和再分发。

以下内容**不在** MIT 授权范围内，仍归各权利人所有：

- Minecraft、幻兽帕鲁、Terraria、Project Zomboid 的游戏、服务端、模组和存档（运行时由镜像或 Steam 下载，请遵守对应 EULA / 用户协议）
- [`controller/static/assets/`](controller/static/assets/) 中的游戏图标，来源见 [ATTRIBUTION.md](controller/static/assets/ATTRIBUTION.md)
- 第三方 Docker 镜像（如 `itzg/minecraft-server`、帕鲁 / Terraria / Zomboid 镜像），按其各自协议使用

本项目与上述游戏厂商无关，也不是它们的官方产品。
