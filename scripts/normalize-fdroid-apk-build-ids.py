#!/usr/bin/env python3
"""Normalize GNU SHA-1 build IDs in stored native libraries inside an APK."""

from __future__ import annotations

import struct
import sys
import zlib
from pathlib import Path

EOCD = b"PK\x05\x06"
CD = b"PK\x01\x02"
LOCAL = b"PK\x03\x04"
NOTE = b"\x04\x00\x00\x00\x14\x00\x00\x00\x03\x00\x00\x00GNU\x00"


def normalize(apk_path: Path) -> int:
    data = bytearray(apk_path.read_bytes())

    eocd = data.rfind(EOCD)
    if eocd < 0:
        raise SystemExit("APK EOCD not found")

    entries = struct.unpack_from("<H", data, eocd + 10)[0]
    cd_pos = struct.unpack_from("<I", data, eocd + 16)[0]
    changed = 0

    for _ in range(entries):
        if data[cd_pos : cd_pos + 4] != CD:
            raise SystemExit("Invalid APK central directory")

        flags = struct.unpack_from("<H", data, cd_pos + 8)[0]
        method = struct.unpack_from("<H", data, cd_pos + 10)[0]
        csize = struct.unpack_from("<I", data, cd_pos + 20)[0]
        nlen, xlen, clen = struct.unpack_from("<HHH", data, cd_pos + 28)
        name = bytes(data[cd_pos + 46 : cd_pos + 46 + nlen]).decode("utf-8")
        local = struct.unpack_from("<I", data, cd_pos + 42)[0]

        if name.startswith("lib/") and name.endswith(".so"):
            if method != 0:
                raise SystemExit(f"Native library unexpectedly compressed: {name}")
            if data[local : local + 4] != LOCAL:
                raise SystemExit(f"Invalid local header for {name}")

            local_flags = struct.unpack_from("<H", data, local + 6)[0]
            if flags & 0x08 or local_flags & 0x08:
                raise SystemExit(
                    f"Native library uses unsupported ZIP data descriptor: {name}"
                )

            lnlen, lxlen = struct.unpack_from("<HH", data, local + 26)
            start = local + 30 + lnlen + lxlen
            end = start + csize
            pos = data.find(NOTE, start, end)

            if pos >= 0:
                desc = pos + len(NOTE)
                data[desc : desc + 20] = b"\0" * 20
                crc = zlib.crc32(data[start:end]) & 0xFFFFFFFF
                struct.pack_into("<I", data, cd_pos + 16, crc)
                struct.pack_into("<I", data, local + 14, crc)
                changed += 1

        cd_pos += 46 + nlen + xlen + clen

    if not changed:
        raise SystemExit("No GNU SHA-1 build-id notes found to normalize")

    apk_path.write_bytes(data)
    return changed


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit(
            "Usage: normalize-fdroid-apk-build-ids.py <app-release-unsigned.apk>"
        )

    apk_path = Path(sys.argv[1])
    if not apk_path.is_file():
        raise SystemExit(f"APK not found: {apk_path}")

    changed = normalize(apk_path)
    print(
        "[INFO] Normalized GNU build IDs and refreshed ZIP CRCs "
        f"in {changed} native libraries in-place"
    )


if __name__ == "__main__":
    main()
