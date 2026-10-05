#!/usr/bin/env python3
"""Verify install identity, release code, bundled JS, and exactly one native ABI."""
import json
import re
import subprocess
import sys
import zipfile
from pathlib import Path


def verify(apk, abi, root, aapt):
    root = Path(root)
    abis = json.loads((root / 'scripts/android-release-abis.json').read_text())
    app = json.loads((root / 'app.json').read_text())['expo']
    if abi not in abis:
        raise ValueError(f'unsupported release ABI: {abi}')
    code = app['android']['versionCode'] * 10 + abis[abi]
    badging = subprocess.check_output([aapt, 'dump', 'badging', str(apk)], text=True)
    for field, expected in [('name', app['android']['package']), ('versionCode', str(code)),
                            ('versionName', app['version'])]:
        if re.search(rf"\b{field}='{re.escape(expected)}'", badging) is None:
            raise ValueError(f'APK {field} must be {expected}')
    with zipfile.ZipFile(apk) as archive:
        names = archive.namelist()
        native = {name.split('/')[1] for name in names if name.startswith('lib/') and name.endswith('.so')}
        if native != {abi}:
            raise ValueError(f'expected only {abi}, found {sorted(native)}')
        for lib in ['libhermes.so', 'libreactnative.so']:
            if f'lib/{abi}/{lib}' not in names:
                raise ValueError(f'missing runtime library: {lib}')
        if 'assets/index.android.bundle' not in names:
            raise ValueError('missing bundled release JavaScript')
    print(f'[PASS] {abi}: versionCode {code}, version {app["version"]}, {Path(apk).stat().st_size} bytes')


if __name__ == '__main__':
    verify(*sys.argv[1:])
