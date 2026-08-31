# Synology NAS 遊戲伺服器總控

[简体中文](README.md) | [English](README.en.md) | **繁體中文** | [日本語](README.ja.md)

本專案採用「總控常駐、遊戲按需啟動」的方式運行。NAS 或專案首次啟動時只有 `nas-game-controller` 自動啟動；Minecraft 和其他已註冊的遊戲服務不會自動啟動。遊戲容器統一使用 `restart: no`，因此 NAS 重新啟動後仍會保持停止，直到你再次於網頁啟動。自動備份由總控內部排程負責，不需要額外的備份容器。

**文件目錄**

<pre>
nas_game_server
├── <a href="#guide">使用教學</a>
├── <a href="#layout">目錄結構</a>
│   ├── <a href="compose.yaml">compose.yaml</a>
│   ├── <a href=".env.example">.env.example</a>
│   ├── <a href="controller/">controller/</a>
│   │   ├── <a href="controller/Dockerfile">Dockerfile</a>
│   │   ├── <a href="controller/server.py">server.py</a>
│   │   ├── <a href="controller/games.json">games.json</a>
│   │   └── <a href="controller/static/">static/</a>
│   ├── <a href="minecraft/">minecraft/</a> · <a href="minecraft/README.md">說明</a>
│   ├── <a href="palworld/">palworld/</a> · <a href="palworld/README.md">說明</a>
│   ├── <a href="terraria/">terraria/</a> · <a href="terraria/README.md">說明</a>
│   └── <a href="zomboid/">zomboid/</a> · <a href="zomboid/README.md">說明</a>
├── <a href="#deploy">部署說明</a>
├── <a href="#accounts">管理帳號</a>
├── <a href="#runtime">運行邏輯</a>
├── <a href="#details">詳情與玩家管理</a>
├── <a href="#register">註冊其他遊戲</a>
└── <a href="#security">安全說明</a>
</pre>

<a id="guide"></a>
## 使用教學

1. 把整個專案複製到 NAS 的一個資料夾，例如 `/volume1/docker/nas_game_server`。
2. 確認該目錄裡有 `.env`。沒有的話，把 [`.env.example`](.env.example) 複製一份改名為 `.env`。路徑如果不是 `/volume1/docker/nas_game_server`，把其中的 `HOST_PROJECT_PATH` 改成實際路徑。
3. 開啟 Synology **Container Manager → 專案**，點 **新增**，路徑選剛複製的專案資料夾，再點 **加入**。建置並啟動後，只會運行總控 `nas-game-controller`。
4. 瀏覽器開啟 `http://NAS的區域網路IP:8088` 進入管理頁。預設帳號 `admin`，預設密碼 `admin123`。
5. 在管理頁點選某個遊戲的「啟動」。第一次會建立對應容器，之後可隨時停止或再啟動。

<a id="layout"></a>
## 目錄結構

點選檔名即可開啟對應內容。`data/`、`backups/` 等執行時目錄會在首次啟動遊戲時自動建立，倉庫預設不包含。

- [`compose.yaml`](compose.yaml) — 只啟動網頁總控
- [`.env.example`](.env.example) — 管理帳號、NAS 路徑和遊戲參數範本，複製為 `.env` 後使用
- `config/game-settings.json` — 網頁儲存的常用設定（執行後產生）
- [`controller/`](controller/)
  - [`Dockerfile`](controller/Dockerfile)
  - [`server.py`](controller/server.py) — Docker 控制 API 與靜態檔案服務
  - [`games.json`](controller/games.json) — 遊戲、資料路徑和容器註冊表
  - [`static/`](controller/static/) — 網頁控制面板與本機遊戲圖示
- [`minecraft/`](minecraft/) — [說明](minecraft/README.md)
  - `data/` — 世界和伺服器資料
  - [`mods/`](minecraft/mods/) — NeoForge 模組
  - [`installer/`](minecraft/installer/) — 離線 NeoForge 安裝程式
  - `backups/` — 自動與手動備份，只保留 latest
