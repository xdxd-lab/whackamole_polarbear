# 變更紀錄

這裡記錄玩家會感受到的變更，最新的在最上面。版號怎麼決定見 [docs/VERSIONING.md](./docs/VERSIONING.md)。

## [19.2.0] - 2026-11-11

### 新增

- 新的背景音樂 Happy Clappy Loop，一首輕柔俏皮的鋼琴小品。現在兩首每局輪流：Happy → Clappy。
- 頁尾以小字標示音樂的作者，點作者名稱可以開啟該曲在 OpenGameArt 的頁面。

### 移除

- 背景音樂 Winter（Short Loop: winter theme）：試聽後覺得不適合這個遊戲。它的聲音大多是重低音，在手機和筆電喇叭上也幾乎聽不到。

### 音樂來源

兩首都以 [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/deed.zh_TW) 釋出，取自 OpenGameArt.org，詳見 [CREDITS.md](./CREDITS.md)：

- [Happy synths loop with slight christmas feeling](https://opengameart.org/content/happy-synths-loop-with-slight-christmas-feeling)，作者 3xBlast
- [Happy Clappy Loop](https://opengameart.org/content/happy-clappy-loop)，作者 OwlishMedia

## [19.1.1] - 2026-11-11

### 修正

- 開始遊戲前的準備更快、更省記憶體：角色圖片只解碼一次，直接從原圖顯示各個表情，不再另外切成 15 張小圖。畫面與玩法都沒有變。

## [19.1.0] - 2026-11-10

### 新增

- 背景音樂。有兩首，每局輪流播放一首：一首輕快、一首冬日氛圍。
  - 按下開始後才會播放，回合結束、切換到別的分頁或重新開始時會停止。
  - 「音效」按鈕同時控制音樂和敲擊音效；關掉後再打開，音樂會接著播，不會從頭來。
  - 音樂在遊戲可以玩之後才在背景下載，不影響開始遊戲的時間；下載失敗時遊戲照常進行，只是沒有音樂。

## [19.0.0] - 2026-11-10

從這一版起改用三段式版號。V19 累積了 V18 之後的所有變更；玩法與計分完全沒變，最高分紀錄照舊。

### 新增

- 敲擊回饋：敲下去的位置會出現一個圓點和一圈擴散的環，企鵝是綠色、北極狐是金色、北極熊是紅色，敲到空洞是冰藍色的環。被敲到的角色會擠壓一下，北極熊會搖晃。
- 用鍵盤操作時，看得到目前選到哪一個洞。

### 變更

- 棋盤的洞改成雪磚和冰洞，不再是瀏覽器預設的按鈕外框。
- 得分提示改顯示在被敲的那個洞上緣，不再蓋住分數。
- 手機橫向時改成左右兩欄，棋盤在左、分數與按鈕在右。
- 面板不再模糊背後的畫面，改用較不透明的底色；開始與結束畫面改成霧白遮罩。
- 分數、連擊、時間三個數字在面板裡垂直置中。

### 修正

- 難度、音效、重新開始在矮螢幕和橫向手機上被切掉、按不到的問題。
- 棋盤靠左、沒有置中的問題。
- 雪花每隔一段時間會跳一下，以及循環開始時畫面底部沒有雪的問題。
- 系統開啟「減少動態效果」時，雪仍在飄、得分提示看不到的問題。現在雪會靜止，提示直接顯示，敲擊回饋只淡出、不擴散。
- 倒數計時不再不斷送給螢幕報讀軟體朗讀；遊戲進行時畫面更新也比較省資源。

### 給開發者

- 新增行為測試、整局重播比對、畫面狀態快照與突變檢查，取代原本比對程式碼字串的檢查。

## V18 - 2026-10-24

- 調高音效音量。
- 標題圖示改為粉紅色玩具槌子。

## V17 - 2026-10-23

- 新增角色圖片的自動驗證（SHA-256、AVIF 解碼）與 GitHub Actions 檢查。
- 移除八個沒在用的 V15 素材。

## V16 - 2026-09-09

- 換上經過核對的正式角色圖片，放在獨立的 `assets/v16-20260909/`。
- 修正角色圖片重複鋪滿的問題，並移除舊的 WebP 影格。

V15 以前沒有留下逐版紀錄，可以從 git 歷史查到。

[19.2.0]: https://github.com/xdxd-lab/whackamole_polarbear/releases/tag/v19.2.0
[19.1.1]: https://github.com/xdxd-lab/whackamole_polarbear/releases/tag/v19.1.1
[19.1.0]: https://github.com/xdxd-lab/whackamole_polarbear/releases/tag/v19.1.0
[19.0.0]: https://github.com/xdxd-lab/whackamole_polarbear/releases/tag/v19.0.0
