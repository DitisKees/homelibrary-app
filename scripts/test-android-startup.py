#!/usr/bin/env python3
"""Exercise startup verification against app and device process events."""
import os
import subprocess
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).with_name('smoke-android-startup.sh')
ADB = '''#!/usr/bin/env python3
import os, sys
from pathlib import Path
args = sys.argv[1:]
if args[:2] == ['shell', 'cat']:
    print(os.environ['TEST_UI'])
elif args[:2] == ['shell', 'pidof']:
    path = Path('pid-calls')
    count = int(path.read_text()) if path.exists() else 0
    path.write_text(str(count + 1))
    print('5678' if count and os.environ['TEST_RESTART'] else '1234')
elif args[:2] == ['logcat', '-d']:
    print(os.environ['TEST_APP_LOG'])
    if '--pid=1234' not in args:
        print(os.environ['TEST_SYSTEM_LOG'])
'''


class StartupTest(unittest.TestCase):
    def test_rendering_and_crash_scope(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name, contents in [('adb', ADB), ('sleep', '#!/bin/sh\nexit 0\n')]:
                path = root / name
                path.write_text(contents)
                path.chmod(0o755)
            cases = [
                ('login', 'HomeLibrary', '', '', '', 0),
                ('setup', 'Enter the HTTPS URL of the PocketBase server.', '', '', '', 0),
                ('native crash', 'HomeLibrary', 'FATAL EXCEPTION: main', '', '', 1),
                ('JS crash', 'HomeLibrary', 'ReactNativeJS: Error: missing native module', '', '', 1),
                ('device crash', 'HomeLibrary', '', 'Fatal signal in Bluetooth; FATAL EXCEPTION in uiautomator', '', 0),
                ('restart', 'HomeLibrary', '', '', '1', 1),
                ('splash', '', '', '', '', 1),
            ]
            for name, text, app_log, device_log, restart, expected in cases:
                with self.subTest(name=name):
                    (root / 'pid-calls').unlink(missing_ok=True)
                    env = dict(os.environ, PATH=directory + ':' + os.environ['PATH'],
                               TEST_UI=f'<node text="{text}" />', TEST_APP_LOG=app_log,
                               TEST_SYSTEM_LOG=device_log, TEST_RESTART=restart)
                    result = subprocess.run(['bash', str(SCRIPT.resolve()), 'fixture.apk'],
                                            cwd=directory, env=env, capture_output=True, text=True)
                    self.assertEqual(result.returncode, expected, result.stdout + result.stderr)


if __name__ == '__main__':
    unittest.main()
