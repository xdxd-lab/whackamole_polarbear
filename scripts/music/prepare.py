"""Cuts a track to one round, fades it out and matches loudness (ITU-R BS.1770, gated).
Pure standard library. Usage: prepare.py in.wav out.wav seconds fade_seconds target_lufs"""
import array, math, sys, wave

def read(path):
    # afconvert writes WAVE_FORMAT_EXTENSIBLE, which the wave module refuses, so read the chunks directly.
    import struct
    blob = open(path, 'rb').read()
    assert blob[:4] == b'RIFF' and blob[8:12] == b'WAVE'
    pos, fmt, data = 12, None, None
    while pos < len(blob):
        kind, size = blob[pos:pos + 4], struct.unpack('<I', blob[pos + 4:pos + 8])[0]
        if kind == b'fmt ': fmt = blob[pos + 8:pos + 8 + size]
        if kind == b'data': data = blob[pos + 8:pos + 8 + size]
        pos += 8 + size + (size & 1)
    _tag, channels, rate, _bps, _align, bits = struct.unpack('<HHIIHH', fmt[:16])
    assert bits == 16, 'expects 16-bit PCM'
    raw = array.array('h', data)
    return rate, [[raw[i] / 32768 for i in range(c, len(raw), channels)] for c in range(channels)]

def biquad(x, b, a):
    b0, b1, b2 = (v / a[0] for v in b); a1, a2 = a[1] / a[0], a[2] / a[0]
    y, x1, x2, y1, y2 = [0.0] * len(x), 0.0, 0.0, 0.0, 0.0
    for i, v in enumerate(x):
        out = b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
        x2, x1, y2, y1 = x1, v, y1, out
        y[i] = out
    return y

def k_weight(x, rate):
    G, Q, fc = 3.99984385397, 0.7071752369554193, 1681.9744509555319
    A = 10 ** (G / 40); w = 2 * math.pi * fc / rate; al = math.sin(w) / (2 * Q); c = math.cos(w); s = 2 * math.sqrt(A) * al
    x = biquad(x, [A * ((A + 1) + (A - 1) * c + s), -2 * A * ((A - 1) + (A + 1) * c), A * ((A + 1) + (A - 1) * c - s)],
                  [(A + 1) - (A - 1) * c + s, 2 * ((A - 1) - (A + 1) * c), (A + 1) - (A - 1) * c - s])
    Q, fc = 0.5003270373253953, 38.13547087613982
    w = 2 * math.pi * fc / rate; al = math.sin(w) / (2 * Q); c = math.cos(w)
    return biquad(x, [(1 + c) / 2, -(1 + c), (1 + c) / 2], [1 + al, -2 * c, 1 - al])

def loudness(channels, rate):
    weighted = [k_weight(ch, rate) for ch in channels]
    block, step = int(0.4 * rate), int(0.1 * rate)
    powers = []
    for start in range(0, len(weighted[0]) - block + 1, step):
        powers.append(sum(sum(v * v for v in ch[start:start + block]) / block for ch in weighted))
    lufs = lambda p: -0.691 + 10 * math.log10(p) if p > 0 else -math.inf
    gated = [p for p in powers if lufs(p) > -70]
    relative = lufs(sum(gated) / len(gated)) - 10
    gated = [p for p in gated if lufs(p) > relative]
    return lufs(sum(gated) / len(gated))

def main(src, dst, seconds, fade, target):
    rate, channels = read(src)
    n = min(len(channels[0]), round(seconds * rate))
    fade_n, start_n = round(fade * rate), round(0.005 * rate)
    shaped = []
    for ch in channels:
        ch = ch[:n]
        for i in range(start_n): ch[i] *= i / start_n
        for i in range(fade_n):
            ch[n - fade_n + i] *= math.cos(i / fade_n * math.pi / 2) ** 2
        shaped.append(ch)
    before = loudness(shaped, rate)
    gain = 10 ** ((target - before) / 20)
    peak = max(max(abs(v) for v in ch) for ch in shaped) * gain
    ceiling = 10 ** (-1.5 / 20)
    if peak > ceiling: gain *= ceiling / peak
    out = array.array('h')
    for i in range(n):
        for ch in shaped:
            out.append(max(-32768, min(32767, round(ch[i] * gain * 32768))))
    with wave.open(dst, 'wb') as f:
        f.setnchannels(len(shaped)); f.setsampwidth(2); f.setframerate(rate); f.writeframes(out.tobytes())
    after = loudness([[v * gain for v in ch] for ch in shaped], rate)
    print(f'{src.split("/")[-1]}: {before:.1f} LUFS -> {after:.1f} LUFS, gain {20 * math.log10(gain):+.1f} dB, peak {20 * math.log10(peak / (10 ** ((target - before) / 20)) * gain):.1f} dBFS, {n / rate:.2f}s')

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], float(sys.argv[3]), float(sys.argv[4]), float(sys.argv[5]))
