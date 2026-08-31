# Project Zomboid 数据目录

- `data/`：存档、服务器配置、账号数据库和 Workshop 数据
- `server-files/`：Build 42 服务端安装文件
- `backups/zomboid-latest.tar.gz`：总控创建的最新备份

首次从网页启动时总控会自动创建目录并下载服务端文件。容器以 UID 1000 运行，请保证这些目录允许项目配置的用户写入。默认 Java 堆上限 6 GB（`PZ_MAX_RAM`），可在网页里改成 4 / 6 / 8 GB。
