"""Exercise release manifest guards using captured aapt-style output."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parent.parent


class AndroidPermissionsTests(unittest.TestCase):
    def test_release_manifest_guards(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            tools = root / 'build-tools' / '36.0.0'
            tools.mkdir(parents=True)
            aapt = tools / 'aapt'
            aapt.write_text('#!/bin/sh\ncat "$BADGING_FIXTURE"\n')
            aapt.chmod(0o755)
            aapt2 = tools / 'aapt2'
            aapt2.write_text('#!/bin/sh\nprintf \'resource 0x7f000001 string/react_native_dev_server_ip\\n  () "localhost"\\n\'\n')
            aapt2.chmod(0o755)
            apk = root / 'fixture.apk'
            with zipfile.ZipFile(apk, 'w') as archive:
                archive.writestr('AndroidManifest.xml', 'fixture')
            fixture = root / 'badging.txt'
            good = "\n".join([
                "package: name='io.github.ditiskees.homelibrary'",
                "sdkVersion:'29'",
                "targetSdkVersion:'36'",
                "uses-permission: name='android.permission.CAMERA'",
                "uses-permission: name='android.permission.INTERNET'",
            ])
            cases = [('valid', good, None),
                     ('old minimum', good.replace("sdkVersion:'29'", "sdkVersion:'28'"), 'API 29')]
            for permission in ['READ_EXTERNAL_STORAGE', 'WRITE_EXTERNAL_STORAGE', 'USE_BIOMETRIC', 'USE_FINGERPRINT']:
                cases.append((permission, good + f"\nuses-permission: name='android.permission.{permission}' maxSdkVersion='32'", permission))
            for permission in ['CAMERA', 'INTERNET']:
                cases.append((permission, good.replace(f"uses-permission: name='android.permission.{permission}'", ''), permission))
            for name, badging, error in cases:
                with self.subTest(name=name):
                    fixture.write_text(badging)
                    result = subprocess.run(
                        ['bash', str(ROOT / 'scripts/verify-fdroid-apk.sh'), str(apk)],
                        env={**os.environ, 'ANDROID_HOME': str(root), 'BADGING_FIXTURE': str(fixture)},
                        capture_output=True, text=True,
                    )
                    if error is None:
                        self.assertEqual(result.returncode, 0, result.stderr)
                    else:
                        self.assertNotEqual(result.returncode, 0)
                        self.assertIn(error, result.stderr)


if __name__ == '__main__':
    unittest.main()
