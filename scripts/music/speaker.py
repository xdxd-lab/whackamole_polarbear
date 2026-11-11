"""How loud each track sounds on a phone or laptop speaker, and the playback gain that makes
it match a reference track. Small speakers barely play below about 300 Hz, so the measure is
BS.1770 loudness after removing that range (two 300 Hz high-pass filters, 24 dB per octave).
Pure standard library.
Usage: speaker.py reference.wav reference_gain other.wav [other.wav ...]"""
import math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from prepare import biquad, loudness, read

def high_pass(x, rate, fc=300.0, q=0.7071):
    w = 2 * math.pi * fc / rate; al = math.sin(w) / (2 * q); c = math.cos(w)
    return biquad(x, [(1 + c) / 2, -(1 + c), (1 + c) / 2], [1 + al, -2 * c, 1 - al])

def speaker_loudness(path):
    rate, channels = read(path)
    return loudness([high_pass(high_pass(ch, rate), rate) for ch in channels], rate)

def main(reference, reference_gain, others):
    ref = speaker_loudness(reference) + 20 * math.log10(reference_gain)
    print(f'{os.path.basename(reference)}: {ref:.1f} LUFS above 300 Hz at gain {reference_gain}')
    for path in others:
        level = speaker_loudness(path)
        print(f'{os.path.basename(path)}: {level:.1f} LUFS above 300 Hz, gain {10 ** ((ref - level) / 20):.2f} to match')

if __name__ == '__main__':
    main(sys.argv[1], float(sys.argv[2]), sys.argv[3:])
