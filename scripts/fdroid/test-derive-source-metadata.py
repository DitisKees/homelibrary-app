#!/usr/bin/env python3
"""Fast structural tests for derive-source-metadata.py.

Runs inside the pinned fdroidserver environment before any Android build.
"""

from __future__ import annotations

import importlib.util
import tempfile
from pathlib import Path

from fdroidserver import metadata

SCRIPT = Path(__file__).with_name("derive-source-metadata.py")
spec = importlib.util.spec_from_file_location("derive_source_metadata", SCRIPT)
module = importlib.util.module_from_spec(spec)
assert spec.loader
spec.loader.exec_module(module)

FIXTURE = """RepoType: git
Repo: https://example.invalid/app.git
Binaries: 
  https://example.invalid/releases/v%v/App-%v.apk

Builds:
  - versionName: 1.2.3
    versionCode: 42
    commit: v1.2.3
    output: app.apk

AllowedAPKSigningKeys: deadbeef

AutoUpdateMode: None
UpdateCheckMode: None
CurrentVersion: 1.2.3
CurrentVersionCode: 42
"""

with tempfile.TemporaryDirectory() as temp:
    root = Path(temp)
    source = root / ".fdroid.yml"
    destination = root / "source.yml"
    source.write_text(FIXTURE, encoding="utf-8")

    requested = "0123456789abcdef0123456789abcdef01234567"
    module.derive(source, destination, requested, 42)

    app = metadata.parse_metadata(destination)
    assert not app.get("Binaries")
    assert not app.get("AllowedAPKSigningKeys")
    builds = [b for b in app["Builds"] if int(b.versionCode) == 42]
    assert len(builds) == 1
    assert builds[0].commit == requested

    # The canonical release fixture itself must remain unchanged.
    assert "Binaries:" in source.read_text(encoding="utf-8")
    assert "AllowedAPKSigningKeys:" in source.read_text(encoding="utf-8")

print("F-Droid source metadata derivation tests passed.")
