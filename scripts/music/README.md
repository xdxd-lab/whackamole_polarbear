# 背景音樂的處理方式

遊戲用的音樂檔由這裡的程式產生，只需要 macOS 內建的 `afconvert` 與 Python 3，不必安裝其他工具。

```sh
# 1. 原始檔解成 16-bit WAV
afconvert -f WAVE -d LEI16@44100 happy.ogg happy-src.wav
# 2. 取前 31 秒、結尾淡出 1 秒、響度調到 -18 LUFS（峰值不超過 -1.5 dBFS）
python3 scripts/music/prepare.py happy-src.wav happy-31.wav 31 1 -18
#    低音太重的曲子可多給第 6 個參數，把 250 Hz 以下調小（Winter 用 -16）：
#    python3 scripts/music/prepare.py winter-src.wav winter-31.wav 31 1 -18 -16
# 3. 編成 Opus。afconvert 只能寫進 CAF，所以再轉成瀏覽器讀得懂的 Ogg
afconvert -f caff -d opus@48000 -b 96000 happy-31.wav happy.caf
python3 scripts/music/caf2ogg.py happy.caf happy.opus 44100
# 4. 給 18.4 以前的 Safari 用的 AAC
afconvert -f m4af -d aac -b 96000 happy-31.wav happy.m4a
```

檔名要帶內容雜湊的前 12 碼，並把路徑、大小與 SHA-256 寫進 `deployment/music.json` 和 `index.html` 的 `MUSIC_TRACKS`；`npm test` 會核對。一局是 30 秒，所以每首只需要 31 秒，播放時不需要循環。

原曲比 31 秒短的（例如 17.4 秒的 Happy Clappy Loop），在第 2 步之前先重複到夠長：

```sh
python3 scripts/music/loop.py clappy-src.wav clappy-loop.wav 31.5
```

節奏上無縫的循環，最後一個取樣和第一個取樣之間仍可能有落差，重複時會聽到喀一聲；`loop.py` 會在循環結尾的 20 毫秒補上平滑的過渡。

響度相同不代表聽起來一樣大聲：量測會把重低音算進去，但小喇叭和小音量下幾乎聽不到重低音。所以每首另有一個播放音量（`deployment/music.json` 與 `MUSIC_TRACKS` 裡的 `gain`）。先用 `speaker.py` 算出在小喇叭上與 Happy 一樣大聲的值，再實際聽過微調：

```sh
python3 scripts/music/speaker.py happy-31.wav 1.5 winter-31.wav clappy-31.wav
```

如果算出來的 `gain` 很大（例如超過 2.5），代表那首的聲音大多在低音，小喇叭聽不到、耳機卻會很大聲；這時先用 `prepare.py` 的第 6 個參數調小低音再算。`npm test` 會以同樣的方法核對三首在小喇叭上的音量差在 2 dB 以內。
