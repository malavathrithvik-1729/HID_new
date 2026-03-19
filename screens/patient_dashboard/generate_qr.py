#!/usr/bin/env python3
"""
V-Med ID — QR Code Generator
Pure Python, zero dependencies (uses only built-in struct + zlib).

Generates a QR PNG for a given VMED-ID and saves it to:
  patient_dashboard/assets/qr_<vmedid>.png

Also saves a base64 data URI (.txt) for direct HTML embedding.

NOTE: The web app (home.html + dashboard.js) generates QR codes
dynamically via api.qrserver.com — you do NOT need to run this
script for normal usage. Use it only for offline/static QR generation.

Usage:
  python generate_qr.py VMED-p-priyasharm-4277 "Priya Sharma" "B+"
  python generate_qr.py <vmed_id> <name> [blood_group]
"""

import struct
import zlib
import sys
import os
import re

# ── QR ENCODING TABLES ────────────────────────────────────────────

GF_EXP = [0] * 512
GF_LOG  = [0] * 256

def _build_gf():
    x = 1
    for i in range(255):
        GF_EXP[i] = x
        GF_LOG[x]  = i
        x <<= 1
        if x & 0x100:
            x ^= 0x11D
    for i in range(255, 512):
        GF_EXP[i] = GF_EXP[i - 255]

_build_gf()

def gf_mul(x, y):
    if x == 0 or y == 0:
        return 0
    return GF_EXP[(GF_LOG[x] + GF_LOG[y]) % 255]

def gf_poly_mul(p, q):
    r = [0] * (len(p) + len(q) - 1)
    for i, pi in enumerate(p):
        for j, qj in enumerate(q):
            r[i + j] ^= gf_mul(pi, qj)
    return r

def rs_generator_poly(n):
    g = [1]
    for i in range(n):
        g = gf_poly_mul(g, [1, GF_EXP[i]])
    return g

def rs_encode(data, nsym):
    gen = rs_generator_poly(nsym)
    msg = list(data) + [0] * nsym
    for i in range(len(data)):
        c = msg[i]
        if c != 0:
            for j, gv in enumerate(gen):
                msg[i + j] ^= gf_mul(gv, c)
    return msg[len(data):]

# ── QR VERSION / ECC TABLES ───────────────────────────────────────

ECC_M  = {1:10, 2:16, 3:26, 4:18, 5:24, 6:16, 7:18}
BLK_M  = {1:1,  2:1,  3:1,  4:2,  5:2,  6:4,  7:4}
DAT_M  = {1:16, 2:28, 3:44, 4:32, 5:43, 6:27, 7:31}

ALIGN_PATTERNS = {
    1: [], 2: [6,18], 3: [6,22], 4: [6,26],
    5: [6,30], 6: [6,34], 7: [6,22,38]
}

FORMAT_INFO = {
    0: 0b101010000010010,
    1: 0b101000100100101,
    2: 0b101111001111100,
    3: 0b101101101001011,
    4: 0b100010111111001,
    5: 0b100000011001110,
    6: 0b100111110010111,
    7: 0b100101010100000,
}

# ── BIT STREAM ────────────────────────────────────────────────────

class BitStream:
    def __init__(self):
        self.bits = []

    def append(self, val, n):
        for i in range(n - 1, -1, -1):
            self.bits.append((val >> i) & 1)

    def bytes(self):
        b = []
        for i in range(0, len(self.bits), 8):
            chunk = self.bits[i:i+8]
            while len(chunk) < 8:
                chunk.append(0)
            b.append(int(''.join(str(x) for x in chunk), 2))
        return b

# ── ENCODE DATA ───────────────────────────────────────────────────

def pick_version(text):
    nb = len(text.encode('utf-8'))
    for v in range(1, 8):
        if DAT_M[v] >= nb + 3:
            return v
    return 7

