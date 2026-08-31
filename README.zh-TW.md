# Synology NAS 遊戲伺服器總控

[简体中文](README.md) | [English](README.en.md) | **繁體中文** | [日本語](README.ja.md)

本專案採用「總控常駐、遊戲按需啟動」的方式運行。NAS 或專案首次啟動時只有 `nas-game-controller` 自動啟動；Minecraft 和其他已註冊的遊戲服務不會自動啟動。遊戲容器統一使用 `restart: no`，因此 NAS 重新啟動後仍會保持停止，直到你再次於網頁啟動。自動備份由總控內部排程負責，不需要額外的備份容器。

## 目前結構

```text
nas_game_server/
├── compose.yaml              # 只啟動網頁總控
├── .env                      # 管理帳號、NAS 路徑和遊戲參數
├── config/game-settings.json # 網頁儲存的常用設定
├── controller/               # Docker 控制 API、註冊表和網頁
├── minecraft/                # 世界、Mod、安裝程式和備份
├── palworld/                 # 伺服器、設定、世界和備份
├── terraria/                 # 世界、TShock 設定、外掛和備份
└── zomboid/                  # 存檔、Build 42 檔案、Workshop 資料和備份
```

## 建議配置

本專案依家庭區域網路、「總控常駐、遊戲按需啟動」調校。Synology DSM、Docker 和檔案快取建議預留約 **4–6 GB** 記憶體，不要把全部 RAM 分給遊戲。遊戲伺服器基本上都是 x86_64，ARM 群暉通常無法運行。

### NAS 硬體

| 項目 | 最低 | 建議 |
| --- | --- | --- |
| CPU | x86_64 四核 | 六核以上，單核效能較好（Intel / AMD） |
| 記憶體 | 16 GB | **20 GB 以上**（倉庫預設依 20 GB NAS 將 Minecraft 設為 `14G`） |
| 儲存 | HDD 僅適合 Terraria 這類輕量伺服器 | **SSD / NVMe**。Palworld 與 Project Zomboid 寫入存檔很頻繁，機械硬碟容易卡頓甚至損壞存檔 |
| 可用空間 | 40 GB | **80 GB 以上**（Docker 映像 + Steam 伺服器檔案 + 世界 + 一份備份） |
| 網路 | 千兆區域網路 | 千兆區域網路；網際網路聯機再保證穩定上傳 |

32 GB 以上時，可把 Minecraft 記憶體降到 `12G` 後與 Terraria 長期同開，或把 Project Zomboid 調到 8 GB。即便記憶體充裕，也不要同時運行兩個大型伺服器（Minecraft、Palworld、Project Zomboid 不要疊開）。

### 各遊戲資源占用

下表為家庭 2–10 人、使用本倉庫預設人數時的經驗值。磁碟會隨世界、模組和備份增長；每個遊戲只保留最新一份備份。

| | 網頁總控 | Minecraft Java（NeoForge） | Palworld | Terraria（TShock） | Project Zomboid（Build 42） |
| --- | --- | --- | --- | --- | --- |
| 運行記憶體 | 約 100–300 MB | 約 12–16 GB | 約 8–16 GB | 約 0.5–2 GB | 約 5–9 GB |
| 本倉庫預設 | 常駐 | `MEMORY=14G` | 不限制容器上限，隨玩家和建築上漲 | 8 人、中型世界約 1 GB | `PZ_MAX_RAM=6144m`（Java 堆 6 GB，可選 4 / 6 / 8 GB） |
| 首次磁碟 | 映像約 0.2–0.5 GB | 映像 1–2 GB；伺服器 + 模組約 2–5 GB | Steam 伺服器約 12–20 GB | 映像約 0.5–1 GB | Steam 伺服器約 10–15 GB |
| 日常磁碟 | 可忽略 | 世界常見 2–10 GB+ | 世界約 1–5 GB | 世界 50–400 MB | 存檔約 2–10 GB，Workshop 模組另計 |
| CPU | 很低 | 2–4 核，模組越多越吃單核 | 4 核以上 | 1–2 核 | 4 核，偏單核 |
| 預設人數 | — | 10 | 16 | 8 | 8 |
| 20 GB NAS | 始終可開 | 獨占大型伺服器；可順便開 Terraria（建議把記憶體降到 `12G`） | 獨占大型伺服器；可順便開 Terraria | 可與任意一個大型伺服器同開 | 獨占大型伺服器；可順便開 Terraria |

