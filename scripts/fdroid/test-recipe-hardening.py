#!/usr/bin/env python3
"""Validate parsed recipes and the maintainer-approved scanner deletion policy."""
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
    assert build.scandelete == ['node_modules']
    assert not build.srclibs
    assert not any('glide' in path.lower() for path in build.scanignore)
    assert 'bash scripts/check-fdroid-android-dependencies.sh' in build.prebuild
    assert 'gradle assembleRelease' in '\n'.join(build.build)

# Exercise the actual pinned scanner behavior. The maintainer-approved blanket
# deletion removes npm-installed node_modules before scanning, while scanner
# findings elsewhere in the source tree must still fail closed.
common.options = argparse.Namespace(verbose=False, json=True, refresh_scanner=False)
common.config = common.read_config()
with tempfile.TemporaryDirectory() as directory:
    work = Path(directory)
    npm_binary = work / 'node_modules/new-unreviewed/prebuilt.aar'
    npm_binary.parent.mkdir(parents=True)
    npm_binary.write_bytes(b'new binary dependency')
    reviewed = work / 'node_modules/zxing-wasm/dist/reader/zxing_reader.wasm'
    reviewed.parent.mkdir(parents=True)
    reviewed.write_bytes(b'\x00asm\x01\x00\x00\x00')
    outside = work / 'vendor/new-unreviewed/prebuilt.aar'
    outside.parent.mkdir(parents=True)
    outside.write_bytes(b'outside node_modules')
    build = metadata.Build()
    build.scandelete = ['node_modules']
    messages = scanner.MessageStore()
    assert scanner.scan_source(directory, build, messages) == 1
    assert not npm_binary.exists(), 'node_modules scandelete was not applied'
    assert not reviewed.exists(), 'node_modules scandelete did not remove reviewed WASM'
    assert outside.exists(), 'scanner unexpectedly deleted a binary outside node_modules'
    assert messages.errors == [['Android AAR library', 'vendor/new-unreviewed/prebuilt.aar']]
print('Simple Debian Node recipe, official Glide policy and maintainer-approved scanner regression passed.')
