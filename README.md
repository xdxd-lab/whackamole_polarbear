# 雪地敲敲樂 · Whackamole Polarbear

**[開始遊戲（GitHub Pages）](https://xdxd-lab.github.io/whackamole_polarbear/)**

使用瀏覽器即可遊玩，不需要下載或安裝。手機可觸控操作，電腦可使用滑鼠。

## 目前版本

- **V21（21.2.1，2026-11-12）**：點擊效果改為半透明的「魔法小鎚」光圈與星點。每個難度各有自己的最高分；遊戲中改難度立即生效，該局變成不計入紀錄的練習局。切換分頁時遊戲暫停，回來按「繼續」接著玩；計分與每局 30 秒不變，原有的最高分保留為「普通」的紀錄。背景音樂四首每局輪流（Happy、Snowfall、Clappy、Snow Theme）；不支援 AVIF 的舊裝置也能顯示角色。
- 各版變更：[CHANGELOG.md](./CHANGELOG.md)　版號規則：[docs/VERSIONING.md](./docs/VERSIONING.md)
- 遊戲入口：[index.html](./index.html)
- 正式角色素材（沿用 V16，未更動圖片）：[assets/v16-20260909/](./assets/v16-20260909/)
- 背景音樂（CC0）：[assets/music-20261110/](./assets/music-20261110/)、[assets/music-20261111/](./assets/music-20261111/)、[assets/music-20261112/](./assets/music-20261112/)，來源與作者見[音樂來源](#音樂來源)與 [CREDITS.md](./CREDITS.md)
- 原始碼 Repository：[xdxd-lab/whackamole_polarbear](https://github.com/xdxd-lab/whackamole_polarbear)

## 遊戲規則

每局 30 秒，可選擇「悠閒」、「普通」或「高手」難度。敲到企鵝得 1 分，北極狐得 3 分；誤敲北極熊扣 2 分並中斷連擊，漏掉企鵝或北極狐也會中斷連擊；每連擊 5 次多得 1 分。最高分儲存在遊玩裝置的瀏覽器中。

> **注意：** GitHub Pages 是線上遊玩網址。單獨下載 `index.html` 並非完整離線版，因為遊戲還需要同一 Repository 中的角色圖片素材。

## 音樂來源

四首背景音樂都以 [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/deed.zh_TW) 釋出，取自 OpenGameArt.org，謝謝四位作者：

| 曲目 | 作者 | 授權 |
|---|---|---|
| [Happy synths loop with slight christmas feeling](https://opengameart.org/content/happy-synths-loop-with-slight-christmas-feeling) | 3xBlast | CC0 |
| [Snowfall](https://opengameart.org/content/snowfall) | Kistol | CC0 |
| [Happy Clappy Loop](https://opengameart.org/content/happy-clappy-loop) | OwlishMedia | CC0 |
| [Snow Theme](https://opengameart.org/content/snow-theme) | Cleyton Kauffman | CC0 |

每局輪流播放一首。各首在遊戲中的用途與處理方式見 [CREDITS.md](./CREDITS.md)；檔案清單與雜湊在 [deployment/music.json](./deployment/music.json)，處理用的程式在 [scripts/music/](./scripts/music/)。

## 自動化驗證

每次推送至 `main`、提出 Pull Request 或手動執行時，GitHub Actions 會在 Chromium 跑完下列檢查。測試只觀察玩家看得到的結果（畫面、音效、震動、儲存的最高分），所以整理或搬動程式碼不會誤判。

| 檢查 | 內容 |
|---|---|
| 素材核對 | 三張正式 AVIF 的路徑、大小、SHA-256、尺寸與 15 個角色狀態的解碼；音樂檔的路徑、大小與 SHA-256；真實計時下的啟動冒煙測試 |
| 音樂 | 按開始才播放、每局換一首、跟著音效開關、隨回合結束，以及音樂載不到時遊戲照常 |
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
