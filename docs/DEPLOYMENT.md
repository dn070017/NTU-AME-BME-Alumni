# 部署指南

本網站整體部署在 Cloudflare，不需要實體伺服器：

| 元件 | Cloudflare 服務 | 名稱（`wrangler.jsonc`） |
|---|---|---|
| 網站與 API | Workers（含靜態檔案 Assets） | `ntu-ame-bme-alumni` |
| 資料庫 | D1 | `alumni-db`（binding `DB`） |
| 圖片、PDF | R2 | `alumni-media`（binding `BUCKET`） |
| 後台登入 | Zero Trust Access | 保護 `/admin` 與 `/api/admin` |

所有指令都在專案根目錄執行，並透過 pixi 提供的 Node/Bun 環境（`pixi run ...`）。

---

## 一、首次部署

### 1. 登入 Cloudflare

```bash
pixi run bunx wrangler login
```

瀏覽器會開啟授權頁，登入系友會使用的 Cloudflare 帳號。確認登入的帳號：

```bash
pixi run bunx wrangler whoami
```

### 2. 建立 D1 資料庫

```bash
pixi run bunx wrangler d1 create alumni-db
```

把輸出中的 `database_id` 填入 `wrangler.jsonc` 的 `d1_databases[0].database_id`（取代目前的 `00000000-...`）。

### 3. 建立 R2 bucket

```bash
pixi run bunx wrangler r2 bucket create alumni-media
```

> 第一次使用 R2 需先在 Cloudflare 後台啟用 R2（免費方案也需綁定付款方式，但 10 GB 內不收費）。

### 4. 建立資料表

```bash
pixi run bun run db:migrate:remote
```

### 5. 部署網站

```bash
pixi run deploy
```

完成後會顯示 `https://ntu-ame-bme-alumni.<帳號>.workers.dev` 網址。此時前台可瀏覽，**後台尚無法使用**（第 7 步設定 Access 後才能登入）。

### 6. 綁定自訂網域（建議）

Cloudflare 後台 → Workers & Pages → `ntu-ame-bme-alumni` → Settings → Domains & Routes → Add → Custom Domain，輸入例如 `alumni.example.org`。

- 網域的 DNS 必須由 Cloudflare 代管（該網域需加入同一個 Cloudflare 帳號）。
- 若使用的是學校網域（例如 `*.ntu.edu.tw`）而 DNS 不在 Cloudflare，需另外與網管討論；在此之前可先使用 `workers.dev` 網址。

綁定後請一併更新：

- `astro.config.mjs` 的 `site`（目前是 `https://example.com`）。
- 建議在 `wrangler.jsonc` 加上 `"workers_dev": false`，關閉 `workers.dev` 網址，避免同一網站有兩個入口。

修改後重新執行 `pixi run deploy`。

### 7. 設定後台登入（Cloudflare Access）

1. Cloudflare 後台 → **Zero Trust**（第一次進入需選擇團隊名稱，例如 `ntu-bime-alumni`，並選 Free 方案）。
2. Access → Applications → **Add an application** → **Self-hosted**。
3. Application 設定：
   - Name：`系友會後台`
   - Session duration：例如 `24 hours`
   - Public hostname：新增 **兩筆**，網域填第 6 步的自訂網域（未綁網域則填 workers.dev 網址）
     - Path：`admin*`
     - Path：`api/admin*`
4. Policy：
   - Action：**Allow**
   - Include → **Emails**：填入可管理網站的管理者 email（之後可隨時增減）
   - 登入方式預設為 One-time PIN（寄驗證碼到 email），不需另外設定。
5. 儲存後，在 Application 的 Overview 頁複製 **Application Audience (AUD) Tag**。
6. 團隊網域可在 Zero Trust → Settings → Custom Pages（或 Team domain）看到，格式為 `https://<團隊名稱>.cloudflareaccess.com`。
7. 填入 `wrangler.jsonc`：

   ```jsonc
   "vars": {
     "CF_ACCESS_TEAM_DOMAIN": "https://<團隊名稱>.cloudflareaccess.com",
     "CF_ACCESS_AUD": "<AUD Tag>"
   }
   ```

