# 背景音樂的處理方式

遊戲用的音樂檔由這裡的程式產生，只需要 macOS 內建的 `afconvert` 與 Python 3，不必安裝其他工具。

```sh
# 1. 原始檔解成 16-bit WAV
afconvert -f WAVE -d LEI16@44100 happy.ogg happy-src.wav
# 2. 取前 31 秒、結尾淡出 1 秒、響度調到 -18 LUFS（峰值不超過 -1.5 dBFS）
python3 scripts/music/prepare.py happy-src.wav happy-31.wav 31 1 -18
#    低音太重的曲子可多給第 6 個參數，把 250 Hz 以下調小（dB），見下方「音量」：
#    python3 scripts/music/prepare.py heavy-src.wav heavy-31.wav 31 1 -18 -16
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

## 音量：怎麼讓每首聽起來一樣大聲

2026-11-10～11 調 Happy、Winter、Clappy 三首時學到的做法（Winter 最後因不適合而移除，經驗留下）：

1. **以小喇叭聽得到的頻段對齊，不只看整體響度。** `prepare.py` 把每首調到 -18 LUFS，但這個量測會算進重低音，手機和筆電喇叭卻幾乎發不出 300 Hz 以下的聲音。所以每首另有播放音量（`deployment/music.json` 與 `MUSIC_TRACKS` 裡的 `gain`），用 `speaker.py` 算出在 300 Hz 以上和參考曲（Happy，`gain` 1.5）一樣大聲的值：

   ```sh
   python3 scripts/music/speaker.py happy-31.wav 1.5 new-31.wav
   ```

   `npm test` 用同樣的方法（瀏覽器裡兩道 300 Hz 高通加上 BS.1770 的高頻加權）核對每首在小喇叭上的音量差在 2 dB 以內。注意 Web Audio 的高通 `Q` 以 dB 表示，要設 -3.01 dB 才是不共振的 Q 0.707。

2. **低音太多的曲子先削低音。** Winter 的能量大多在低音，在小喇叭上比其他曲子小約 15 dB；只調大音量的話，換成耳機會大聲得多。先用 `prepare.py` 的第 6 個參數調小 250 Hz 以下（Winter 用 -16 dB；再多曲子會變薄），再算 `gain`。`speaker.py` 算出的值若超過 2.5，就是這種曲子。

3. **響度烘進檔案，播放音量不超過 2。** 資產檢查要求 `gain` 在 0～2 之間。需要更大聲時，把 `prepare.py` 的目標響度調高（例如 -12），它會自動停在峰值 -1.5 dBFS，再重算 `gain`。

4. **試聽要逐首單獨播，標明是哪一首。** 在遊戲裡聽，玩家分不出哪一局是哪一首（重新整理會從第一首開始，每次開始、重開或換難度都會換下一首），曾因此把「太小聲」誤記成「太大聲」。用 `afplay -v` 依各首 `gain` 的比例播放（最大的設 1.0），一次一首，在同一台裝置上比較。