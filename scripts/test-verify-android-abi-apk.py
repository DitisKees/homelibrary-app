#!/usr/bin/env python3
"""Reject mixed/missing native architectures and wrong release identities."""
import importlib.util
import json
import tempfile
import unittest
import zipfile
from pathlib import Path

script = Path(__file__).with_name('verify-android-abi-apk.py')
spec = importlib.util.spec_from_file_location('verify_abi', script)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ApkVerificationTest(unittest.TestCase):
    def test_release_identity_and_native_architectures(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'scripts').mkdir()
            (root / 'scripts/android-release-abis.json').write_text('{"x86_64":4}')
            (root / 'app.json').write_text(json.dumps({'expo': {'version': '1.0.11', 'android': {
                'versionCode': 12, 'package': 'io.github.ditiskees.homelibrary'}}}))
            aapt = root / 'aapt'
            aapt.write_text("#!/bin/sh\necho \"package: name='io.github.ditiskees.homelibrary' versionCode='124' versionName='1.0.11'\"\n")
            aapt.chmod(0o755)
            apk = root / 'app.apk'
            entries = ['lib/x86_64/libhermes.so', 'lib/x86_64/libreactnative.so', 'assets/index.android.bundle']

            def write(names):
                with zipfile.ZipFile(apk, 'w') as archive:
                    for name in names:
                        archive.writestr(name, b'test')

            write(entries)
            module.verify(apk, 'x86_64', root, str(aapt))
            for names in [entries + ['lib/arm64-v8a/libhermes.so'], entries[1:], entries[:-1]]:
                write(names)
                with self.assertRaises(ValueError):
                    module.verify(apk, 'x86_64', root, str(aapt))
            write(entries)
            aapt.write_text(aapt.read_text().replace("versionCode='124'", "versionCode='12'"))
            with self.assertRaises(ValueError):
                module.verify(apk, 'x86_64', root, str(aapt))


if __name__ == '__main__':
    unittest.main()