def encode_data(text, version):
    data = text.encode('utf-8')
    bs = BitStream()
    bs.append(0b0100, 4)        # byte mode
    bs.append(len(data), 8 if version < 10 else 16)
    for b in data:
        bs.append(b, 8)

    total_bits = DAT_M[version] * 8
    bs.append(0, min(4, total_bits - len(bs.bits)))
    while len(bs.bits) % 8:
        bs.append(0, 1)

    raw = bs.bytes()
    pad_bytes = [0xEC, 0x11]
    i = 0
    while len(raw) < DAT_M[version]:
        raw.append(pad_bytes[i % 2])
        i += 1

    nblocks    = BLK_M[version]
    necc       = ECC_M[version]
    block_size = DAT_M[version] // nblocks
    data_blocks, ecc_blocks = [], []
    for b in range(nblocks):
        block = raw[b * block_size:(b + 1) * block_size]
        data_blocks.append(block)
        ecc_blocks.append(rs_encode(block, necc))

    codewords = []
    for i in range(max(len(b) for b in data_blocks)):
        for b in data_blocks:
            if i < len(b):
                codewords.append(b[i])
    for i in range(necc):
        for b in ecc_blocks:
            codewords.append(b[i])
    return codewords

# ── BUILD MATRIX ──────────────────────────────────────────────────

DARK, LIGHT, RESERVED = True, False, None

def make_matrix(version):
    n = 21 + (version - 1) * 4
    return [[LIGHT] * n for _ in range(n)], n

def place_finder(m, r, c):
    for dr in range(-1, 8):
        for dc in range(-1, 8):
            if 0 <= r+dr < len(m) and 0 <= c+dc < len(m):
                if dr in (-1,7) or dc in (-1,7):
                    m[r+dr][c+dc] = LIGHT
                elif dr in (0,6) or dc in (0,6):
                    m[r+dr][c+dc] = DARK
                elif 2<=dr<=4 and 2<=dc<=4:
                    m[r+dr][c+dc] = DARK
                else:
                    m[r+dr][c+dc] = LIGHT

def place_timing(m, n):
    for i in range(8, n-8):
        v = DARK if i % 2 == 0 else LIGHT
        m[6][i] = v
        m[i][6] = v

def place_alignment(m, version):
    pos = ALIGN_PATTERNS.get(version, [])
    for r in pos:
        for c in pos:
            if m[r][c] is DARK:
                continue
            for dr in range(-2, 3):
                for dc in range(-2, 3):
                    if dr in (-2,2) or dc in (-2,2):
                        m[r+dr][c+dc] = DARK
                    elif dr == 0 and dc == 0:
                        m[r+dr][c+dc] = DARK
                    else:
                        m[r+dr][c+dc] = LIGHT

def reserve_format(m, n):
    for i in range(9):
        if m[8][i] is LIGHT:   m[8][i] = RESERVED
        if m[i][8] is LIGHT:   m[i][8] = RESERVED
    for i in range(n-8, n):
        m[8][i] = RESERVED
        m[i][8] = RESERVED
    m[n-8][8] = DARK

def place_format(m, n, mask_id):
    fi   = FORMAT_INFO[mask_id]
    bits = [(fi >> (14-i)) & 1 for i in range(15)]
    for i in range(6):   m[8][i]   = bool(bits[i])
    m[8][7] = bool(bits[6])
    m[8][8] = bool(bits[7])
    m[7][8] = bool(bits[8])
    for i in range(6):   m[5-i][8] = bool(bits[9+i])
    for i in range(7):   m[n-1-i][8] = bool(bits[i])
    m[8][n-8] = bool(bits[7])
    for i in range(7):   m[8][n-7+i] = bool(bits[8+i])