- [`palworld/`](palworld/) — [說明](palworld/README.md)
  - `data/` — Steam 伺服器、設定與世界存檔
  - `backups/` — Palworld 最新備份
- [`terraria/`](terraria/) — [說明](terraria/README.md)
  - `data/` — 世界、TShock 設定與外掛
  - `backups/` — Terraria 最新備份
- [`zomboid/`](zomboid/) — [說明](zomboid/README.md)
  - `data/` — 存檔、設定和 Workshop 資料
  - `server-files/` — Build 42 伺服器檔案
  - `backups/` — Project Zomboid 最新備份

<a id="deploy"></a>
## 部署說明

若舊的 `minecraft-neoforge` 專案仍在運行，先備份並確認世界位於 `minecraft/data`，再停止並刪除舊容器。舊版 `minecraft-backup` 容器也可刪除。只刪除容器，不要刪除資料或 `minecraft/data`、`mods`、`installer`、`backups` 目錄。

Palworld REST 管理密碼 `PALWORLD_ADMIN_PASSWORD` 預設也是 `admin123`，它與網頁管理帳號是兩套獨立設定。正式使用時請分別改成不同的高強度密碼。遊戲使用 UDP `8211`，Steam 查詢使用 UDP `27015`；允許網際網路玩家加入時，必須同時在路由器和 Synology 防火牆放行。REST 連接埠 `8212` 未發布，不要轉送到網際網路。

啟動、停止和重新啟動會在背景執行。首頁的「日誌」預設顯示所有遊戲，詳情頁則預選目前遊戲；日誌每兩秒更新。首次啟動較慢時，總控會依序顯示目錄檢查、映像下載、容器建立和啟動命令。請依進度等待，不要重複點選啟動。

總控會在首次啟動 Minecraft 前建立 `minecraft/data`、`mods`、`installer` 和 `backups`。`HOST_PROJECT_PATH` 會掛載為 `/host-project`；修改 NAS 專案路徑後必須重新建立總控容器。

`${HOST_PROJECT_PATH}/controller` 會以唯讀方式掛載到 `/app`。首次升級到支援此掛載的版本時需重新建立一次總控；之後更新程式只需執行：

```bash
cd /volume1/docker/nas_game_server
docker restart nas-game-controller
```

網頁檔案更新後請強制重新整理瀏覽器，避免使用舊快取。

<a id="accounts"></a>
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

<a id="runtime"></a>
## 運行邏輯

- 總控透過 `/var/run/docker.sock` 存取 Docker Engine，只能操作 `controller/games.json` 中註冊的固定容器名稱。
- 網頁操作會立即返回，背景同一時間只執行一個遊戲操作，並在頁面和日誌顯示進度。
- Minecraft 最多等待 120 秒，以便儲存世界並正常停止。
- 每次啟動或停止都會將容器重新啟動策略設為 `no`。
- 所有遊戲每 72 小時自動備份，也可手動備份。備份前會要求伺服器儲存世界，每個遊戲只保留最新一份；Project Zomboid 使用 `zomboid/backups/zomboid-latest.tar.gz`。

<a id="details"></a>
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
- Palworld 與 Project Zomboid 需要較多記憶體。20 GB NAS 建議按需單獨運行大型伺服器，避免同時啟動 Minecraft、Palworld 和 Project Zomboid。

<a id="register"></a>
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

<a id="security"></a>
## 安全說明

Docker Socket 等同較高的 NAS 容器管理權限。總控雖不接受任意容器名稱、映像或命令，仍應只在可信任區域網路或 VPN 中使用。登入後簽發 12 小時暫時工作階段；HTTP 不會加密密碼和工作階段，請勿直接將 `8088` 暴露到網際網路。遠端管理應使用 Tailscale 或可信任的 HTTPS 反向代理。

玩家 IP 屬於敏感資訊，詳情頁只應在可信任網路中使用。Minecraft 若設定 `ONLINE_MODE=FALSE`，玩家名稱可能被冒用，不應直接公開到網際網路。
