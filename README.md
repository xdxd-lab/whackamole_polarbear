# 雪地敲敲樂 · Whackamole Polarbear

**[開始遊戲（GitHub Pages）](https://xdxd-lab.github.io/whackamole_polarbear/)**

使用瀏覽器即可遊玩，不需要下載或安裝。手機可觸控操作，電腦可使用滑鼠。

## 目前版本

- **V18（2026-10-24）**：調高遊戲音效音量，標題改為粉紅色可愛玩具槌子 SVG，延續 V17 的遊戲邏輯與自動資產驗證。
- 遊戲入口：[index.html](./index.html)
- 正式角色素材（沿用 V16，未更動圖片）：[assets/v16-20260909/](./assets/v16-20260909/)
- 原始碼 Repository：[xdxd-lab/whackamole_polarbear](https://github.com/xdxd-lab/whackamole_polarbear)

## 遊戲規則

每局 30 秒，可選擇「悠閒」、「普通」或「高手」難度。敲到企鵝得 1 分，北極狐得 3 分；誤敲北極熊扣 2 分並中斷連擊。最高分儲存在遊玩裝置的瀏覽器中。

> **注意：** GitHub Pages 是線上遊玩網址。單獨下載 `index.html` 並非完整離線版，因為 V18 還需要同一 Repository 中的角色圖片素材。

## 自動化驗證（V18）

每次推送至 `main`、提出 Pull Request 或手動執行時，GitHub Actions 會核對三張正式 AVIF 的路徑、檔案大小及 SHA-256，並在 Chromium 檢查尺寸、15 個角色狀態的解碼及遊戲啟動顯示。失敗時測試工作會標示失敗，提供核對報告與截圖。舊 V15 未引用資源已在 V17 清理階段移除，正式素材維持不變。本版也核對可愛槌子的可見性與音效初始增益。

- [驗證工作流程](./.github/workflows/verify-v17-assets.yml)
- [驗證程式](./scripts/verify-assets.mjs)
- [GitHub Actions](https://github.com/xdxd-lab/whackamole_polarbear/actions/workflows/verify-v17-assets.yml)