8. 重新部署：`pixi run deploy`。

驗證：以無痕視窗開啟 `https://<網域>/admin`，應先出現 Cloudflare Access 的 email 驗證頁，輸入名單內的 email 並填入驗證碼後進入後台，右上角顯示登入的 email。

> 網站程式會再驗證一次 Access 簽發的 JWT（`src/lib/auth.ts`）。若 `CF_ACCESS_*` 未設定或有誤，後台一律回傳 403，不會被未登入者存取。

### 8. 匯入既有內容（選擇性）

把生機系網站上既有的系友會內容（文章、PDF、相簿、商品）匯入正式環境：

```bash
# 若 assets/initial_data 已存在可略過；需要更新來源資料時再執行
pixi run scrape

pixi run import-remote
```

- 匯入以來源網址去重，重複執行不會產生重複資料。
- 匯入過程會將圖片轉檔並上傳到 R2，約需數分鐘。
- 此指令透過 wrangler 的 remote bindings 直接寫入正式的 D1/R2，需先完成第 1–4 步。
- ⚠️ 正式公開前，請先與系辦及受訪者確認可使用這些內容。

---

## 二、日常更新

### 更新網站程式

```bash
pixi run deploy
```

### 修改資料表結構

修改 `src/db/schema.ts` 後：

```bash
pixi run bun run db:generate        # 產生 drizzle/ 底下的 migration SQL
pixi run bun run db:migrate:local   # 套用到本地，測試
pixi run bun run db:migrate:remote  # 確認無誤後套用到正式環境
pixi run deploy
```

> 請先套用 migration 再部署程式，避免新程式讀取尚不存在的欄位。

### 回復到前一版

```bash
pixi run bunx wrangler deployments list   # 查看部署紀錄
pixi run bunx wrangler rollback           # 回復到前一版
```

Rollback 只回復程式，不會回復資料庫與 R2 檔案。

### 查看線上錯誤紀錄

```bash
pixi run bunx wrangler tail
```

---

## 三、備份

### 資料庫

```bash
pixi run bunx wrangler d1 export alumni-db --remote --output=backup-$(date +%Y%m%d).sql
```

D1 另有內建的 Time Travel，可回復到過去 30 天內的任一時間點：

```bash
pixi run bunx wrangler d1 time-travel info alumni-db
```

### 檔案（R2）

R2 沒有內建快照。若需完整備份，可在 Cloudflare 後台建立 R2 API Token 後，以 `rclone` 等 S3 相容工具同步 `alumni-media` 到本機或其他儲存空間。

---

## 四、免費額度參考

| 服務 | 免費額度（以 Cloudflare 官方公告為準） | 本站用量預估 |
|---|---|---|
| Workers | 每日 100,000 次請求 | 系友會網站流量遠低於此 |
| D1 | 5 GB 儲存、每日 500 萬次讀取 | 純文字資料，極小 |
| R2 | 10 GB 儲存、無流量費 | 目前約 100 MB；照片已壓縮（大圖約 300–500 KB／張） |
| Access | 50 位使用者 | 管理者人數 |

目前打包後的 Worker 約 370 KB（gzip），低於免費方案 3 MB 上限。

---

## 五、設定檔與環境參數總覽

| 位置 | 用途 | 是否部署到線上 |
|---|---|---|
| `wrangler.jsonc` | Worker 名稱、D1/R2 binding、`CF_ACCESS_*` | 是 |
| `.dev.vars` | 本地開發參數（`DEV_BYPASS_AUTH` 等） | **否**，僅本地使用 |
| `.env` | 同上，供其他工具讀取 | **否** |
| `astro.config.mjs` | `site`（正式網址） | 是（建置時使用） |

`DEV_BYPASS_AUTH` 只會在本地（`localhost`）生效；即使誤設到線上，程式也會因網址不是 localhost 而忽略。