**20 GB 記憶體 NAS 同時運行建議：**

- 可以：總控 + 任意一個大型伺服器 + Terraria
- 不要：Minecraft + Palworld；Minecraft + Project Zomboid；Palworld + Project Zomboid；三個大型伺服器一起開

記憶體不夠時，DSM 會開始使用交換空間或直接殺掉容器，表現為卡頓、存檔損壞或容器反覆重啟。換遊戲前請先在網頁停止目前的大型伺服器。

Minecraft 若同時跑其他高記憶體套件，把 `.env` 的 `MEMORY` 從 `14G` 降到 `12G`。Palworld 官方建議 16 GB，8 GB 能啟動但容易記憶體不足。Project Zomboid 首次啟動會下載伺服器檔案，網頁裡可把 Java 記憶體改成 4 / 6 / 8 GB。

## Synology 部署

1. 將整個目錄上傳到 `/volume1/docker/nas_game_server`。若使用其他路徑，請同步修改 `.env` 的 `HOST_PROJECT_PATH`。
2. 開啟 `.env`，確認管理帳號、`EULA=TRUE`、記憶體、連接埠和 Minecraft 參數。預設帳號為 `admin`，密碼為 `admin123`。記憶體與磁碟占用見上文「建議配置」。
3. 若舊的 `minecraft-neoforge` 專案仍在運行，先備份並確認世界位於 `minecraft/data`，再停止並刪除舊容器。舊版 `minecraft-backup` 容器也可刪除。只刪除容器，不要刪除資料或 `minecraft/data`、`mods`、`installer`、`backups` 目錄。
4. 開啟 **Container Manager → 專案 → 新增**，專案名稱填寫 `nas-game-server`，選擇根目錄並使用其中的 `compose.yaml`。
5. 建置並啟動專案，此時只會運行 `nas-game-controller`。
6. 在可信任的區域網路或 VPN 中開啟 `http://NAS區域網路IP:8088`，使用 `.env` 中的帳號登入。
7. 點選任一遊戲的「啟動」。第一次會建立對應容器，之後可直接啟動、停止或重新啟動。

Palworld REST 管理密碼 `PALWORLD_ADMIN_PASSWORD` 預設也是 `admin123`，它與網頁管理帳號是兩套獨立設定。正式使用時請分別改成不同的高強度密碼。遊戲使用 UDP `8211`，Steam 查詢使用 UDP `27015`；允許網際網路玩家加入時，必須同時在路由器和 Synology 防火牆放行。REST 連接埠 `8212` 未發布，不要轉送到網際網路。

啟動、停止和重新啟動會在背景執行。首頁的「日誌」預設顯示所有遊戲，詳情頁則預選目前遊戲；日誌每兩秒更新。首次啟動較慢時，總控會依序顯示目錄檢查、映像下載、容器建立和啟動命令。請依進度等待，不要重複點選啟動。

總控會在首次啟動 Minecraft 前建立 `minecraft/data`、`mods`、`installer` 和 `backups`。`HOST_PROJECT_PATH` 會掛載為 `/host-project`；修改 NAS 專案路徑後必須重新建立總控容器。

`${HOST_PROJECT_PATH}/controller` 會以唯讀方式掛載到 `/app`。首次升級到支援此掛載的版本時需重新建立一次總控；之後更新程式只需執行：

```bash
cd /volume1/docker/nas_game_server
docker restart nas-game-controller
```

網頁檔案更新後請強制重新整理瀏覽器，避免使用舊快取。

## 管理帳號

在根目錄 `.env` 中設定：

```env
CONTROL_ACCOUNTS_JSON={"admin":"admin123"}
CONTROL_SESSION_TTL_SECONDS=43200
```

可同時設定多個帳號：

```env
CONTROL_ACCOUNTS_JSON={"admin":"改成高強度密碼","family":"另一個密碼","operator":"第三個密碼"}
```

帳號只能包含英文字母、數字、點、連字號和底線，最長 32 個字元。密碼中的引號和反斜線需依 JSON 規則跳脫。修改後執行 `docker compose up -d --force-recreate controller`；現有工作階段會立即失效。預設密碼只適合可信任區域網路中的首次設定，請儘快更換。