def place_data(m, n, codewords):
    bits = []
    for cw in codewords:
        for i in range(7, -1, -1):
            bits.append((cw >> i) & 1)
    bi, col, going_up = 0, n - 1, True
    while col > 0:
        if col == 6:
            col -= 1
        rows = range(n-1, -1, -1) if going_up else range(n)
        for row in rows:
            for dc in (0, 1):
                c = col - dc
                if m[row][c] is LIGHT:
                    m[row][c] = bool(bits[bi]) if bi < len(bits) else LIGHT
                    bi += 1
        col -= 2
        going_up = not going_up

def apply_mask(m, n, mask_id):
    fns = [
        lambda r,c: (r+c)%2==0,
        lambda r,c: r%2==0,
        lambda r,c: c%3==0,
        lambda r,c: (r+c)%3==0,
        lambda r,c: (r//2+c//3)%2==0,
        lambda r,c: (r*c)%2+(r*c)%3==0,
        lambda r,c: ((r*c)%2+(r*c)%3)%2==0,
        lambda r,c: ((r+c)%2+(r*c)%3)%2==0,
    ]
    fn = fns[mask_id]
    for r in range(n):
        for c in range(n):
            if m[r][c] is not RESERVED and isinstance(m[r][c], bool):
                if fn(r, c):
                    m[r][c] = not m[r][c]

def penalty(m, n):
    score = 0
    for row in m:
        run = 1
        for i in range(1, n):
            run = run+1 if row[i] == row[i-1] else 1
            if run == 5: score += 3
            elif run > 5: score += 1
    for c in range(n):
        run = 1
        for r in range(1, n):
            run = run+1 if m[r][c] == m[r-1][c] else 1
            if run == 5: score += 3
            elif run > 5: score += 1
    for r in range(n-1):
        for c in range(n-1):
            v = m[r][c]
            if v == m[r][c+1] == m[r+1][c] == m[r+1][c+1]:
                score += 3
    return score

def build_qr(text):
    version   = pick_version(text)
    codewords = encode_data(text, version)
    n         = 21 + (version - 1) * 4
    best_m, best_score = None, None

    for mask_id in range(8):
        m, _ = make_matrix(version)
        place_finder(m, 0, 0)
        place_finder(m, 0, n-7)
        place_finder(m, n-7, 0)
        place_timing(m, n)
        if version >= 2:
            place_alignment(m, version)
        reserve_format(m, n)
        place_data(m, n, codewords)
        apply_mask(m, n, mask_id)
        place_format(m, n, mask_id)
        sc = penalty(m, n)
        if best_score is None or sc < best_score:
            best_score = sc
            best_m = [row[:] for row in m]

    return best_m, n

# ── PNG WRITER ────────────────────────────────────────────────────

def _png_chunk(tag, data):
    crc = zlib.crc32(tag + data) & 0xFFFFFFFF
    return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', crc)

def _matrix_to_png_bytes(matrix, n, scale, dark=(10,22,40), light=(255,255,255), quiet=4):
    size = (n + 2 * quiet) * scale
    rows = []
    for r in range(-quiet, n + quiet):
        row_pixels = b''
        for c in range(-quiet, n + quiet):
            color = dark if (0 <= r < n and 0 <= c < n and matrix[r][c]) else light
            row_pixels += bytes(color) * scale
        for _ in range(scale):
            rows.append(b'\x00' + row_pixels)

    raw_data   = b''.join(rows)
    compressed = zlib.compress(raw_data, 9)
    chunks     = b'\x89PNG\r\n\x1a\n'
    chunks    += _png_chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0))
    chunks    += _png_chunk(b'IDAT', compressed)
    chunks    += _png_chunk(b'IEND', b'')
    return chunks

def write_png(matrix, n, scale, path, dark=(10,22,40), light=(255,255,255), quiet=4):
    with open(path, 'wb') as f:
        f.write(_matrix_to_png_bytes(matrix, n, scale, dark, light, quiet))
    return path

