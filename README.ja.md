# Synology NAS ゲームサーバー管理

[简体中文](README.md) | [English](README.en.md) | [繁體中文](README.zh-TW.md) | **日本語**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

このプロジェクトはコントローラーだけを常駐させ、ゲームサーバーを必要なときだけ起動します。NAS またはプロジェクトの起動時に自動起動するのは `nas-game-controller` のみです。Minecraft とその他の登録済みゲームは、Web 画面から起動するまで停止したままです。ゲームコンテナはすべて `restart: no` を使用するため、NAS の再起動後も自動では起動しません。自動バックアップはコントローラー内部で実行され、別のバックアップコンテナは不要です。

**目次**

<pre>
nas_game_server
├── <a href="#guide">使い方</a>
├── <a href="#layout">ディレクトリ構成</a>
│   ├── <a href="LICENSE">LICENSE</a>
│   ├── <a href="compose.yaml">compose.yaml</a>
│   ├── <a href=".env.example">.env.example</a>
│   ├── <a href="controller/">controller/</a>
│   │   ├── <a href="controller/Dockerfile">Dockerfile</a>
│   │   ├── <a href="controller/server.py">server.py</a>
│   │   ├── <a href="controller/games.json">games.json</a>
│   │   └── <a href="controller/static/">static/</a>
│   ├── <a href="minecraft/">minecraft/</a> · <a href="minecraft/README.md">説明</a>
│   ├── <a href="palworld/">palworld/</a> · <a href="palworld/README.md">説明</a>
│   ├── <a href="terraria/">terraria/</a> · <a href="terraria/README.md">説明</a>
│   └── <a href="zomboid/">zomboid/</a> · <a href="zomboid/README.md">説明</a>
├── <a href="#deploy">導入時の補足</a>
├── <a href="#accounts">管理アカウント</a>
├── <a href="#runtime">動作仕様</a>
├── <a href="#details">詳細画面とプレイヤー管理</a>
├── <a href="#register">ゲームの追加登録</a>
├── <a href="#security">セキュリティ</a>
├── <a href="#disclaimer">免責事項</a>
└── <a href="#license">ライセンス</a>
</pre>

<a id="guide"></a>
## 使い方

1. プロジェクト一式を NAS のフォルダへコピーします。例：`/volume1/docker/nas_game_server`。
2. [`.env.example`](.env.example) を `.env` にコピーします（`.env` はコミットしないでください）。パスが `/volume1/docker/nas_game_server` でない場合は、`HOST_PROJECT_PATH` を実際のパスに変更します。
3. **Container Manager → プロジェクト** を開き、**作成** でコピー先フォルダを指定して **追加** します。ビルドと起動後に動くのはコントローラー `nas-game-controller` だけです。
4. ブラウザーで `http://NASのLAN-IP:8088` を開き、管理画面に入ります。初期ユーザー名 `admin`、パスワード `admin123`。
5. 管理画面で任意のゲームの「起動」を選びます。初回はコンテナが作成され、以降はいつでも停止・再起動できます。

<a id="layout"></a>
## ディレクトリ構成

名前をクリックすると、そのファイルまたはフォルダを開けます。`data/` や `backups/` などの実行時ディレクトリは初回起動時に自動作成され、リポジトリには含まれません。

- [`LICENSE`](LICENSE) — MIT ライセンス
- [`compose.yaml`](compose.yaml) — Web コントローラーのみを起動
- [`.env.example`](.env.example) — 管理アカウント、NAS パス、ゲーム設定のテンプレート。`.env` にコピーして記入し、`.env` はコミットしない
- `config/game-settings.json` — Web 画面で保存した一般設定（実行後に生成。パスワードを含む）
- [`controller/`](controller/)
  - [`Dockerfile`](controller/Dockerfile)
  - [`server.py`](controller/server.py) — Docker 制御 API と静的ファイル配信
  - [`games.json`](controller/games.json) — ゲーム、データパス、コンテナ登録
  - [`static/`](controller/static/) — Web 管理画面とローカルのゲームアイコン
- [`minecraft/`](minecraft/) — [説明](minecraft/README.md)
  - `data/` — ワールドとサーバーデータ
  - [`mods/`](minecraft/mods/) — NeoForge Mod
  - [`installer/`](minecraft/installer/) — オフライン NeoForge インストーラー
  - `backups/` — 自動・手動バックアップ（最新 1 件のみ）
- [`palworld/`](palworld/) — [説明](palworld/README.md)
  - `data/` — Steam サーバー、設定、ワールドセーブ
  - `backups/` — Palworld の最新バックアップ
- [`terraria/`](terraria/) — [説明](terraria/README.md)
  - `data/` — ワールド、TShock 設定、プラグイン
  - `backups/` — Terraria の最新バックアップ
