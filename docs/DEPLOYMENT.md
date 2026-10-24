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

完成後會顯示 `https://ntu-ame-bme-alumni.<帳號>.workers.dev` 網址。此時前台可瀏覽，**後台尚無法使用**（需完成第 6、7 步，綁定網域並設定 Access 後才能登入）。

### 6. 綁定自訂網域（選擇性）

Cloudflare 後台 → Workers & Pages → `ntu-ame-bme-alumni` → Settings → Domains & Routes → Add → Custom Domain，輸入例如 `alumni.example.org`。

- 網域的 DNS 必須由 Cloudflare 代管（該網域需加入同一個 Cloudflare 帳號）。
- 若使用的是學校網域（例如 `*.ntu.edu.tw`）而 DNS 不在 Cloudflare，需另外與網管討論。
- 不綁自訂網域也可以：直接使用 `https://ntu-ame-bme-alumni.<帳號>.workers.dev`，第 7 步的 Access 同樣能只保護後台路徑（已實測）。

綁定後請一併更新：

- `astro.config.mjs` 的 `site`（目前是 `https://example.com`）。
- 若 Access 只設定了自訂網域，建議在 `wrangler.jsonc` 加上 `"workers_dev": false` 關閉 `workers.dev` 網址，避免同一網站有兩個入口（未受 Access 保護的入口，後台會一律回傳 403）。只在 Cloudflare 後台按 Disable 沒用，下次部署會被設定檔重新開啟。

修改後重新執行 `pixi run deploy`。

### 7. 設定後台登入（Cloudflare Access）

後台（`/admin`）與後台 API（`/api/admin`）由 Cloudflare Access 保護：管理者輸入 email → 收到 6 位數驗證碼 → 填入後才能進入。前台頁面不受影響。

> Cloudflare 後台介面時常改版，以下選單名稱以 2026 年 10 月的官方文件為準；若找不到，可在 Zero Trust 後台左上角搜尋欄輸入關鍵字。

#### 7-1. 啟用 Zero Trust（第一次才需要）

1. 登入 Cloudflare 後台，左側選單點 **Zero Trust**。
2. 設定 **Team name**（團隊名稱）：例如 `ntu-bime-alumni`。這會成為登入頁網址 `https://ntu-bime-alumni.cloudflareaccess.com`，之後要填進設定檔，請記下來。
3. 選擇方案 **Zero Trust Free**（50 位使用者以內免費）。此步驟需填付款資訊，但免費方案不會收費。

之後可在 **Zero Trust → Settings** 查看團隊名稱。

#### 7-2. 新增「Email 驗證碼」登入方式

新的 Zero Trust 預設**沒有**啟用 email 驗證碼，需手動加入：

1. **Zero Trust → Integrations → Identity providers**。
2. 在 **Your identity providers** 點 **Add new identity provider**。
3. 選 **One-time PIN**，儲存。

> 預設的 Cloudflare 登入方式要求管理者擁有 Cloudflare 帳號，不適合一般系友；建議只用 One-time PIN。

#### 7-3. 建立 Access 應用程式

1. **Zero Trust → Access controls → Applications** → **Create new application**。
2. 選 **Self-hosted and private**。
3. **Application name**：`系友會後台`。
4. 點 **Add public hostname**，新增**兩筆**：

   | Subdomain | Domain | Path |
   |---|---|---|
   | 依你的網址填（例如 `alumni`；若網址就是根網域則留空） | 從下拉選單選你的網域 | `admin` |
   | 同上 | 同上 | `api/admin` |

   使用 `workers.dev` 網址時，hostname 填 `ntu-ame-bme-alumni.<帳號>.workers.dev`，Path 同樣是 `admin` 與 `api/admin`。新版介面在 Self-hosted and private 之後會先詢問目的地類型（Private destination／Workers／Public DNS／Service auth）；自訂網域選 **Public DNS**。

   Path 會一併保護其下所有子路徑（例如 `/admin/gallery/3`）。**不要**保護整個網域，否則一般訪客也會被要求登入。

5. **Access policies**：點新增 policy（或 **Create new policy**）：
   - **Policy name**：`系友會管理者`
   - **Action**：**Allow**
   - **Include** → 選擇器選 **Emails** → 逐一填入管理者的 email
   - （可選）若管理者都使用同一個網域的信箱，也可用 **Emails ending in**，例如 `@ntu.edu.tw`；但這會讓所有該網域的人都能登入，通常不建議。
6. **Login methods**：只勾選 **One-time PIN**，並開啟 **Apply instant authentication**（只有一種登入方式時，直接跳到輸入 email 的畫面）。
7. **Session Duration**：`24 hours`（登入後 24 小時內不需再次驗證，可依需求調整）。
8. 點 **Create**。

#### 7-4. 取得設定值並填入網站

1. 回到 **Access controls → Applications**，在「系友會後台」點 **Configure**。
2. 在 **Additional settings**（或 Overview）找到 **Application Audience (AUD) Tag**，複製（一長串英數字）。
3. 填入 `wrangler.jsonc`：

   ```jsonc
   "vars": {
     "CF_ACCESS_TEAM_DOMAIN": "https://<團隊名稱>.cloudflareaccess.com",
     "CF_ACCESS_AUD": "<AUD Tag>"
   }
   ```

   - `CF_ACCESS_TEAM_DOMAIN` 要包含 `https://`，結尾**不要**加 `/`。
   - 這兩個值不是密碼，放在設定檔、commit 進 git 都沒問題。

4. 重新部署：`pixi run deploy`。

#### 7-5. 驗證

用瀏覽器的**無痕視窗**依序確認：

| 測試 | 預期結果 |
|---|---|
| 開啟 `https://<網域>/` | 正常顯示首頁，不需登入 |
| 開啟 `https://<網域>/admin` | 出現 Cloudflare 的 email 輸入頁 |
| 輸入**名單內**的 email，收信填入驗證碼 | 進入後台，右上角顯示該 email |
| 另開無痕視窗，輸入**名單外**的 email | 收不到驗證碼或顯示無權限，無法進入 |

若登入後後台顯示「需要登入才能使用後台」（403），通常是 `CF_ACCESS_TEAM_DOMAIN` 或 `CF_ACCESS_AUD` 填錯；可執行 `pixi run bunx wrangler tail` 查看錯誤訊息（會出現「Access JWT 驗證失敗」或「Cloudflare Access 尚未設定」）。

#### 7-6. 日後管理管理者名單

**Zero Trust → Access controls → Policies**（或從應用程式的 Policies 分頁）→ 編輯「系友會管理者」→ 增刪 Emails。儲存後立即生效，**不需要**修改程式或重新部署。

> 網站程式會再驗證一次 Access 簽發的 JWT（`src/lib/auth.ts`），即使有人繞過 Access 直接連線，未持有有效登入憑證也無法使用後台。

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
