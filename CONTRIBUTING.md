# 參與開發

這份文件說明怎麼在本機執行檢查、怎麼送出改動。做法背後的理由與踩過的坑見 [docs/ENGINEERING.md](./docs/ENGINEERING.md)。

## 環境

- Node.js 22 以上。
- 遊戲本身沒有建置步驟，也沒有執行時的相依套件；`package.json` 只安裝測試用的 Playwright。

```sh
npm install --no-package-lock
npx playwright install chromium
```

## 執行遊戲

`index.html` 要透過 HTTP 載入（圖片需要核對雜湊，直接用 `file://` 開啟會被瀏覽器擋下）。在 repository 根目錄啟動任何靜態伺服器即可，例如：

```sh
python3 -m http.server 8000
# 然後開啟 http://localhost:8000/
```

## 執行檢查

```sh
npm test                                  # 發布前的完整把關：素材、冒煙測試、全部測試（Chromium）
node --test tests/layout.test.mjs         # 只跑一個測試檔
WAM_BROWSER=firefox npm test              # 換瀏覽器：chromium（預設）、firefox、webkit
```

突變檢查很重，**本機只跑單一項目**，完整清單交給 CI：

```sh
node scripts/mutation-check.mjs --strict --only "penguin +1 becomes +5"
```

確定要改變行為時，才重錄比對用的資料：

```sh
UPDATE_GOLDEN=1 node --test "tests/**/*.test.mjs"
```

重錄了哪一種資料，決定版號進哪一段，見 [docs/VERSIONING.md](./docs/VERSIONING.md)。

## 送出改動

1. 從 `main` 開新分支，一個 Pull Request 只做一件事。
2. 行為有變就補測試。測試只觀察玩家看得到的結果（畫面、聲音、儲存的分數），不讀遊戲內部的變數、不比對原始碼。
3. 新增的行為，在 `scripts/mutation-check.mjs` 補一個「把它改壞」的項目，並用 `--only` 確認它會被測試抓到。
4. 改過 `index.html` 既有的程式碼後，確認突變清單裡每個搜尋字串在檔案中仍然恰好出現一次（`--strict` 會把找不到的字串當成錯誤；出現兩次的要自己檢查）。
5. 玩家感受得到的改動要進版：依 [docs/VERSIONING.md](./docs/VERSIONING.md) 改版號、日期與 CHANGELOG。測試、CI、文件的改動不進版。
6. 版面有變時，看 CI 產出的截圖（三種瀏覽器各一份），不要只看自己的螢幕。
7. CI 的 8 項檢查全部通過才合併，使用 merge commit。檢查失敗時先分清楚是程式的問題還是環境的問題，不要直接重跑到通過為止。

## 寫法上的約定

- 遊戲是單一的 `index.html`，不引入框架或建置工具。
- 動畫只用位移、縮放與透明度；尊重系統的「減少動態效果」設定。
- 素材檔名帶內容雜湊；換了內容就換檔名，並更新 `deployment/` 裡的清單。
- 新素材要有明確的授權，並把曲名、作者、來源、授權記進清單與 [CREDITS.md](./CREDITS.md)。
- CHANGELOG 用玩家看得懂的話寫；只影響開發的放在「給開發者」。
