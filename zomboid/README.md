# Project Zomboid 数据目录

- `data/`：存档、服务器配置、账号数据库和 Workshop 数据
- `server-files/`：Build 42 服务端安装文件
- `backups/zomboid-latest.tar.gz`：总控创建的最新备份

首次从网页启动时总控会自动创建目录并下载服务端文件。容器以 UID 1000 运行，请保证这些目录允许项目配置的用户写入。

Build 42 默认 Java 堆为 6 GB（`PZ_MAX_RAM=6144m`，网页可选 4 / 6 / 8 GB），加上原生开销运行时大约 5–9 GB。首次下载服务端约 10–15 GB，存档随探索增长常见 2–10 GB，Workshop 模组另计。CPU 建议 4 核且偏单核。20 GB NAS 不要与 Minecraft 或幻兽帕鲁同时运行；可与 Terraria 同开。
