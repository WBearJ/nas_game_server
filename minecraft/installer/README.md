# NeoForge 本地安装器

本目录应包含：

`neoforge-26.2.0.62-installer.jar`

配置会将本目录只读挂载为容器内的 `/installer`，避免容器启动时先从 NeoForge Maven 查询并下载安装器。

安装器本身仍可能下载 Minecraft 和 NeoForge 的其他运行库；如这些下载也被网络重置，需要使用 HTTP 代理或在网络正常的电脑上完成完整服务端预安装。