- [`zomboid/`](zomboid/) — [説明](zomboid/README.md)
  - `data/` — セーブ、設定、Workshop データ
  - `server-files/` — Build 42 サーバー本体
  - `backups/` — Project Zomboid の最新バックアップ

<a id="deploy"></a>
## 導入時の補足

古い `minecraft-neoforge` プロジェクトが動作中の場合はバックアップを作成し、ワールドが `minecraft/data` にあることを確認してから古いコンテナを停止・削除します。旧 `minecraft-backup` コンテナも削除できます。コンテナだけを削除し、データや `minecraft/data`、`mods`、`installer`、`backups` は削除しないでください。

Palworld の REST 管理パスワード `PALWORLD_ADMIN_PASSWORD` も初期値は `admin123` です。Web 管理アカウントとは別の設定です。ゲームは UDP `8211`、Steam クエリは UDP `27015` を使用します。インターネットから接続させる場合は、ルーターと Synology ファイアウォールの両方で許可してください。REST ポート `8212` は公開されていないため、インターネットへ転送しないでください。

起動、停止、再起動はバックグラウンドで実行されます。ホーム画面の「ログ」では全ゲーム、詳細画面から開いた場合はそのゲームが最初に選択され、2 秒ごとに更新されます。初回起動が長い場合、ディレクトリ確認、イメージ取得、コンテナ作成、起動コマンドが順番に表示されます。進行中に起動を繰り返し選択しないでください。

Minecraft の初回起動前に、コントローラーが `minecraft/data`、`mods`、`installer`、`backups` を作成します。`HOST_PROJECT_PATH` は `/host-project` にマウントされます。NAS 上のパスを変更した場合は、コントローラーを再起動するだけでなく再作成してください。

`${HOST_PROJECT_PATH}/controller` は `/app` に読み取り専用でマウントされます。このマウントがない旧バージョンからの初回更新時だけコントローラーを再作成してください。その後のコード更新は次のコマンドで反映できます。

```bash
cd /volume1/docker/nas_game_server
docker restart nas-game-controller
```

Web ファイル更新後は、古いキャッシュを使わないようブラウザーを強制再読み込みしてください。

<a id="accounts"></a>
## 管理アカウント

ルートの `.env` で設定します。

```env
CONTROL_ACCOUNTS_JSON={"admin":"admin123"}
CONTROL_SESSION_TTL_SECONDS=43200
```

複数アカウントも使用できます。

```env
CONTROL_ACCOUNTS_JSON={"admin":"strong-password","family":"another-password","operator":"third-password"}
```

ユーザー名には英数字、ピリオド、ハイフン、アンダースコアを使用でき、最大 32 文字です。パスワード内の引用符とバックスラッシュは JSON の規則に従ってエスケープしてください。変更後に `docker compose up -d --force-recreate controller` を実行すると、既存のセッションは直ちに無効になります。`.env` には秘密情報が含まれるため gitignore 済みで、コミットしないでください。

画面に「移行が必要」と表示される場合、管理対象外の同名コンテナが残っています。データを保持したまま古いコンテナを削除し、画面を更新してください。Web ポートが競合する場合は `.env` の `CONTROL_PORT` を変更してコントローラーを再作成します。`minecraft/compose.yaml` は旧構成の参考用であり、常駐プロジェクトとして別途起動しないでください。

<a id="runtime"></a>
## 動作仕様

- コントローラーは `/var/run/docker.sock` 経由で Docker Engine に接続し、`controller/games.json` に登録された固定コンテナ名だけを操作します。
- Web 操作はすぐに応答し、バックグラウンドで一度に 1 件のゲーム操作を実行します。現在の段階は画面とログに表示されます。
- Minecraft の正常終了時は、ワールド保存のため最大 120 秒待機します。
- 起動または停止のたびに、ゲームコンテナの再起動ポリシーを `no` にします。
- すべてのゲームを 72 時間ごとに自動バックアップでき、手動バックアップにも対応します。先にワールド保存を要求し、最新の 1 件だけを保持します。Project Zomboid は `zomboid/backups/zomboid-latest.tar.gz` を使用します。

<a id="details"></a>
## 詳細画面とプレイヤー管理

