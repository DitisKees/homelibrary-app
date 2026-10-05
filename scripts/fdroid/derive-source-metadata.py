#!/usr/bin/env python3
"""Derive canonical source-test metadata from the canonical release metadata.

This intentionally uses fdroidserver's own parser/writer instead of modifying
YAML as text. Release metadata remains untouched; source-test metadata differs
only by:
  * removing Binaries
  * removing AllowedAPKSigningKeys and every per-build binary
  * replacing the selected build's commit with the requested source SHA
"""

from __future__ import annotations

import argparse
from pathlib import Path

from fdroidserver import metadata


def derive(source: Path, destination: Path, source_ref: str, version_code: int) -> None:
    app = metadata.parse_metadata(source)

    app.pop("Binaries", None)
    app.pop("AllowedAPKSigningKeys", None)
    for build in app.get("Builds", []):
        build.binary = ""

    matching = [
        build
        for build in app.get("Builds", [])
        if int(build.versionCode) == version_code
    ]
    if len(matching) != 1:
        raise SystemExit(
            f"expected exactly one build for versionCode {version_code}, "
            f"found {len(matching)}"
        )

    matching[0].commit = source_ref
    destination.parent.mkdir(parents=True, exist_ok=True)
    metadata.write_metadata(destination, app)

    # Validate the generated file structurally, not by text/whitespace.
    generated = metadata.parse_metadata(destination)
    if generated.get("Binaries"):
        raise SystemExit("source metadata unexpectedly contains Binaries")
    if any(build.binary for build in generated.get("Builds", [])):
        raise SystemExit("source metadata unexpectedly contains a per-build binary")
    if generated.get("AllowedAPKSigningKeys"):
        raise SystemExit("source metadata unexpectedly contains AllowedAPKSigningKeys")

    generated_matching = [
        build
        for build in generated.get("Builds", [])
        if int(build.versionCode) == version_code
    ]
    if len(generated_matching) != 1 or generated_matching[0].commit != source_ref:
        raise SystemExit("source metadata did not retain the requested source commit")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    parser.add_argument("source_ref")
    parser.add_argument("version_code", type=int)
    args = parser.parse_args()
    derive(args.source, args.destination, args.source_ref, args.version_code)


if __name__ == "__main__":
    main()
