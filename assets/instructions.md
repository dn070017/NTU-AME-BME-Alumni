# Plan
仔細的閱讀這份檔案，先對使用者提案你的前後端、資料庫解決方案，等使用者同意後再進行實做，這個專題會是一個 Human-in-a-loop 的方案，重要的決策需要跟使用者討論並等待使用者審核後再進行，自動化的完成所有任務不是這個專題的 Best Practice

# General
這是一個中華民國臺灣大學生機農機系友會的組織網站，主要的目的是宣傳系友會活動、分享系友消息動向以及吸引投資。

# Development
利用 ./.env 設置需要的環境參數以供測試使用，開發時利用 pixi 管理 NodeJS 套件（以及 bun/npm）接著利用 bun/npm 來安裝需要的網頁開發套件。

# Deployment
會希望前後端、資料庫都利用 Cloudflare 進行部屬，最後不會部屬在實體的伺服器。開發時須考慮相容的解決方案。不需要自動部屬，會在部屬時由使用者向你詢問指令。

# Backend
會需要儲存部落格文章、文章內的圖片、上傳的 PDF 以及上傳的影像。

# Website Style
色彩與風格參照無印風，用現代網站的字體，可以有少部份的動畫，主色輔色的使用可參照 `assets/Logo-A.png`, `assets/Logo-B.png`,  `assets/插圖.png`

## 視覺方向（已確認）
* 整體：無印風，大量留白、細線條、低飽和度，色彩僅作點綴（hover、標籤、卡片邊框、分隔線），避免大面積高彩度色塊
* 色票（取自 Logo，使用時可再降低飽和度）
    * 背景（米白）：`#F7F5F0`；卡片/區塊次背景：`#EFECE6`
    * 主文字（暖灰黑）：`#3A3835`；次文字：`#7A766F`；細線：`#DDD8CF`
    * 灰藍（Logo 字色，主色）：`#84A2B4`
    * 珊瑚紅（齒輪角色）：`#D4737F`
    * 芥末黃（星形角色）：`#F2D488`
    * 鼠尾草綠（DNA 角色）：`#96C4A4`
* 字體：中文 `Noto Sans TC`，英數 `Inter`；字重以 400/500 為主，標題 600，避免過粗
* 動畫：僅限淡入、輕微位移（進場）、hover 過渡；首頁區塊以 CSS `scroll-snap` 實作一格一區塊
* 素材注意：Logo PNG 解析度僅約 206px，首頁大尺寸使用時應嘗試從 `assets/Logo/Logos.pptx` 取出高解析版本
* 首頁 Logo 配置：系友會區塊標題上方為 `assets/Logo/Logo-Main.png`；捐款資訊區塊標題上方並排 `Logo-A.png` 與 `Logo-B.png`

# Website Content
## Navbar:
* 左側：放 Logo 文字標（`assets/Logo/Logo-Text.png`），alttext: 中華民國臺灣大學生機農機系友會（點選以後回到首頁）
* 右側
    * 活動公告
    * 系友演講
    * 系友訪談
    * 精彩點滴
    * 相關資料
    * 商品贊助  

## Content of the Websites: 
* 系友會
    * 內容參照 [assets/frontpage.md](./assets/frontpage.md)
* 活動公告
    * 內容參照 https://www.bime.ntu.edu.tw/News_n_202717_sms_130164.html
    * 會需要有一個後台能夠管理並編輯內容
    * 希望內容的編輯可以用一些現代的部落格文章編輯工具（可插入圖片文字基礎排版、嵌入 Youtube 連結等等）
* 系列演講
    * 內容參照 https://www.bime.ntu.edu.tw/News_n_201406_sms_129202.html
    * 會需要有一個後台能夠管理並編輯內容
    * 內容的管理只需要上傳一份 PDF 以及 Title、紀錄上傳時間等
    * 內容的檢視用內嵌 PDF
* 系友訪談
    * 內容參照 https://www.bime.ntu.edu.tw/News_n_172571_sms_105681.html
    * 會需要有一個後台能夠管理並編輯內容
    * 希望內容的編輯可以用一些現代的部落格文章編輯工具（可插入圖片文字基礎排版、嵌入 Youtube 連結等等）
* 精彩點滴
    * 內容參照 https://www.bime.ntu.edu.tw/News_Photo_n_196782_sms_125810.html
    * 會需要有一個後台能夠管理並編輯內容
    * 內容的管理需要批次上傳影像 以及 Title、紀錄上傳時間等
    * 內容的檢視希望類似 Google Photo，點入後會先進到所有影像的瀏覽畫面，然後點選進入其中一張後可以進入幻燈片切換上下張
* 相關資料
    * 內容參照 https://www.bime.ntu.edu.tw/News_n_204391_sms_131437.html
    * 會需要有一個後台能夠管理並編輯內容
    * 內容的管理只需要上傳一份 PDF 以及 Title、紀錄上傳時間等
    * 內容的檢視用內嵌 PDF
* 商品贊助
    * 內容參照 [assets/商品贊助](./assets/商品贊助)
    * 目前資料夾內的內容為`商品名稱-價格.png`
    * 會需要有一個後台能夠管理並編輯內容
    * 內容的管理需要上傳商品圖片、商品名稱、商品敘述、紀錄上傳時間等
    * 內容的檢視希望用現代的商品陳列頁面，目前商品較少可以用櫥窗式顯示（圖片搭配商品名稱與價格）

# 已確認決策
* 框架：Astro 5 + `@astrojs/cloudflare`（部署於 Cloudflare Workers），後台互動元件用 React islands
* 資料庫：Cloudflare D1 + Drizzle ORM；檔案儲存：Cloudflare R2
* 文章編輯器：Tiptap；PDF 檢視：PDF.js；相簿幻燈片：PhotoSwipe；圖片於瀏覽器端壓縮並產生縮圖後上傳
* 後台登入：Cloudflare Access（Zero Trust）保護 `/admin` 與寫入 API，本地開發略過驗證
* 既有內容：撰寫腳本將 bime.ntu.edu.tw 上的既有文章、PDF、照片抓取並暫存於 `assets/initial_data`，再匯入 D1/R2 作為初始資料
* 商品贊助：資料欄位加入價格；暫不需要購買連結（後續將串接藍新金流，需等待審核）
