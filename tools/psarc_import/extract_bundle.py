"""Extract the files embedded in a .NET single-file bundle (apphost).

Usage: python -I extract_bundle.py <app.exe> <out_dir>
"""
import os
import struct
import sys
import zlib

SIG = bytes([0x8b, 0x12, 0x02, 0xb9, 0x6a, 0x61, 0x20, 0x38, 0x72, 0x7b, 0x93, 0x02, 0x14, 0xd7, 0xa0, 0x32,
             0x13, 0xf5, 0xb9, 0xe6, 0xef, 0xae, 0x33, 0x18, 0xee, 0x3b, 0x2d, 0xce, 0x24, 0xb3, 0x6a, 0xae])


def read_str(b, p):
    n = shift = 0
    while True:
        c = b[p]; p += 1
        n |= (c & 0x7F) << shift
        if not c & 0x80:
            break
        shift += 7
    return b[p:p + n].decode("utf-8"), p + n


def main(exe, out):
    b = open(exe, "rb").read()
    i = b.find(SIG)
    if i < 0:
        sys.exit("no bundle signature")
    hdr = struct.unpack_from("<q", b, i - 8)[0]
    major, minor, count = struct.unpack_from("<IIi", b, hdr)
    p = hdr + 12
    bundle_id, p = read_str(b, p)
    if major >= 2:
        p += 8 * 5  # deps.json offset/size, runtimeconfig offset/size, flags
    print(f"bundle v{major}.{minor}, {count} files, id {bundle_id}")
    for _ in range(count):
        off, size = struct.unpack_from("<qq", b, p); p += 16
        csize = 0
        if major >= 6:
            csize = struct.unpack_from("<q", b, p)[0]; p += 8
        ftype = b[p]; p += 1
        path, p = read_str(b, p)
        data = b[off:off + (csize or size)]
        if csize:
            data = zlib.decompress(data, -15)
        dest = os.path.join(out, path.replace("/", os.sep))
        if not os.path.abspath(dest).startswith(os.path.abspath(out)):
            sys.exit(f"unsafe path {path}")
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        with open(dest, "wb") as f:
            f.write(data)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
