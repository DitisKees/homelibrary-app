#!/usr/bin/env python3
"""Reject host-dependent React Native dev-server resources in release APKs."""
import re
import subprocess
import sys


def verify(aapt2, apk):
    dump = subprocess.run(
        [aapt2, "dump", "resources", apk], check=True, capture_output=True, text=True
    ).stdout
    values = []
    definitions = 0
    selected = False
    for line in dump.splitlines():
        declaration = re.match(r"\s*resource\s+0x[0-9a-fA-F]+\s+(\S+)", line)
        if declaration:
            selected = declaration[1] == "string/react_native_dev_server_ip"
            definitions += int(selected)
        elif selected and line.strip():
            values.append(line.strip())
    if definitions != 1 or values != ['() "localhost"']:
        raise ValueError(f"Expected one default dev-server resource set to localhost; found {definitions} definitions, {values}")


if __name__ == "__main__":
    try:
        verify(*sys.argv[1:])
    except (ValueError, subprocess.CalledProcessError) as error:
        sys.exit(f"[FAIL] Non-deterministic release dev-server resource: {error}")
    print("[PASS] Release React Native dev-server resource is localhost.")
