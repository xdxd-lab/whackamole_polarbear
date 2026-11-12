# 致謝與素材來源

## 音樂

四首背景音樂都由作者以 [CC0 1.0（公眾領域貢獻宣告）](https://creativecommons.org/publicdomain/zero/1.0/deed.zh_TW) 釋出，取自 [OpenGameArt.org](https://opengameart.org/)。CC0 不要求署名，這裡仍然標示，謝謝四位作者。

遊戲每局播放一首，依下表順序輪流；按下開始後才播放，回合結束即停止。

| 順序 | 曲名 | 作者 | 來源 | 授權 |
|---|---|---|---|---|
| 1 | Happy synths loop with slight christmas feeling | 3xBlast | <https://opengameart.org/content/happy-synths-loop-with-slight-christmas-feeling> | CC0 1.0 |
| 2 | Snowfall | Kistol | <https://opengameart.org/content/snowfall> | CC0 1.0 |
| 3 | Happy Clappy Loop | OwlishMedia | <https://opengameart.org/content/happy-clappy-loop> | CC0 1.0 |
| 4 | Snow Theme | Cleyton Kauffman | <https://opengameart.org/content/snow-theme> | CC0 1.0 |

Snow Theme 的作者希望這樣署名：Music by Cleyton Kauffman - <https://soundcloud.com/cleytonkauffman>

### 我們對原曲做了什麼

一局是 30 秒，所以每首都做成 31 秒的檔案，結尾淡出 1 秒，響度調到 -18 LUFS。沒有更動旋律、速度或音色。

| 曲名 | 取用的部分 | 響度調整 | 遊戲中的播放音量 |
|---|---|---|---|
| Happy synths loop with slight christmas feeling | 原曲 84 秒的前 31 秒 | 降低 8.8 dB（原檔接近削波） | 再提高 3.5 dB |
| Snowfall | 循環版 49.5 秒的前 31 秒 | 提高 2.7 dB | 不變（1.0 倍） |
| Happy Clappy Loop | 原曲 17.4 秒，重複到 31 秒；循環接點有一個小跳變，以 20 毫秒的平滑過渡消除 | 提高 3.6 dB | 再提高 5.6 dB |
| Snow Theme | 循環版 49.9 秒的前 31 秒 | 提高 14.7 dB（原檔很小聲，約 -32.7 LUFS） | 再提高 0.8 dB（1.1 倍） |

「遊戲中的播放音量」是在響度相同之後再調的：響度量測會把重低音算進去，但手機和筆電的小喇叭幾乎發不出 300 Hz 以下的聲音，所以各首以「300 Hz 以上的響度」對齊到 Happy（`scripts/music/speaker.py`），Clappy 再依試聽多加 1 dB。Happy 與 Clappy 的數值經 2026-11-11 逐首單獨試聽確認；Snowfall 與 Snow Theme（21.1.0 加入）採量測值，兩首的低音都不重，量測與 Happy 相差不到 0.5 dB；怎麼調見 [scripts/music/README.md](./scripts/music/README.md)。

19.1.0 起使用過的 [Short Loop: winter theme](https://opengameart.org/content/short-loop-winter-theme)（作者 yd，CC0 1.0）在 19.2.0 移除：試聽後覺得不適合這個遊戲。

- 每首提供兩種格式：Ogg Opus（多數瀏覽器）與 AAC（18.4 以前的 Safari）。
- 檔案清單、大小與 SHA-256：[deployment/music.json](./deployment/music.json)
- 處理步驟與程式：[scripts/music/](./scripts/music/)

## 角色圖片

北極熊、北極狐與企鵝的圖片是這個專案自己的素材，位於 [assets/v16-20260909/](./assets/v16-20260909/)。
