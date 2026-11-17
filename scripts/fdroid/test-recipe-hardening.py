#!/usr/bin/env python3
"""Validate parsed recipes and ensure new binary paths cannot be silently deleted."""
from pathlib import Path
import argparse
import json
import tempfile
from fdroidserver import common, metadata, scanner

root = Path(__file__).resolve().parents[2]
app = metadata.parse_metadata(root / '.fdroid.yml')
version = (root / '.nvmrc').read_text().strip()
pin = json.loads((root / 'scripts/node-toolchain.json').read_text())
# Exact commands are intentional: no apt sources, unverified downloads,
# additional installers, or extraction before a successful checksum check.
expected_sudo = [
    'archive=$(mktemp)',
    'trap \'rm -f "$archive"\' EXIT',
    f'url=https://nodejs.org/dist/v{version}/node-v{version}-linux-x64.tar.gz',
    f'sha256={pin["linuxX64TarGzSha256"]}',
    'curl -fL --retry 3 -o "$archive" "$url"',
    'echo "$sha256  $archive" | sha256sum -c -',
    'tar -xzf "$archive" --no-same-owner --strip-components=1 -C /usr/local',
]
assert len(app.Builds) == 4
for build in app.Builds:
    assert build.sudo == expected_sudo, f'Unexpected sudo recipe for {build.versionCode}'
    assert build.init[:2] == ['node scripts/check-node-toolchain.mjs', 'npm ci']
    assert not any('"node"' in step for step in build.init)
    assert not any('/usr/share/maven-repo' in step for step in build.sudo + build.build)
    assert 'node_modules' not in build.scandelete
    assert all(path.startswith('node_modules/') for path in build.scandelete)
    assert 'scripts/glide-ksp-repro.init.gradle' in build.scanignore
    assert ':expo-image:homeLibraryGlideKspResolution assembleRelease' in '\n'.join(build.build)

# Use the actual pinned scanner's rule matcher: known binaries are deleted,
# while an unrelated new AAR produces an error and remains for inspection.
common.options = argparse.Namespace(verbose=False, json=True, refresh_scanner=False)
common.config = common.read_config()
with tempfile.TemporaryDirectory() as directory:
    work = Path(directory)
    new = work / 'node_modules/new-unreviewed/prebuilt.aar'
    new.parent.mkdir(parents=True)
    new.write_bytes(b'new binary dependency')
    reviewed = work / 'node_modules/zxing-wasm/dist/reader/zxing_reader.wasm'
    reviewed.parent.mkdir(parents=True)
    reviewed.write_bytes(b'\x00asm\x01\x00\x00\x00')
    build = metadata.Build()
    build.scandelete = [p for p in app.Builds[0].scandelete if 'zxing_reader.wasm' in p]
    messages = scanner.MessageStore()
    assert scanner.scan_source(directory, build, messages) == 1
    assert new.exists(), 'A newly introduced binary was silently removed'
    assert not reviewed.exists(), 'Reviewed WASM deletion was not applied'
    assert messages.errors == [['Android AAR library', 'node_modules/new-unreviewed/prebuilt.aar']]
print('Official Node pins, local Maven policy and scanner fail-closed regression passed.')
