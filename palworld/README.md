# 幻兽帕鲁服务器数据

该游戏由网页总控按需创建和启动，不要把本目录单独添加为群晖 Container Manager 项目。

- `data/` 挂载到容器的 `/palworld/`，包含 Steam 服务端、配置和世界存档。
- `backups/palworld-latest.tar.gz` 是总控创建的世界存档备份，每次手动或自动备份都会覆盖上一份，不会重复打包可重新下载的 Steam 服务端文件。
- 游戏使用 UDP 8211，Steam 查询使用 UDP 27015；可以在根目录 `.env` 中修改。
- REST 管理接口只在容器内部使用，没有映射到 NAS 端口。

根目录 `.env` 中的 `PALWORLD_ADMIN_PASSWORD` 默认是 `admin123`，首次部署可以直接启动；正式使用时建议修改。更新服务器名称、密码、人数或倍率后，需要重新创建 `palworld-server` 容器才能把新环境变量应用到容器；数据目录不会因此删除。

帕鲁服务端占用较高。家庭 4–16 人时内存大约 8–16 GB（官方建议 16 GB，8 GB 能启动但容易内存不足）。首次启动会下载 Steam 服务端，约 12–20 GB；世界存档约 1–5 GB，并随建筑增长。CPU 建议 4 核以上，磁盘请用 SSD。20 GB 总内存的 NAS 不要与 Minecraft 或 Project Zomboid 同时运行；可与 Terraria 同开。换游戏前请在网页中先停止当前大型服。
