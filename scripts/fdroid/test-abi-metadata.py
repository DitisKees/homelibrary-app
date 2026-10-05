#!/usr/bin/env python3
"""Check actual parsed F-Droid builds, URLs and future version-code ordering."""
import json
from pathlib import Path
from fdroidserver import metadata

root = Path(__file__).resolve().parents[2]
config = json.loads((root / 'app.json').read_text())['expo']
abis = json.loads((root / 'scripts/android-release-abis.json').read_text())
app = metadata.parse_metadata(root / '.fdroid.yml')
base = config['android']['versionCode']
expected = [base * 10 + offset for offset in abis.values()]
assert [build.versionCode for build in app['Builds']] == expected
assert not app.get('Binaries')
assert "Google Books" in app.AntiFeatures["NonFreeNet"]["en-US"]
assert app.CurrentVersionCode == max(expected)
assert app.VercodeOperation == [f'10 * %c + {offset}' for offset in abis.values()]
assert min((base + 1) * 10 + offset for offset in abis.values()) > max(expected)
for (abi, offset), build in zip(abis.items(), app['Builds']):
    assert build.versionName == config['version']
    assert build.commit == 'v' + config['version']
    assert build.binary.endswith(f'/HomeLibrary-%v-{abi}.apk')
    assert f'-PreactNativeArchitectures={abi}' in '\n'.join(build.build)
    assert f'{build.output} {abi}' in '\n'.join(build.postbuild)
    for locale in ['en-US', 'nl-NL', 'de-DE', 'fr-FR']:
        text = (root / f'fastlane/metadata/android/{locale}/changelogs/{build.versionCode}.txt').read_text().strip()
        assert 0 < len(text) <= 500
print('ABI metadata, binary URLs, changelogs and future update ordering passed.')