頁面顯示「需遷移」代表仍有同名舊容器。保留資料並刪除舊容器後重新整理即可。若網頁連接埠衝突，修改 `CONTROL_PORT` 並重新建立總控。不要再將 `minecraft/compose.yaml` 部署為常駐專案，它僅供舊版參考。

## 運行邏輯

- 總控透過 `/var/run/docker.sock` 存取 Docker Engine，只能操作 `controller/games.json` 中註冊的固定容器名稱。
- 網頁操作會立即返回，背景同一時間只執行一個遊戲操作，並在頁面和日誌顯示進度。
- Minecraft 最多等待 120 秒，以便儲存世界並正常停止。
- 每次啟動或停止都會將容器重新啟動策略設為 `no`。
- 所有遊戲每 72 小時自動備份，也可手動備份。備份前會要求伺服器儲存世界，每個遊戲只保留最新一份；Project Zomboid 使用 `zomboid/backups/zomboid-latest.tar.gz`。

## 詳情與玩家管理

- 遊戲卡片顯示即時 CPU、記憶體和遊戲目錄總大小。
- 詳情顯示容器健康狀態、運行時間、世界、模式、難度、視距、驗證方式、白名單和最近備份。
- 所有遊戲的常用設定皆可編輯並寫入 `config/game-settings.json`。若容器已存在，總控會儲存世界、重建容器，再恢復原本的運行或停止狀態；資料和備份不會刪除。
- 密碼不會顯示。留空表示保持原值，也可選擇清除。新密碼會以純文字儲存在 NAS 的設定檔中，請勿公開分享。
- Minecraft 線上人數來自狀態協定；名稱、UUID、IP 和加入時間結合即時狀態、日誌及玩家資料。伺服器隱藏玩家樣本時，人數仍然準確。
- 玩家操作限於踢出、授予或取消管理員，以及加入或移出白名單。後端不接受任意主控台命令。
- 「儲存世界」執行 `save-all flush`；「立即備份」在背景建立一致性壓縮檔。
- Minecraft 詳情頁可上傳或刪除最大 512 MB 的 `.jar` Mod；修改後需重新啟動伺服器。
- Palworld 支援伺服器資訊、世界狀態、玩家資訊、踢出、封鎖、公告、儲存和備份。
- Terraria 使用 TShock，遊戲連接埠為 TCP `7777`；管理連接埠 `7878` 只綁定 NAS 本機，請勿轉送。
- Project Zomboid 使用 Build 42 與 RCON。網際網路連線需放行 UDP `16261`–`16263`；RCON TCP `27016` 只綁定 NAS 本機。
- 記憶體、磁碟和同時運行限制見上文「建議配置」。網頁遊戲卡片也會顯示即時 CPU、記憶體和目錄大小。

## 註冊其他遊戲

在 `controller/games.json` 的 `games` 陣列加入遊戲物件。每個遊戲可包含主服務和多個附屬服務，`startOrder` 控制啟動順序，停止時自動反向處理。

```json
{
  "id": "game-id",
  "name": "顯示名稱",
  "description": "伺服器類型",
  "version": "實際版本",
  "endpoint": "UDP/TCP 連接埠",
  "primary": "主容器名稱",
  "containers": [{"name":"固定容器名稱","role":"server","startOrder":10,"image":"映像名稱","networkMode":"host","environment":{},"binds":[]}]
}
```

註冊表支援 `${ENV_NAME:-default}` 範本。新增變數時也要透過根目錄 `compose.yaml` 傳入。修改後重新啟動 `nas-game-controller`；註冊遊戲不會自動啟動。圖示可用 `"icon": "/assets/檔名"` 指向 `controller/static/assets/` 中的本機檔案。

## 安全說明

Docker Socket 等同較高的 NAS 容器管理權限。總控雖不接受任意容器名稱、映像或命令，仍應只在可信任區域網路或 VPN 中使用。登入後簽發 12 小時暫時工作階段；HTTP 不會加密密碼和工作階段，請勿直接將 `8088` 暴露到網際網路。遠端管理應使用 Tailscale 或可信任的 HTTPS 反向代理。

玩家 IP 屬於敏感資訊，詳情頁只應在可信任網路中使用。Minecraft 若設定 `ONLINE_MODE=FALSE`，玩家名稱可能被冒用，不應直接公開到網際網路。
