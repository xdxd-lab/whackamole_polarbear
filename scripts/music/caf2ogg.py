"""Rewraps the Opus packets afconvert writes into CAF as an Ogg Opus file (RFC 7845).
afconvert can encode Opus but cannot write the Ogg container that browsers read."""
import struct, sys

def crc_table():
    table = []
    for i in range(256):
        r = i << 24
        for _ in range(8):
            r = ((r << 1) ^ 0x04C11DB7) if r & 0x80000000 else (r << 1)
        table.append(r & 0xFFFFFFFF)
    return table
TABLE = crc_table()
def ogg_crc(data):
    crc = 0
    for byte in data:
        crc = ((crc << 8) & 0xFFFFFFFF) ^ TABLE[((crc >> 24) & 0xFF) ^ byte]
    return crc

def read_caf(path):
    blob = open(path, 'rb').read()
    assert blob[:4] == b'caff', 'not a CAF file'
    pos, chunks = 8, {}
    while pos < len(blob):
        kind = blob[pos:pos + 4]; size = struct.unpack('>q', blob[pos + 4:pos + 12])[0]; pos += 12
        if size < 0: size = len(blob) - pos
        chunks[kind] = blob[pos:pos + size]; pos += size
    rate, fmt, _flags, bytes_per_packet, frames_per_packet, channels, _bits = struct.unpack('>d4sIIIII', chunks[b'desc'])
    assert fmt == b'opus' and bytes_per_packet == 0 and frames_per_packet > 0, (fmt, bytes_per_packet, frames_per_packet)
    pakt = chunks[b'pakt']
    packets, valid, priming, remainder = struct.unpack('>qqii', pakt[:24])
    sizes, p = [], 24
    for _ in range(packets):
        value = 0
        while True:
            byte = pakt[p]; p += 1
            value = (value << 7) | (byte & 0x7F)
            if not byte & 0x80: break
        sizes.append(value)
    data = chunks[b'data'][4:]
    out, offset = [], 0
    for size in sizes:
        out.append(data[offset:offset + size]); offset += size
    assert offset == len(data), (offset, len(data))
    return dict(rate=rate, channels=channels, frames_per_packet=frames_per_packet, packets=out, valid=valid, priming=priming)

def page(serial, seq, granule, packets, flags):
    lacing, body = [], b''
    for packet in packets:
        n = len(packet)
        lacing += [255] * (n // 255) + [n % 255]
        body += packet
    assert len(lacing) <= 255
    header = b'OggS' + struct.pack('<BBqIIIB', 0, flags, granule, serial, seq, 0, len(lacing)) + bytes(lacing)
    crc = ogg_crc(header + body)
    return header[:22] + struct.pack('<I', crc) + header[26:] + body

def write_ogg(caf, path, input_rate, serial=0x5741_4D31):
    assert caf['rate'] == 48000, caf['rate']
    head = b'OpusHead' + struct.pack('<BBHIhB', 1, caf['channels'], caf['priming'], input_rate, 0, 0)
    vendor = b'afconvert via caf2ogg'
    tags = b'OpusTags' + struct.pack('<I', len(vendor)) + vendor + struct.pack('<I', 0)
    pages = [page(serial, 0, 0, [head], 0x02), page(serial, 1, 0, [tags], 0)]
    end = caf['priming'] + caf['valid']
    group, segments, frames, seq = [], 0, 0, 2
    packets = caf['packets']
    for index, packet in enumerate(packets):
        need = len(packet) // 255 + 1
        if group and (segments + need > 255 or sum(map(len, group)) > 4000):
            pages.append(page(serial, seq, min(frames, end), group, 0)); seq += 1; group, segments = [], 0
        group.append(packet); segments += need; frames += caf['frames_per_packet']
    pages.append(page(serial, seq, end, group, 0x04))
    open(path, 'wb').write(b''.join(pages))
    return dict(packets=len(packets), pages=len(pages), preskip=caf['priming'], seconds=caf['valid'] / 48000)

if __name__ == '__main__':
    caf = read_caf(sys.argv[1])
    print(write_ogg(caf, sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 44100))
