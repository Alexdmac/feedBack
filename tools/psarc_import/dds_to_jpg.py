"""Convert cover.dds files to cover.jpg (FeedBack cannot serve DDS art).

Usage: python -I dds_to_jpg.py <list_file>
The list file holds one .dds path per line. The script writes each cover.jpg
next to its .dds and then deletes the .dds. It prints each failure, keeps that
.dds and continues with the next file.
"""
import sys
from pathlib import Path

from PIL import Image


def main(list_file):
    ok = failed = 0
    for line in Path(list_file).read_text(encoding="utf-8").splitlines():
        dds = Path(line.strip())
        if not line.strip() or not dds.is_file():
            continue
        try:
            with Image.open(dds) as im:
                im.convert("RGB").save(dds.with_suffix(".jpg"), quality=92)
            dds.unlink()
            ok += 1
        except Exception as e:  # noqa: BLE001 - one bad cover must not stop the batch
            print(f"cover failed: {dds}: {e}")
            failed += 1
    print(f"covers: {ok} converted, {failed} failed")


if __name__ == "__main__":
    main(sys.argv[1])