- ゲームカードには CPU、メモリ、ゲームディレクトリ全体のサイズが表示されます。
- 詳細画面にはコンテナのヘルス、稼働時間、ワールド、モード、難易度、描画距離、認証、許可リスト、最新バックアップが表示されます。
- 全ゲームの一般設定を編集でき、`config/game-settings.json` に保存されます。既存コンテナがある場合、ワールドを保存してコンテナを再作成し、以前の起動・停止状態へ戻します。データやバックアップは削除しません。
- パスワードは表示されません。空欄なら現在値を維持し、削除オプションも選べます。新しいパスワードは NAS の設定ファイルに平文で保存されるため、公開しないでください。
- Minecraft のオンライン人数はステータスプロトコルから取得します。名前、UUID、IP、参加時刻にはステータス、ログ、プレイヤーデータを使用します。プレイヤーサンプルが非公開でも人数は正確です。
- 操作はキック、OP の付与・解除、許可リストへの追加・削除に限定されます。バックエンドは名前を検証し、任意のコンソールコマンドを受け付けません。
- 「ワールドを保存」は `save-all flush` を実行し、「今すぐバックアップ」はバックグラウンドで一貫性のあるアーカイブを作成します。
- Minecraft の詳細画面では最大 512 MB の `.jar` Mod を追加・削除できます。変更後は Minecraft を再起動してください。
- Palworld はサーバー・ワールド情報、プレイヤー情報、キック、BAN、通知、保存、バックアップに対応します。
- Terraria は TShock を使用します。ゲームポートは TCP `7777`、管理ポート `7878` は NAS ローカル専用で、外部へ転送しないでください。
- Project Zomboid は Build 42 と RCON を使用します。外部接続には UDP `16261`–`16263` が必要で、RCON TCP `27016` は NAS ローカル専用です。
- Palworld と Project Zomboid は多くのメモリを使用します。20 GB の NAS では大型サーバーを必要なときだけ個別に実行し、Minecraft、Palworld、Project Zomboid の同時実行は避けてください。

<a id="register"></a>
## ゲームの追加登録

`controller/games.json` の `games` 配列へゲームオブジェクトを追加します。1 つのゲームにプライマリサービスと複数の付随サービスを設定でき、`startOrder` が起動順を制御します。停止時は逆順です。

```json
{
  "id": "game-id",
  "name": "表示名",
  "description": "サーバー種別",
  "version": "実バージョン",
  "endpoint": "UDP/TCP ポート",
  "primary": "プライマリコンテナ名",
  "containers": [{"name":"固定コンテナ名","role":"server","startOrder":10,"image":"イメージ名","networkMode":"host","environment":{},"binds":[]}]
}
```

登録ファイルは `${ENV_NAME:-default}` 形式に対応します。新しい環境変数はルートの `compose.yaml` からコントローラーへ渡してください。変更後に `nas-game-controller` を再起動します。登録しただけではゲームは起動しません。`"icon": "/assets/file.png"` で `controller/static/assets/` 内のローカル画像を指定できます。

<a id="security"></a>
## セキュリティ

Docker Socket へのアクセスには高いコンテナ管理権限があります。画面から任意のコンテナ名、イメージ、コマンドを入力することはできませんが、コントローラーは信頼できる LAN または VPN 内だけで使用してください。ログイン後の一時セッションは 12 時間有効です。HTTP は認証情報やセッションを暗号化しないため、`8088` をインターネットへ直接公開しないでください。リモート管理には Tailscale または信頼できる HTTPS リバースプロキシを使用してください。

プレイヤーの IP アドレスは機密情報です。詳細画面は信頼できるネットワーク内だけで使用してください。Minecraft で `ONLINE_MODE=FALSE` を設定するとプレイヤー名を偽装できるため、サーバーをインターネットへ直接公開しないでください。

<a id="disclaimer"></a>
## 免責事項

本プロジェクトは家庭やキャンパスなど**信頼できる LAN での学習・個人利用**を想定しています。作者はインターネット公開の導入をサポートせず、利用方法について保証しません。

本プロジェクトやゲームサーバーをインターネットへ公開したり、商用利用したり、侵害コンテンツを配布したり、ゲームパブリッシャーの EULA・利用規約や現地法令に違反したりした場合、**その責任はすべて利用者にあります**。それによって生じた損失、処分、紛争について、作者および貢献者は責任を負いません。

<a id="license"></a>
## ライセンス

本リポジトリのうち、本プロジェクトが作成したソースコード、Compose 設定、ドキュメントは [MIT License](LICENSE) です。自由に利用、改変、再配布できます。

次のものは MIT の対象外で、各権利者に帰属します。

- Minecraft、Palworld、Terraria、Project Zomboid のゲーム本体、専用サーバー、Mod、セーブ（実行時にイメージまたは Steam から取得。各 EULA / 利用規約に従ってください）
- [`controller/static/assets/`](controller/static/assets/) のゲームアイコン。出典は [ATTRIBUTION.md](controller/static/assets/ATTRIBUTION.md)
- 第三者の Docker イメージ（`itzg/minecraft-server` や Palworld / Terraria / Zomboid など）。各イメージ自身のライセンスに従います

本プロジェクトはこれらのパブリッシャー公式製品ではなく、提携・後援もありません。`.env`、ワールドセーブ、パスワードを含む `config/game-settings.json` は Git にコミットしないでください。
