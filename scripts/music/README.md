# 背景音樂的處理方式

遊戲用的音樂檔由這裡的兩支程式產生，只需要 macOS 內建的 `afconvert` 與 Python 3，不必安裝其他工具。

```sh
# 1. 原始檔解成 16-bit WAV
afconvert -f WAVE -d LEI16@44100 happy.ogg happy-src.wav
# 2. 取前 31 秒、結尾淡出 1 秒、響度調到 -18 LUFS（峰值不超過 -1.5 dBFS）
python3 scripts/music/prepare.py happy-src.wav happy-31.wav 31 1 -18
# 3. 編成 Opus。afconvert 只能寫進 CAF，所以再轉成瀏覽器讀得懂的 Ogg
afconvert -f caff -d opus@48000 -b 96000 happy-31.wav happy.caf
python3 scripts/music/caf2ogg.py happy.caf happy.opus 44100
# 4. 給 18.4 以前的 Safari 用的 AAC
afconvert -f m4af -d aac -b 96000 happy-31.wav happy.m4a
```

檔名要帶內容雜湊的前 12 碼，並把路徑、大小與 SHA-256 寫進 `deployment/music.json` 和 `index.html` 的 `MUSIC_TRACKS`；`npm test` 會核對。一局是 30 秒，所以每首只需要 31 秒，不需要循環。