def qr_to_base64(matrix, n, scale=8, quiet=4):
    import base64
    png_bytes = _matrix_to_png_bytes(matrix, n, scale, quiet=quiet)
    return 'data:image/png;base64,' + base64.b64encode(png_bytes).decode()

# ── PATCH home.html ───────────────────────────────────────────────

def patch_home(vmed_id, b64_uri, base_dir):
    """
    Patches patient_dashboard/sections/home.html to embed a static
    base64 QR image. Only useful if you want a fully offline fallback.

    The web app normally generates QR dynamically via api.qrserver.com
    inside initHome() in dashboard.js — this patch is optional.
    """
    home_path = os.path.join(base_dir, 'patient_dashboard', 'sections', 'home.html')
    if not os.path.exists(home_path):
        print(f"⚠️  home.html not found at {home_path} — skipping patch")
        return

    with open(home_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Replace src="" on homeQrImg
    content = re.sub(
        r'(<img\s+id="homeQrImg"[^>]*\s+src=")[^"]*(")',
        r'\g<1>' + b64_uri + r'\2',
        content
    )
    # Replace src="" on modalQrImg
    content = re.sub(
        r'(<img\s+id="modalQrImg"[^>]*\s+src=")[^"]*(")',
        r'\g<1>' + b64_uri + r'\2',
        content
    )

    with open(home_path, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"✅ home.html patched with static base64 QR for {vmed_id}")

# ── MAIN ──────────────────────────────────────────────────────────

def generate(vmed_id, name, blood='', output_dir=None, patch=False):
    """
    Generate QR code PNG + base64 for a given VMED-ID.

    Args:
        vmed_id:    e.g. "VMED-p-priyasharm-4277"
        name:       patient full name
        blood:      blood group string (optional)
        output_dir: where to save PNG + txt (default: patient_dashboard/assets/)
        patch:      if True, also patches home.html with static base64 src
    """
    qr_text = f"V-Med ID: {vmed_id} | Patient: {name}" + (f" | Blood: {blood}" if blood else "")
    print(f"Generating QR for: {qr_text}")

    matrix, n = build_qr(qr_text)

    base_dir = os.path.dirname(os.path.abspath(__file__))
    if output_dir is None:
        output_dir = os.path.join(base_dir, 'patient_dashboard', 'assets')
    os.makedirs(output_dir, exist_ok=True)

    safe_id  = vmed_id.replace('/', '-').replace('\\', '-')
    png_path = os.path.join(output_dir, f'qr_{safe_id}.png')
    write_png(matrix, n, scale=8, path=png_path)
    print(f"✅ QR PNG saved  → {png_path}")

    b64      = qr_to_base64(matrix, n, scale=8)
    b64_path = os.path.join(output_dir, f'qr_{safe_id}.txt')
    with open(b64_path, 'w', encoding='utf-8') as f:
        f.write(b64)
    print(f"✅ Base64 saved  → {b64_path}")

    if patch:
        patch_home(vmed_id, b64, base_dir)

    return png_path, b64_path, b64


if __name__ == '__main__':
    if len(sys.argv) < 3:
        print("Usage:   python generate_qr.py <vmed_id> <name> [blood_group] [--patch]")
        print("Example: python generate_qr.py VMED-p-priyasharm-4277 'Priya Sharma' 'B+'")
        print()
        print("  --patch   also update home.html with a static embedded QR image")
        sys.exit(1)

    args     = sys.argv[1:]
    do_patch = '--patch' in args
    args     = [a for a in args if a != '--patch']

    vmed_id = args[0]
    name    = args[1]
    blood   = args[2] if len(args) > 2 else ''

    png_path, b64_path, _ = generate(vmed_id, name, blood, patch=do_patch)
    print()
    print("Done! Files:")
    print(f"  PNG:    {png_path}")
    print(f"  Base64: {b64_path}")
    if do_patch:
        print("  home.html patched with static QR ✓")
    else:
        print("  (Pass --patch to also embed the QR into home.html)")