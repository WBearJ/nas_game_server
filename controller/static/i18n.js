(function () {
  "use strict";

  const supported = ["zh-CN", "en", "zh-TW", "ja"];
  const storageKey = "nasGameLanguage";

  const messages = {
    en: {
      "游戏服务器总控": "Game Server Control",
      "一处掌控。": "One place. Full control.",
      "你的游戏世界，随时待命。": "Your game worlds, ready when you are.",
      "登录": "Sign in",
      "使用管理账号登录，控制 NAS 上的游戏服务。": "Sign in with an administrator account to control the game services on your NAS.",
      "账号": "Username", "密码": "Password", "继续": "Continue",
      "游戏服务器": "Game servers", "日志": "Logs", "刷新": "Refresh", "退出": "Sign out",
      "服务": "Services", "游戏库": "Game library", "总控运行中": "Controller online",
      "我的游戏": "My games", "添加游戏": "Add game", "开始设置": "Get started", "还没有添加游戏": "No games added yet",
      "从游戏库中选择需要管理的服务器，添加后会显示在这里。": "Choose the servers you want to manage from the game library. Added games appear here.", "添加第一个游戏": "Add your first game",
      "返回我的游戏": "Back to my games", "选择要在这台 NAS 上管理的游戏服务器。": "Choose the game servers to manage on this NAS.", "可添加的游戏": "Available games", "添加到首页": "Add to home", "从首页移除": "Remove from home",
      "开始配置": "Configure", "初始化": "Setup", "初始化 Mod": "Initial mods", "还没有选择 Mod 文件。": "No mod files selected yet.",
      "先选择加载器和游戏版本，并可同时设置常用配置、上传 Mod。": "Choose a loader and game version first. You can also set common options and upload mods now.",
      "可选。原版不显示此项；模组服可在创建时上传 .jar，启动后生效。": "Optional. Hidden for vanilla. Modded servers can upload .jar files during creation; they apply after start.",
      "原版": "Vanilla", "游戏版本": "Game version", "Java 原版 / 模组服务器": "Java vanilla / modded server", "原版服务器": "Vanilla server",
      "Forge 模组服务器": "Forge modded server", "Fabric 模组服务器": "Fabric modded server",
      "原版不使用 Mod；切换加载器后只会列出该加载器支持的游戏版本": "Vanilla does not use mods. Changing the loader only lists versions that loader supports.",
      "版本列表来自 Mojang / 加载器官方元数据，并按加载器最低支持版本过滤": "Version lists come from Mojang and official loader metadata, filtered by each loader’s minimum supported version.",
      "无法加载配置": "Could not load setup",
      "游戏服务": "Game services", "返回游戏库": "Back to library", "刷新详情": "Refresh details",
      "只有总控随 NAS 自动启动，游戏服务按需运行。": "Only the controller starts with the NAS. Game services run on demand.",
      "实时输出": "Live output", "服务日志": "Service logs", "筛选": "Filter", "全部": "All",
      "关闭": "Close", "正在读取操作状态": "Reading operation status",
      "正在读取日志…": "Loading logs…",
      "显示所选游戏的总控进度和容器最近 500 行日志，每 2 秒自动刷新。": "Shows controller progress and the latest 500 container log lines for the selected game. Refreshes every 2 seconds.",
      "语言": "Language",
      "运行中": "Running", "已停止": "Stopped", "尚未部署": "Not deployed", "已暂停": "Paused",
      "启动中": "Starting", "停止中": "Stopping", "异常": "Error", "需迁移": "Migration required", "未知": "Unknown",
      "总控返回了无法识别的响应": "The controller returned an unrecognized response",
      "请先删除同名旧容器，保留数据目录，然后刷新。": "Delete the old container with the same name, keep its data directory, then refresh.",
      "停止": "Stop", "重启": "Restart", "启动": "Start", "详情": "Details",
      "版本": "Version", "加载器": "Loader", "连接端口": "Connection port", "内存": "Memory", "文件": "Files",
      "服务器": "Server", "服务器详情": "Server details", "保存世界": "Save world", "立即备份": "Back up now", "查看日志": "View logs",
      "总文件": "Total files", "游戏数据与备份": "Game data and backups", "运行时间": "Uptime", "本次容器启动后": "Since this container started",
      "在线玩家": "Online players", "玩家管理": "Player management", "当前没有可识别的在线玩家。": "No identifiable players are online.",
      "服务器停止时无法读取在线玩家。": "Online players cannot be read while the server is stopped.",
      "服务器状态隐藏了部分玩家名称，在线总数仍然准确。": "The server hides some player names; the online count is still accurate.",
      "管理接口正在准备": "The management interface is getting ready", "踢出": "Kick", "封禁": "Ban",
      "管理员": "Operator", "白名单": "Allowlist", "取消管理员": "Remove operator", "设为管理员": "Make operator",
      "移出白名单": "Remove from allowlist", "加入白名单": "Add to allowlist",
      "暂不可用": "Unavailable", "日志中暂未记录": "Not yet recorded in logs", "RCON 未提供": "Not provided by RCON",
      "未登录 TShock 账号": "Not signed in to a TShock account",
      "删除": "Delete", "更新于": "Updated", "清除现有密码": "Clear existing password",
      "已设置，留空保持不变": "Set; leave blank to keep it unchanged",
      "常用配置": "Common settings", "操作进行中": "Operation in progress", "保存并应用": "Save and apply",
      "当前游戏没有可编辑配置。": "This game has no editable settings.",
      "保存时会先保存世界，再重建并重新启动服务器；世界、模组和备份不会被删除。": "Saving first saves the world, then recreates and restarts the server. Worlds, mods, and backups are not deleted.",
      "保存后会重建已有容器；如果尚未部署，将在首次启动时应用。": "Saving recreates an existing container. If it is not deployed yet, the settings apply on first start.",
      "只能添加 .jar 格式的 Mod 文件": "Only .jar mod files can be added", "Mod 添加失败": "Failed to add mod", "Mod 删除失败": "Failed to delete mod",
      "应用配置": "Apply settings", "正在保存服务器配置": "Saving server settings",
      "NeoForge": "NeoForge", "Mod 管理": "Mod management", "添加 Mod": "Add mod", "当前没有已安装的 Mod。": "No mods are installed.",
      "添加或删除后需要重启 Minecraft 服务器才能生效。": "Restart the Minecraft server after adding or removing a mod.",
      "世界": "World", "幻兽帕鲁": "Palworld", "服务端版本": "Server version", "世界 GUID": "World GUID", "世界天数": "World days",
      "服务器 FPS": "Server FPS", "帧耗时": "Frame time", "连接地址": "Connection address", "协议": "Protocol",
      "世界大小": "World size", "难度": "Difficulty", "最大玩家": "Maximum players", "服务名称": "Service name", "管理组件": "Management component",
      "地图": "Map", "无人时暂停": "Pause when empty", "公开服务器": "Public server", "自动保存": "Autosave", "Java 内存": "Java memory",
      "游戏模式": "Game mode", "视距": "View distance", "模拟距离": "Simulation distance", "在线验证": "Online authentication", "开启": "On",
      "在线通知": "Online notice", "服务器公告": "Server announcement", "输入发送给在线玩家的公告": "Enter an announcement for online players", "发送": "Send",
      "备份": "Backup", "世界快照": "World snapshot", "尚未创建": "Not created", "最近备份": "Latest backup", "备份大小": "Backup size", "启用白名单": "Enable allowlist", "正版验证": "Online authentication",
      "保留策略": "Retention", "仅保留最新一份": "Keep latest only", "自动周期": "Automatic interval", "每 3 天": "Every 3 days",
      "容器": "Container", "运行状态": "Runtime status", "健康状态": "Health", "容器当前没有输出": "The container has no output",
      "暂无操作记录": "No operation history", "暂无进行中的操作": "No operation in progress", "当前游戏": "Current game", "总控操作日志": "Controller operation log", "全部 · 总控操作日志": "All · Controller operation log",
      "登录会话已失效，请重新登录": "Your session has expired. Sign in again.", "请稍后再试": "Try again shortly",
      "确定封禁该玩家吗？": "Ban this player?", "确定封禁该玩家吗？封禁后需要通过服务器管理方式手动解除。": "Ban this player? The ban must be removed manually through server administration.",
      "自定义": "Custom", "生存": "Survival", "创造": "Creative", "冒险": "Adventure", "旁观": "Spectator",
      "和平": "Peaceful", "简单": "Easy", "普通": "Normal", "困难": "Hard", "无": "None", "仅物品": "Items only", "物品和装备": "Items and equipment",
      "小时": "hours", "秒": "seconds", "分钟": "minutes", "小型": "Small", "中型": "Medium", "大型": "Large", "专家": "Expert", "大师": "Master", "旅途": "Journey",
      "服务器名称": "Server name", "服务器描述": "Server description", "加入密码": "Join password", "难度预设": "Difficulty preset", "经验倍率": "Experience rate",
      "捕获倍率": "Capture rate", "启用 PvP": "Enable PvP", "友军伤害": "Friendly fire", "死亡惩罚": "Death penalty", "蛋孵化时间": "Egg hatch time",
      "自动保存间隔": "Autosave interval", "服务器名称": "Server name", "世界名称": "World name", "新世界大小": "New world size", "新世界难度": "New world difficulty",
      "欢迎消息": "Welcome message", "存档名称": "Save name", "沙盒预设": "Sandbox preset", "末日": "Apocalypse", "性能优化": "Performance", "最高性能": "Maximum performance",
      "更改后会切换到另一份世界文件，不会删除旧世界": "Changing this switches to another world file without deleting the old world",
      "更改后会切换到另一份存档，不会删除旧世界": "Changing this switches to another save without deleting the old world",
      "只影响首次生成的新世界": "Only affects a newly generated world", "多个 Steam Workshop 数字 ID 使用分号分隔": "Separate Steam Workshop numeric IDs with semicolons",
      "多个 mod.info 中的 Mod ID 使用分号分隔": "Separate Mod IDs from mod.info files with semicolons",
      "NeoForge 模组服务器": "NeoForge modded server", "Palworld 专用服务器": "Palworld dedicated server", "TShock 管理服务器": "TShock managed server",
      "Build 42 生存服务器": "Build 42 survival server", "自动更新": "Automatic updates"
      ,"登录失败次数过多，请 5 分钟后再试": "Too many failed sign-in attempts. Try again in 5 minutes.", "账号或密码错误": "Incorrect username or password",
      "游戏未注册": "Game is not registered", "未找到": "Not found", "游戏没有注册主容器": "The game has no registered primary container", "服务器尚未运行": "The server is not running",
      "不支持的玩家操作": "Unsupported player action", "玩家昵称格式无效": "Invalid player nickname", "玩家名称格式无效": "Invalid player name", "玩家用户 ID 格式无效": "Invalid player user ID",
      "公告内容需要在 1 到 200 个字符之间": "Announcements must contain 1 to 200 characters", "当前游戏不支持服务器公告": "This game does not support server announcements",
      "该游戏没有配置备份": "Backups are not configured for this game", "游戏数据目录不存在": "The game data directory does not exist", "没有提交任何配置": "No settings were submitted",
      "配置没有变化": "No settings changed", "Mod 文件不存在": "The mod file does not exist", "上传的 Mod 文件为空": "The uploaded mod file is empty", "Mod 文件不能超过 512 MB": "Mod files cannot exceed 512 MB",
      "该游戏没有配置 Mod 目录": "This game has no mod directory configured", "Mod 文件上传不完整": "The mod upload is incomplete", "服务器管理接口返回了无法识别的数据": "The server management interface returned unrecognized data",
      "确定封禁该玩家吗？": "Ban this player?", "确定封禁该玩家吗？封禁后需要通过服务器管理方式手动解除。": "Ban this player? The ban must be removed manually through server administration."
    },
    "zh-TW": {
      "游戏服务器总控": "遊戲伺服器總控", "一处掌控。": "一處掌控。", "你的游戏世界，随时待命。": "你的遊戲世界，隨時待命。",
      "登录": "登入", "使用管理账号登录，控制 NAS 上的游戏服务。": "使用管理帳號登入，控制 NAS 上的遊戲服務。", "账号": "帳號", "密码": "密碼",
      "继续": "繼續", "游戏服务器": "遊戲伺服器", "日志": "日誌", "刷新": "重新整理", "退出": "登出", "服务": "服務", "游戏库": "遊戲庫",
      "我的游戏": "我的遊戲", "添加游戏": "新增遊戲", "开始设置": "開始設定", "还没有添加游戏": "尚未新增遊戲", "从游戏库中选择需要管理的服务器，添加后会显示在这里。": "從遊戲庫中選擇需要管理的伺服器，新增後會顯示在這裡。", "添加第一个游戏": "新增第一個遊戲",
      "返回我的游戏": "返回我的遊戲", "选择要在这台 NAS 上管理的游戏服务器。": "選擇要在這台 NAS 上管理的遊戲伺服器。", "可添加的游戏": "可新增的遊戲", "添加到首页": "新增至首頁", "从首页移除": "從首頁移除",
      "开始配置": "開始設定", "初始化": "初始化", "初始化 Mod": "初始化 Mod", "还没有选择 Mod 文件。": "尚未選擇 Mod 檔案。",
      "先选择加载器和游戏版本，并可同时设置常用配置、上传 Mod。": "先選擇載入器和遊戲版本，並可同時設定常用配置、上傳 Mod。",
      "可选。原版不显示此项；模组服可在创建时上传 .jar，启动后生效。": "可選。原版不顯示此項；模組服可在建立時上傳 .jar，啟動後生效。",
      "原版": "原版", "游戏版本": "遊戲版本", "Java 原版 / 模组服务器": "Java 原版 / 模組伺服器", "原版服务器": "原版伺服器",
      "Forge 模组服务器": "Forge 模組伺服器", "Fabric 模组服务器": "Fabric 模組伺服器",
      "原版不使用 Mod；切换加载器后只会列出该加载器支持的游戏版本": "原版不使用 Mod；切換載入器後只會列出該載入器支援的遊戲版本",
      "版本列表来自 Mojang / 加载器官方元数据，并按加载器最低支持版本过滤": "版本列表來自 Mojang / 載入器官方中繼資料，並依載入器最低支援版本過濾",
      "无法加载配置": "無法載入設定",
      "总控运行中": "總控運行中", "游戏服务": "遊戲服務", "返回游戏库": "返回遊戲庫", "刷新详情": "重新整理詳情",
      "只有总控随 NAS 自动启动，游戏服务按需运行。": "只有總控隨 NAS 自動啟動，遊戲服務按需運行。", "实时输出": "即時輸出", "服务日志": "服務日誌",
      "筛选": "篩選", "全部": "全部", "关闭": "關閉", "正在读取操作状态": "正在讀取操作狀態", "正在读取日志…": "正在讀取日誌…",
      "显示所选游戏的总控进度和容器最近 500 行日志，每 2 秒自动刷新。": "顯示所選遊戲的總控進度和容器最近 500 行日誌，每 2 秒自動重新整理。", "语言": "語言",
      "运行中": "運行中", "已停止": "已停止", "尚未部署": "尚未部署", "已暂停": "已暫停", "启动中": "啟動中", "停止中": "停止中", "异常": "異常",
      "需迁移": "需遷移", "未知": "未知", "总控返回了无法识别的响应": "總控返回了無法識別的回應", "请先删除同名旧容器，保留数据目录，然后刷新。": "請先刪除同名舊容器，保留資料目錄，然後重新整理。",
      "停止": "停止", "重启": "重新啟動", "启动": "啟動", "详情": "詳情", "版本": "版本", "加载器": "載入器", "连接端口": "連線連接埠", "内存": "記憶體", "文件": "檔案",
      "服务器": "伺服器", "服务器详情": "伺服器詳情", "保存世界": "儲存世界", "立即备份": "立即備份", "查看日志": "查看日誌", "总文件": "檔案總量",
      "游戏数据与备份": "遊戲資料與備份", "运行时间": "運行時間", "本次容器启动后": "本次容器啟動後", "在线玩家": "線上玩家", "玩家管理": "玩家管理",
      "当前没有可识别的在线玩家。": "目前沒有可識別的線上玩家。", "服务器停止时无法读取在线玩家。": "伺服器停止時無法讀取線上玩家。", "服务器状态隐藏了部分玩家名称，在线总数仍然准确。": "伺服器狀態隱藏了部分玩家名稱，線上總數仍然準確。",
      "踢出": "踢出", "封禁": "封鎖", "管理员": "管理員", "白名单": "白名單", "取消管理员": "取消管理員", "设为管理员": "設為管理員", "移出白名单": "移出白名單", "加入白名单": "加入白名單",
      "暂不可用": "暫不可用", "日志中暂未记录": "日誌中暫未記錄", "删除": "刪除", "更新于": "更新於", "清除现有密码": "清除現有密碼", "已设置，留空保持不变": "已設定，留空保持不變",
      "常用配置": "常用設定", "操作进行中": "操作進行中", "保存并应用": "儲存並套用", "当前游戏没有可编辑配置。": "目前遊戲沒有可編輯設定。",
      "保存时会先保存世界，再重建并重新启动服务器；世界、模组和备份不会被删除。": "儲存時會先儲存世界，再重建並重新啟動伺服器；世界、模組和備份不會被刪除。",
      "保存后会重建已有容器；如果尚未部署，将在首次启动时应用。": "儲存後會重建現有容器；如果尚未部署，將在首次啟動時套用。",
      "应用配置": "套用設定", "正在保存服务器配置": "正在儲存伺服器設定", "Mod 管理": "Mod 管理", "添加 Mod": "新增 Mod", "当前没有已安装的 Mod。": "目前沒有已安裝的 Mod。", "幻兽帕鲁": "幻獸帕魯", "只能添加 .jar 格式的 Mod 文件": "只能新增 .jar 格式的 Mod 檔案", "RCON 未提供": "RCON 未提供",
      "添加或删除后需要重启 Minecraft 服务器才能生效。": "新增或刪除後需要重新啟動 Minecraft 伺服器才能生效。", "世界": "世界", "服务端版本": "伺服器版本", "世界天数": "世界天數",
      "服务器 FPS": "伺服器 FPS", "帧耗时": "影格耗時", "连接地址": "連線位址", "协议": "協定", "世界大小": "世界大小", "难度": "難度", "最大玩家": "最大玩家",
      "服务名称": "服務名稱", "管理组件": "管理元件", "地图": "地圖", "无人时暂停": "無人時暫停", "公开服务器": "公開伺服器", "自动保存": "自動儲存", "游戏模式": "遊戲模式",
      "视距": "視距", "模拟距离": "模擬距離", "在线验证": "線上驗證", "正版验证": "正版驗證", "启用白名单": "啟用白名單", "开启": "開啟", "在线通知": "線上通知", "服务器公告": "伺服器公告", "输入发送给在线玩家的公告": "輸入傳送給線上玩家的公告", "发送": "傳送",
      "备份": "備份", "世界快照": "世界快照", "尚未创建": "尚未建立", "最近备份": "最近備份", "备份大小": "備份大小", "保留策略": "保留策略", "仅保留最新一份": "僅保留最新一份",
      "自动周期": "自動週期", "每 3 天": "每 3 天", "容器": "容器", "运行状态": "運行狀態", "健康状态": "健康狀態", "容器当前没有输出": "容器目前沒有輸出", "暂无操作记录": "暫無操作記錄",
      "暂无进行中的操作": "暫無進行中的操作", "当前游戏": "目前遊戲", "总控操作日志": "總控操作日誌", "全部 · 总控操作日志": "全部 · 總控操作日誌", "登录会话已失效，请重新登录": "登入工作階段已失效，請重新登入", "请稍后再试": "請稍後再試",
      "服务器名称": "伺服器名稱", "服务器描述": "伺服器描述", "加入密码": "加入密碼", "难度预设": "難度預設", "经验倍率": "經驗倍率", "捕获倍率": "捕獲倍率", "启用 PvP": "啟用 PvP",
      "友军伤害": "友軍傷害", "死亡惩罚": "死亡懲罰", "蛋孵化时间": "蛋孵化時間", "自动保存间隔": "自動儲存間隔", "世界名称": "世界名稱", "新世界大小": "新世界大小", "新世界难度": "新世界難度",
      "欢迎消息": "歡迎訊息", "存档名称": "存檔名稱", "沙盒预设": "沙盒預設", "更改后会切换到另一份世界文件，不会删除旧世界": "變更後會切換到另一份世界檔案，不會刪除舊世界", "更改后会切换到另一份存档，不会删除旧世界": "變更後會切換到另一份存檔，不會刪除舊世界",
      "只影响首次生成的新世界": "只影響首次產生的新世界", "多个 Steam Workshop 数字 ID 使用分号分隔": "多個 Steam Workshop 數字 ID 使用分號分隔", "多个 mod.info 中的 Mod ID 使用分号分隔": "多個 mod.info 中的 Mod ID 使用分號分隔",
      "NeoForge 模组服务器": "NeoForge 模組伺服器", "Palworld 专用服务器": "Palworld 專用伺服器", "TShock 管理服务器": "TShock 管理伺服器", "Build 42 生存服务器": "Build 42 生存伺服器", "自动更新": "自動更新"
      ,"自定义": "自訂", "生存": "生存", "创造": "創造", "冒险": "冒險", "旁观": "旁觀", "和平": "和平", "简单": "簡單", "普通": "普通", "困难": "困難", "无": "無",
      "仅物品": "僅物品", "物品和装备": "物品和裝備", "小时": "小時", "秒": "秒", "分钟": "分鐘", "小型": "小型", "中型": "中型", "大型": "大型", "专家": "專家", "大师": "大師", "旅途": "旅途",
      "末日": "末日", "性能优化": "效能最佳化", "最高性能": "最高效能", "登录失败次数过多，请 5 分钟后再试": "登入失敗次數過多，請 5 分鐘後再試", "账号或密码错误": "帳號或密碼錯誤",
      "游戏未注册": "遊戲未註冊", "未找到": "未找到", "游戏没有注册主容器": "遊戲沒有註冊主容器", "服务器尚未运行": "伺服器尚未運行", "不支持的玩家操作": "不支援的玩家操作",
      "玩家昵称格式无效": "玩家暱稱格式無效", "玩家名称格式无效": "玩家名稱格式無效", "玩家用户 ID 格式无效": "玩家使用者 ID 格式無效", "公告内容需要在 1 到 200 个字符之间": "公告內容需介於 1 到 200 個字元",
      "当前游戏不支持服务器公告": "目前遊戲不支援伺服器公告", "该游戏没有配置备份": "該遊戲沒有設定備份", "游戏数据目录不存在": "遊戲資料目錄不存在", "没有提交任何配置": "沒有提交任何設定", "配置没有变化": "設定沒有變化",
      "Mod 文件不存在": "Mod 檔案不存在", "上传的 Mod 文件为空": "上傳的 Mod 檔案為空", "Mod 文件不能超过 512 MB": "Mod 檔案不能超過 512 MB", "该游戏没有配置 Mod 目录": "該遊戲沒有設定 Mod 目錄",
      "确定封禁该玩家吗？": "確定封鎖該玩家嗎？", "确定封禁该玩家吗？封禁后需要通过服务器管理方式手动解除。": "確定封鎖該玩家嗎？封鎖後需要透過伺服器管理方式手動解除。"
    },
    ja: {
      "游戏服务器总控": "ゲームサーバー管理", "一处掌控。": "すべてを、ここから。", "你的游戏世界，随时待命。": "ゲームの世界を、いつでも起動。",
      "我的游戏": "マイゲーム", "添加游戏": "ゲームを追加", "开始设置": "セットアップを開始", "还没有添加游戏": "ゲームはまだ追加されていません", "从游戏库中选择需要管理的服务器，添加后会显示在这里。": "ゲームライブラリから管理するサーバーを選択してください。追加したゲームはここに表示されます。", "添加第一个游戏": "最初のゲームを追加",
      "返回我的游戏": "マイゲームに戻る", "选择要在这台 NAS 上管理的游戏服务器。": "この NAS で管理するゲームサーバーを選択してください。", "可添加的游戏": "追加できるゲーム", "添加到首页": "ホームに追加", "从首页移除": "ホームから削除",
      "开始配置": "設定を開始", "初始化": "初期設定", "初始化 Mod": "初期 Mod", "还没有选择 Mod 文件。": "Mod ファイルはまだ選択されていません。",
      "先选择加载器和游戏版本，并可同时设置常用配置、上传 Mod。": "先にローダーとゲームバージョンを選び、同時に一般設定と Mod のアップロードもできます。",
      "可选。原版不显示此项；模组服可在创建时上传 .jar，启动后生效。": "任意。バニラでは非表示です。Mod サーバーは作成時に .jar をアップロードでき、起動後に適用されます。",
      "原版": "バニラ", "游戏版本": "ゲームバージョン", "Java 原版 / 模组服务器": "Java バニラ / Mod サーバー", "原版服务器": "バニラサーバー",
      "Forge 模组服务器": "Forge Mod サーバー", "Fabric 模组服务器": "Fabric Mod サーバー",
      "原版不使用 Mod；切换加载器后只会列出该加载器支持的游戏版本": "バニラは Mod を使いません。ローダーを切り替えると、そのローダーが対応するバージョンだけが表示されます。",
      "版本列表来自 Mojang / 加载器官方元数据，并按加载器最低支持版本过滤": "バージョン一覧は Mojang と公式ローダーのメタデータから取得し、各ローダーの最低対応バージョンで絞り込まれます。",
      "无法加载配置": "設定を読み込めません",
      "登录": "ログイン", "使用管理账号登录，控制 NAS 上的游戏服务。": "管理者アカウントでログインして、NAS 上のゲームサービスを管理します。", "账号": "ユーザー名", "密码": "パスワード", "继续": "続行",
      "游戏服务器": "ゲームサーバー", "日志": "ログ", "刷新": "更新", "退出": "ログアウト", "服务": "サービス", "游戏库": "ゲームライブラリ", "总控运行中": "コントローラー稼働中",
      "游戏服务": "ゲームサービス", "返回游戏库": "ライブラリへ戻る", "刷新详情": "詳細を更新", "只有总控随 NAS 自动启动，游戏服务按需运行。": "NAS と同時に起動するのはコントローラーのみです。ゲームサービスは必要なときだけ実行されます。",
      "实时输出": "リアルタイム出力", "服务日志": "サービスログ", "筛选": "フィルター", "全部": "すべて", "关闭": "閉じる", "正在读取操作状态": "操作状態を読み込み中", "正在读取日志…": "ログを読み込み中…",
      "显示所选游戏的总控进度和容器最近 500 行日志，每 2 秒自动刷新。": "選択したゲームの進行状況とコンテナログの最新 500 行を表示します。2 秒ごとに自動更新されます。", "语言": "言語",
      "运行中": "実行中", "已停止": "停止済み", "尚未部署": "未デプロイ", "已暂停": "一時停止", "启动中": "起動中", "停止中": "停止中", "异常": "エラー", "需迁移": "移行が必要", "未知": "不明",
      "总控返回了无法识别的响应": "コントローラーから認識できない応答が返されました", "请先删除同名旧容器，保留数据目录，然后刷新。": "同名の旧コンテナを削除し、データディレクトリを保持してから更新してください。",
      "停止": "停止", "重启": "再起動", "启动": "起動", "详情": "詳細", "版本": "バージョン", "加载器": "ローダー", "连接端口": "接続ポート", "内存": "メモリ", "文件": "ファイル",
      "服务器": "サーバー", "服务器详情": "サーバー詳細", "保存世界": "ワールドを保存", "立即备份": "今すぐバックアップ", "查看日志": "ログを表示", "总文件": "全ファイル", "游戏数据与备份": "ゲームデータとバックアップ",
      "运行时间": "稼働時間", "本次容器启动后": "今回のコンテナ起動後", "在线玩家": "オンラインプレイヤー", "玩家管理": "プレイヤー管理", "当前没有可识别的在线玩家。": "確認できるオンラインプレイヤーはいません。",
      "服务器停止时无法读取在线玩家。": "サーバー停止中はオンラインプレイヤーを取得できません。", "服务器状态隐藏了部分玩家名称，在线总数仍然准确。": "サーバーが一部のプレイヤー名を非表示にしています。オンライン人数は正確です。",
      "踢出": "キック", "封禁": "BAN", "管理员": "オペレーター", "白名单": "許可リスト", "取消管理员": "OP を解除", "设为管理员": "OP に設定", "移出白名单": "許可リストから削除", "加入白名单": "許可リストに追加",
      "暂不可用": "利用不可", "日志中暂未记录": "ログに未記録", "删除": "削除", "更新于": "更新", "清除现有密码": "現在のパスワードを削除", "已设置，留空保持不变": "設定済み。空欄のままにすると変更しません",
      "常用配置": "一般設定", "操作进行中": "操作を実行中", "保存并应用": "保存して適用", "当前游戏没有可编辑配置。": "このゲームには編集できる設定がありません。",
      "保存时会先保存世界，再重建并重新启动服务器；世界、模组和备份不会被删除。": "保存時にワールドを保存し、サーバーを再作成して再起動します。ワールド、Mod、バックアップは削除されません。",
      "保存后会重建已有容器；如果尚未部署，将在首次启动时应用。": "保存すると既存のコンテナを再作成します。未デプロイの場合は初回起動時に適用されます。", "应用配置": "設定を適用", "正在保存服务器配置": "サーバー設定を保存中",
      "Mod 管理": "Mod 管理", "添加 Mod": "Mod を追加", "当前没有已安装的 Mod。": "インストール済みの Mod はありません。", "添加或删除后需要重启 Minecraft 服务器才能生效。": "Mod の追加または削除後に Minecraft サーバーを再起動してください。", "只能添加 .jar 格式的 Mod 文件": ".jar 形式の Mod ファイルだけを追加できます", "RCON 未提供": "RCON から提供されていません",
      "世界": "ワールド", "幻兽帕鲁": "Palworld", "服务端版本": "サーバーバージョン", "世界天数": "ワールド日数", "服务器 FPS": "サーバー FPS", "帧耗时": "フレーム時間", "连接地址": "接続先", "协议": "プロトコル",
      "世界大小": "ワールドサイズ", "难度": "難易度", "最大玩家": "最大プレイヤー数", "服务名称": "サービス名", "管理组件": "管理コンポーネント", "地图": "マップ", "无人时暂停": "無人時に一時停止",
      "公开服务器": "公開サーバー", "自动保存": "自動保存", "Java 内存": "Java メモリ", "游戏模式": "ゲームモード", "视距": "描画距離", "模拟距离": "シミュレーション距離", "在线验证": "オンライン認証", "正版验证": "正規アカウント認証", "启用白名单": "許可リストを有効化", "开启": "オン",
      "在线通知": "オンライン通知", "服务器公告": "サーバー通知", "输入发送给在线玩家的公告": "オンラインプレイヤーへの通知を入力", "发送": "送信", "备份": "バックアップ", "世界快照": "ワールドスナップショット",
      "尚未创建": "未作成", "最近备份": "最新バックアップ", "备份大小": "バックアップサイズ", "保留策略": "保持ポリシー", "仅保留最新一份": "最新のみ保持", "自动周期": "自動間隔", "每 3 天": "3 日ごと",
      "容器": "コンテナ", "运行状态": "実行状態", "健康状态": "ヘルス", "容器当前没有输出": "コンテナの出力はありません", "暂无操作记录": "操作履歴はありません", "暂无进行中的操作": "実行中の操作はありません", "当前游戏": "現在のゲーム", "总控操作日志": "コントローラー操作ログ", "全部 · 总控操作日志": "すべて · コントローラー操作ログ",
      "登录会话已失效，请重新登录": "セッションの有効期限が切れました。再度ログインしてください。", "请稍后再试": "しばらくしてから再試行してください",
      "服务器名称": "サーバー名", "服务器描述": "サーバー説明", "加入密码": "参加パスワード", "难度预设": "難易度プリセット", "经验倍率": "経験値倍率", "捕获倍率": "捕獲倍率", "启用 PvP": "PvP を有効化",
      "友军伤害": "フレンドリーファイア", "死亡惩罚": "死亡ペナルティ", "蛋孵化时间": "タマゴ孵化時間", "自动保存间隔": "自動保存間隔", "世界名称": "ワールド名", "新世界大小": "新規ワールドサイズ", "新世界难度": "新規ワールド難易度",
      "欢迎消息": "ウェルカムメッセージ", "存档名称": "セーブ名", "沙盒预设": "サンドボックスプリセット", "更改后会切换到另一份世界文件，不会删除旧世界": "変更すると別のワールドファイルに切り替わります。以前のワールドは削除されません。",
      "更改后会切换到另一份存档，不会删除旧世界": "変更すると別のセーブに切り替わります。以前のワールドは削除されません。", "只影响首次生成的新世界": "新規生成するワールドにのみ適用されます",
      "多个 Steam Workshop 数字 ID 使用分号分隔": "複数の Steam Workshop 数値 ID はセミコロンで区切ります", "多个 mod.info 中的 Mod ID 使用分号分隔": "複数の mod.info の Mod ID はセミコロンで区切ります",
      "NeoForge 模组服务器": "NeoForge Mod サーバー", "Palworld 专用服务器": "Palworld 専用サーバー", "TShock 管理服务器": "TShock 管理サーバー", "Build 42 生存服务器": "Build 42 サバイバルサーバー", "自动更新": "自動更新"
      ,"自定义": "カスタム", "生存": "サバイバル", "创造": "クリエイティブ", "冒险": "アドベンチャー", "旁观": "スペクテイター", "和平": "ピースフル", "简单": "イージー", "普通": "ノーマル", "困难": "ハード", "无": "なし",
      "仅物品": "アイテムのみ", "物品和装备": "アイテムと装備", "小时": "時間", "秒": "秒", "分钟": "分", "小型": "小", "中型": "中", "大型": "大", "专家": "エキスパート", "大师": "マスター", "旅途": "ジャーニー",
      "末日": "アポカリプス", "性能优化": "パフォーマンス", "最高性能": "最高パフォーマンス", "登录失败次数过多，请 5 分钟后再试": "ログイン失敗回数が多すぎます。5 分後に再試行してください", "账号或密码错误": "ユーザー名またはパスワードが正しくありません",
      "游戏未注册": "ゲームが登録されていません", "未找到": "見つかりません", "游戏没有注册主容器": "ゲームにプライマリコンテナが登録されていません", "服务器尚未运行": "サーバーは起動していません", "不支持的玩家操作": "サポートされていないプレイヤー操作です",
      "玩家昵称格式无效": "プレイヤーのニックネーム形式が無効です", "玩家名称格式无效": "プレイヤー名の形式が無効です", "玩家用户 ID 格式无效": "プレイヤーのユーザー ID 形式が無効です", "公告内容需要在 1 到 200 个字符之间": "通知は 1～200 文字で入力してください",
      "当前游戏不支持服务器公告": "このゲームはサーバー通知に対応していません", "该游戏没有配置备份": "このゲームにはバックアップが設定されていません", "游戏数据目录不存在": "ゲームデータディレクトリが存在しません", "没有提交任何配置": "設定が送信されていません", "配置没有变化": "設定に変更はありません",
      "Mod 文件不存在": "Mod ファイルが存在しません", "上传的 Mod 文件为空": "アップロードされた Mod ファイルが空です", "Mod 文件不能超过 512 MB": "Mod ファイルは 512 MB 以下にしてください", "该游戏没有配置 Mod 目录": "このゲームには Mod ディレクトリが設定されていません",
      "确定封禁该玩家吗？": "このプレイヤーを BAN しますか？", "确定封禁该玩家吗？封禁后需要通过服务器管理方式手动解除。": "このプレイヤーを BAN しますか？解除するにはサーバー管理機能を使用する必要があります。"
    }
  };

  const normalize = (value) => {
    const locale = String(value || "").replace("_", "-").toLowerCase();
    if (locale.startsWith("zh-tw") || locale.startsWith("zh-hk") || locale.startsWith("zh-mo") || locale.startsWith("zh-hant")) return "zh-TW";
    if (locale.startsWith("zh")) return "zh-CN";
    if (locale.startsWith("ja")) return "ja";
    return "en";
  };
  const saved = localStorage.getItem(storageKey);
  let locale = supported.includes(saved) ? saved : normalize(navigator.languages?.[0] || navigator.language);

  const translate = (source) => {
    if (source == null || locale === "zh-CN") return source;
    return messages[locale]?.[String(source)] ?? source;
  };
  const format = (source, values = {}) => String(translate(source)).replace(/\{(\w+)\}/g, (_match, key) => values[key] ?? "");

  const patterns = {
    en: [
      [/^正在启动 (.+)$/, "Starting $1"], [/^正在停止 (.+)$/, "Stopping $1"], [/^正在重建 (.+)$/, "Recreating $1"], [/^准备启动 (.+)$/, "Preparing to start $1"], [/^准备停止 (.+)$/, "Preparing to stop $1"],
      [/^准备重启 (.+)$/, "Preparing to restart $1"], [/^准备备份 (.+)$/, "Preparing to back up $1"], [/^准备保存世界 (.+)$/, "Preparing to save $1"], [/^准备应用 (.+) 配置$/, "Preparing to apply settings for $1"],
      [/^正在检查 NAS 数据目录$/, "Checking NAS data directories"], [/^正在请求服务器保存世界$/, "Requesting a world save"], [/^正在保存并暂停世界写入$/, "Saving and pausing world writes"], [/^正在压缩游戏数据$/, "Compressing game data"], [/^正在强制保存世界$/, "Forcing a world save"], [/^正在保存世界$/, "Saving world"],
      [/^正在下载镜像 (.+)；首次启动可能需要较长时间$/, "Downloading image $1; the first start may take a while"], [/^镜像下载完成：(.+)$/, "Image download complete: $1"],
      [/^开始(启动|停止|重启|备份|保存世界|应用配置) (.+)$/, "Beginning $1: $2"], [/^(.+) (启动|停止|重启|备份|保存世界|应用配置)操作已完成$/, "$1 — $2 completed"],
      [/^请求失败：(\d+)$/, "Request failed: $1"], [/^更新于 (.+)$/, "Updated $1"], [/^(\d+) 天 (\d+) 小时$/, "$1 d $2 hr"], [/^(\d+) 小时 (\d+) 分钟$/, "$1 hr $2 min"], [/^(\d+) 分钟$/, "$1 min"],
      [/^IP：(.+)$/, "IP: $1"], [/^用户 ID：(.+)$/, "User ID: $1"], [/^等级：(.+) · 延迟：(.+) ms$/, "Level: $1 · Ping: $2 ms"], [/^建筑：(.+) · 坐标：(.+)$/, "Buildings: $1 · Location: $2"],
      [/^账号：(.+)$/, "Account: $1"], [/^状态：(.+) · 队伍：(.+)$/, "State: $1 · Team: $2"], [/^UUID：(.+)$/, "UUID: $1"], [/^本次加入：(.+)$/, "Joined: $1"],
      [/^(.+) 图标$/, "$1 icon"], [/^查看 (.+) 详情$/, "View $1 details"], [/^(.+) · 更新于 (.+)$/, "$1 · Updated $2"],
      [/^正在上传 (.+)$/, "Uploading $1"], [/^正在删除 (.+)$/, "Deleting $1"], [/^确定删除 Mod“(.+)”吗？$/, "Delete mod “$1”?"],
      [/^管理接口正在准备：(.+)$/, "The management interface is getting ready: $1"], [/^正在执行：(.+)$/, "Operation in progress: $1"],
      [/^正在(.+)服务，请稍候$/, "$1 service in progress. Please wait."], [/^(.+)失败：(.+)$/, "$1 failed: $2"], [/^(.+)操作已完成$/, "$1 completed"],
      [/^(.+)。可点击顶部“日志”查看详情。$/, "$1. Select Logs at the top for details."], [/^(.+)。日志窗口会持续显示进度。$/, "$1. Progress remains visible in the log window."],
      [/^(.+)。世界数据会保持不变。$/, "$1. World data will remain unchanged."], [/^(.+)暂无进行中的操作$/, "No operation in progress for $1"],
      [/^(.+) · 总控操作日志$/, "$1 · Controller operation log"], [/^日志读取失败：(.+)$/, "Failed to load logs: $1"], [/^详情读取失败：(.+)$/, "Failed to load details: $1"]
    ],
    "zh-TW": [
      [/^正在启动 (.+)$/, "正在啟動 $1"], [/^正在停止 (.+)$/, "正在停止 $1"], [/^正在重建 (.+)$/, "正在重建 $1"], [/^准备启动 (.+)$/, "準備啟動 $1"], [/^准备停止 (.+)$/, "準備停止 $1"],
      [/^准备重启 (.+)$/, "準備重新啟動 $1"], [/^准备备份 (.+)$/, "準備備份 $1"], [/^准备保存世界 (.+)$/, "準備儲存世界 $1"], [/^准备应用 (.+) 配置$/, "準備套用 $1 設定"],
      [/^正在检查 NAS 数据目录$/, "正在檢查 NAS 資料目錄"], [/^正在请求服务器保存世界$/, "正在請求伺服器儲存世界"], [/^正在保存并暂停世界写入$/, "正在儲存並暫停世界寫入"], [/^正在压缩游戏数据$/, "正在壓縮遊戲資料"], [/^正在强制保存世界$/, "正在強制儲存世界"], [/^正在保存世界$/, "正在儲存世界"],
      [/^开始(启动|停止|重启|备份|保存世界|应用配置) (.+)$/, "開始$1 $2"], [/^(.+) (启动|停止|重启|备份|保存世界|应用配置)操作已完成$/, "$1 $2操作已完成"],
      [/^请求失败：(\d+)$/, "請求失敗：$1"], [/^更新于 (.+)$/, "更新於 $1"], [/^(\d+) 天 (\d+) 小时$/, "$1 天 $2 小時"], [/^(\d+) 小时 (\d+) 分钟$/, "$1 小時 $2 分鐘"], [/^(\d+) 分钟$/, "$1 分鐘"],
      [/^用户 ID：(.+)$/, "使用者 ID：$1"], [/^等级：(.+) · 延迟：(.+) ms$/, "等級：$1 · 延遲：$2 ms"], [/^建筑：(.+) · 坐标：(.+)$/, "建築：$1 · 座標：$2"], [/^账号：(.+)$/, "帳號：$1"],
      [/^状态：(.+) · 队伍：(.+)$/, "狀態：$1 · 隊伍：$2"], [/^本次加入：(.+)$/, "本次加入：$1"], [/^(.+) 图标$/, "$1 圖示"], [/^查看 (.+) 详情$/, "查看 $1 詳情"],
      [/^(.+) · 更新于 (.+)$/, "$1 · 更新於 $2"], [/^正在上传 (.+)$/, "正在上傳 $1"], [/^正在删除 (.+)$/, "正在刪除 $1"], [/^确定删除 Mod“(.+)”吗？$/, "確定刪除 Mod「$1」嗎？"],
      [/^管理接口正在准备：(.+)$/, "管理介面正在準備：$1"], [/^正在执行：(.+)$/, "正在執行：$1"], [/^正在(.+)服务，请稍候$/, "正在$1服務，請稍候"],
      [/^(.+)失败：(.+)$/, "$1失敗：$2"], [/^(.+)操作已完成$/, "$1操作已完成"], [/^(.+)。可点击顶部“日志”查看详情。$/, "$1。可點選頂部「日誌」查看詳情。"],
      [/^(.+)。日志窗口会持续显示进度。$/, "$1。日誌視窗會持續顯示進度。"], [/^(.+)。世界数据会保持不变。$/, "$1。世界資料會保持不變。"], [/^(.+)暂无进行中的操作$/, "$1暫無進行中的操作"],
      [/^(.+) · 总控操作日志$/, "$1 · 總控操作日誌"], [/^日志读取失败：(.+)$/, "日誌讀取失敗：$1"], [/^详情读取失败：(.+)$/, "詳情讀取失敗：$1"]
    ],
    ja: [
      [/^正在启动 (.+)$/, "$1 を起動中"], [/^正在停止 (.+)$/, "$1 を停止中"], [/^正在重建 (.+)$/, "$1 を再作成中"], [/^准备启动 (.+)$/, "$1 の起動を準備中"], [/^准备停止 (.+)$/, "$1 の停止を準備中"],
      [/^准备重启 (.+)$/, "$1 の再起動を準備中"], [/^准备备份 (.+)$/, "$1 のバックアップを準備中"], [/^准备保存世界 (.+)$/, "$1 のワールド保存を準備中"], [/^准备应用 (.+) 配置$/, "$1 の設定適用を準備中"],
      [/^正在检查 NAS 数据目录$/, "NAS データディレクトリを確認中"], [/^正在请求服务器保存世界$/, "サーバーにワールド保存を要求中"], [/^正在保存并暂停世界写入$/, "ワールドを保存し、書き込みを一時停止中"], [/^正在压缩游戏数据$/, "ゲームデータを圧縮中"], [/^正在强制保存世界$/, "ワールドを強制保存中"], [/^正在保存世界$/, "ワールドを保存中"],
      [/^正在下载镜像 (.+)；首次启动可能需要较长时间$/, "イメージ $1 をダウンロード中です。初回起動には時間がかかる場合があります"], [/^镜像下载完成：(.+)$/, "イメージのダウンロード完了：$1"],
      [/^开始(启动|停止|重启|备份|保存世界|应用配置) (.+)$/, "$2 の$1を開始"], [/^(.+) (启动|停止|重启|备份|保存世界|应用配置)操作已完成$/, "$1 の$2が完了しました"],
      [/^请求失败：(\d+)$/, "リクエスト失敗：$1"], [/^更新于 (.+)$/, "$1 に更新"], [/^(\d+) 天 (\d+) 小时$/, "$1 日 $2 時間"], [/^(\d+) 小时 (\d+) 分钟$/, "$1 時間 $2 分"], [/^(\d+) 分钟$/, "$1 分"],
      [/^IP：(.+)$/, "IP：$1"], [/^用户 ID：(.+)$/, "ユーザー ID：$1"], [/^等级：(.+) · 延迟：(.+) ms$/, "レベル：$1 · Ping：$2 ms"], [/^建筑：(.+) · 坐标：(.+)$/, "建築：$1 · 座標：$2"],
      [/^账号：(.+)$/, "アカウント：$1"], [/^状态：(.+) · 队伍：(.+)$/, "状態：$1 · チーム：$2"], [/^本次加入：(.+)$/, "参加時刻：$1"], [/^(.+) 图标$/, "$1 アイコン"], [/^查看 (.+) 详情$/, "$1 の詳細を表示"],
      [/^(.+) · 更新于 (.+)$/, "$1 · $2 に更新"], [/^正在上传 (.+)$/, "$1 をアップロード中"], [/^正在删除 (.+)$/, "$1 を削除中"], [/^确定删除 Mod“(.+)”吗？$/, "Mod「$1」を削除しますか？"],
      [/^管理接口正在准备：(.+)$/, "管理インターフェースを準備中：$1"], [/^正在执行：(.+)$/, "操作を実行中：$1"], [/^正在(.+)服务，请稍候$/, "サービスを$1中です。お待ちください"],
      [/^(.+)失败：(.+)$/, "$1に失敗しました：$2"], [/^(.+)操作已完成$/, "$1が完了しました"], [/^(.+)。可点击顶部“日志”查看详情。$/, "$1。詳細は上部の「ログ」を選択してください。"],
      [/^(.+)。日志窗口会持续显示进度。$/, "$1。進行状況はログ画面に表示されます。"], [/^(.+)。世界数据会保持不变。$/, "$1。ワールドデータは保持されます。"],
      [/^(.+)暂无进行中的操作$/, "$1で実行中の操作はありません"], [/^(.+) · 总控操作日志$/, "$1 · コントローラー操作ログ"], [/^日志读取失败：(.+)$/, "ログの読み込みに失敗：$1"], [/^详情读取失败：(.+)$/, "詳細の読み込みに失敗：$1"]
    ]
  };

  const translateFragments = (value) => {
    if (locale === "zh-CN") return value;
    const shortSafe = new Set(["启动", "停止", "重启", "备份", "删除", "开启", "关闭"]);
    const entries = Object.entries(messages[locale] || {}).filter(([key]) => key.length >= 3 || shortSafe.has(key)).sort((a, b) => b[0].length - a[0].length);
    let result = String(value);
    for (const [key, replacement] of entries) {
      if (result.includes(key)) result = result.split(key).join(replacement);
    }
    return result;
  };

  const translateText = (source) => {
    if (source == null || locale === "zh-CN") return source;
    const exact = translate(source);
    if (exact !== source) return exact;
    let result = String(source);
    for (const [pattern, replacement] of patterns[locale] || []) {
      if (pattern.test(result)) return translateFragments(result.replace(pattern, replacement));
    }
    return translateFragments(result);
  };

  const applyDocument = (root = document) => {
    document.documentElement.lang = locale;
    for (const node of root.querySelectorAll("[data-i18n]")) node.textContent = translate(node.dataset.i18n);
    for (const node of root.querySelectorAll("[data-i18n-aria-label]")) node.setAttribute("aria-label", translate(node.dataset.i18nAriaLabel));
    for (const node of root.querySelectorAll("[data-i18n-placeholder]")) node.setAttribute("placeholder", translate(node.dataset.i18nPlaceholder));
    document.title = translate("游戏服务器总控");
  };

  window.NasI18n = {
    supported, locale, translate, translateText, format, applyDocument,
    setLocale(next) {
      if (!supported.includes(next)) return;
      localStorage.setItem(storageKey, next);
      window.location.reload();
    }
  };
})();
