"""Repeats a short loop until it is long enough, and removes the click where it wraps.
A loop can be seamless in rhythm and still jump in level from its last sample to its
first. Over the last 20 ms a smooth ramp is added so the end arrives where the start
expects to come from. Usage: loop.py in.wav out.wav seconds"""
import array, math, struct, sys, wave

def read(path):
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

def main(src, dst, seconds):
    rate, channels = read(src)
    n, ramp = len(channels[0]), round(0.020 * rate)
    need = round(seconds * rate)
    joined = []
    for ch in channels:
        before_start = ch[0] - (ch[1] - ch[0])
        jump = before_start - ch[-1]
        fixed = list(ch)
        for i in range(ramp):
            fixed[n - ramp + i] += jump * (1 - math.cos(math.pi * (i + 1) / ramp)) / 2
        print(f'seam jump {abs(jump):.4f} -> {abs(before_start - fixed[-1]):.4f}')
        out = []
        while len(out) < need: out += fixed
        joined.append(out[:need])
    samples = array.array('h')
    for i in range(need):
        for ch in joined:
            samples.append(max(-32768, min(32767, round(ch[i] * 32768))))
    with wave.open(dst, 'wb') as f:
        f.setnchannels(len(joined)); f.setsampwidth(2); f.setframerate(rate); f.writeframes(samples.tobytes())
    print(f'{n / rate:.2f}s loop repeated to {need / rate:.2f}s, wraps at {n / rate:.3f}s')

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], float(sys.argv[3]))
