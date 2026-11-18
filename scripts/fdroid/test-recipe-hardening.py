#!/usr/bin/env python3
"""Validate parsed recipes and ensure new binary paths cannot be silently deleted."""
from pathlib import Path
import argparse
import tempfile
from fdroidserver import common, metadata, scanner

root = Path(__file__).resolve().parents[2]
app = metadata.parse_metadata(root / '.fdroid.yml')
# Match Read Me's accepted recipe; no individually managed Debian npm modules.
expected_sudo = [
    "echo \"deb https://deb.debian.org/debian forky main\" > /etc/apt/sources.list.d/forky.list",
    'apt-get update',
    'apt-get install -y -t forky nodejs npm',
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
print('Simple Debian Node recipe, local Maven policy and scanner fail-closed regression passed.')
