# 致謝與素材來源

## 音樂

三首背景音樂都由作者以 [CC0 1.0（公眾領域貢獻宣告）](https://creativecommons.org/publicdomain/zero/1.0/deed.zh_TW) 釋出，取自 [OpenGameArt.org](https://opengameart.org/)。CC0 不要求署名，這裡仍然標示，謝謝三位作者。

遊戲每局播放一首，依下表順序輪流；按下開始後才播放，回合結束即停止。

| 順序 | 曲名 | 作者 | 來源 | 授權 |
|---|---|---|---|---|
| 1 | Happy synths loop with slight christmas feeling | 3xBlast | <https://opengameart.org/content/happy-synths-loop-with-slight-christmas-feeling> | CC0 1.0 |
| 2 | Short Loop: winter theme | yd | <https://opengameart.org/content/short-loop-winter-theme> | CC0 1.0 |
| 3 | Happy Clappy Loop | OwlishMedia | <https://opengameart.org/content/happy-clappy-loop> | CC0 1.0 |

### 我們對原曲做了什麼

一局是 30 秒，所以每首都做成 31 秒的檔案，結尾淡出 1 秒，並把三首的響度調到相同（-18 LUFS）。沒有更動旋律、速度或音色。

| 曲名 | 取用的部分 | 響度調整 | 遊戲中的播放音量 |
|---|---|---|---|
| Happy synths loop with slight christmas feeling | 原曲 84 秒的前 31 秒 | 降低 8.8 dB（原檔接近削波） | 再提高 3.5 dB |
| Short Loop: winter theme | 原曲 72 秒的前 31 秒 | 提高 5.6 dB | 再降低 3.5 dB |
| Happy Clappy Loop | 原曲 17.4 秒，重複到 31 秒；循環接點有一個小跳變，以 20 毫秒的平滑過渡消除 | 提高 3.6 dB | 再提高 4.6 dB |

「遊戲中的播放音量」是在響度相同之後，依實際聽感再調的：響度量測會把重低音算進去，但小喇叭和小音量下幾乎聽不到重低音，所以低音多的曲子要調大、能量集中在中頻的要調小。Happy 與 Winter 的數值是實際試聽後決定的；Clappy 的數值是依它和 Happy 相近的頻率分布估計的。

- 每首提供兩種格式：Ogg Opus（多數瀏覽器）與 AAC（18.4 以前的 Safari）。
- 檔案清單、大小與 SHA-256：[deployment/music.json](./deployment/music.json)
- 處理步驟與程式：[scripts/music/](./scripts/music/)

## 角色圖片

北極熊、北極狐與企鵝的圖片是這個專案自己的素材，位於 [assets/v16-20260909/](./assets/v16-20260909/)。
