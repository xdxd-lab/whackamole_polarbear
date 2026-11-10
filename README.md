# 雪地敲敲樂 · Whackamole Polarbear

**[開始遊戲（GitHub Pages）](https://xdxd-lab.github.io/whackamole_polarbear/)**

使用瀏覽器即可遊玩，不需要下載或安裝。手機可觸控操作，電腦可使用滑鼠。

## 目前版本

- **V19（19.0.0，2026-11-10）**：棋盤改為雪磚與冰洞、敲擊處出現圓點與擴散環、雪花循環不再跳動；所有控制項在各種螢幕都按得到；玩法與計分和 V18 相同。
- 各版變更：[CHANGELOG.md](./CHANGELOG.md)　版號規則：[docs/VERSIONING.md](./docs/VERSIONING.md)
- 遊戲入口：[index.html](./index.html)
- 正式角色素材（沿用 V16，未更動圖片）：[assets/v16-20260909/](./assets/v16-20260909/)
- 原始碼 Repository：[xdxd-lab/whackamole_polarbear](https://github.com/xdxd-lab/whackamole_polarbear)

## 遊戲規則

每局 30 秒，可選擇「悠閒」、「普通」或「高手」難度。敲到企鵝得 1 分，北極狐得 3 分；誤敲北極熊扣 2 分並中斷連擊。最高分儲存在遊玩裝置的瀏覽器中。

> **注意：** GitHub Pages 是線上遊玩網址。單獨下載 `index.html` 並非完整離線版，因為遊戲還需要同一 Repository 中的角色圖片素材。

## 自動化驗證

每次推送至 `main`、提出 Pull Request 或手動執行時，GitHub Actions 會在 Chromium 跑完下列檢查。測試只觀察玩家看得到的結果（畫面、音效、震動、儲存的最高分），所以整理或搬動程式碼不會誤判。

| 檢查 | 內容 |
|---|---|
| 素材核對 | 三張正式 AVIF 的路徑、大小、SHA-256、尺寸與 15 個角色狀態的解碼；真實計時下的啟動冒煙測試 |
| 規則測試 | 分數、連擊、機率、三種難度的毫秒時序、30 秒、BEST_KEY、音效與輸入 |
| 整局重播 | 固定時鐘與亂數重播五局，逐行比對 V18 的錄製結果 |
| 畫面狀態 | 三種角色 × 五種狀態 × 三種視窗的計算後樣式與顯示影格 |
| 突變檢查 | 故意改壞規則確認測試會失敗，並確認等價重構不會誤判 |
| 版號一致 | 頁面、README 與 CHANGELOG 寫的版號與日期必須相同 |

本機執行（`node` 需為 22 以上）：

```sh
npm install --no-package-lock
npx playwright install chromium
npm test                # 等同 node scripts/verify-assets.mjs
npm run test:mutation
```

確定要變更行為時，才用 `UPDATE_GOLDEN=1 node --test "tests/**/*.test.mjs"` 更新錄製檔。

- [驗證工作流程](./.github/workflows/verify.yml)
- [素材核對程式](./scripts/verify-assets.mjs)
- [測試](./tests/)
- [GitHub Actions](https://github.com/xdxd-lab/whackamole_polarbear/actions/workflows/verify.yml)
