#!/usr/bin/env python3
"""Exercise actual Gradle init evaluation, composite builds and local resolution."""
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import zipfile

source = Path(__file__).resolve().parents[2]
gradle = sys.argv[1] if len(sys.argv) > 1 else 'gradle'
with tempfile.TemporaryDirectory(prefix='homelibrary-gradle-') as directory:
    root = Path(directory)
    (root / 'android/app').mkdir(parents=True)
    (root / 'expo-image').mkdir()
    (root / 'scripts').mkdir()
    included = root / 'node_modules/@react-native/gradle-plugin'
    included.mkdir(parents=True)
    (included / 'settings.gradle').write_text("rootProject.name='fixture-included'\n")
    (included / 'build.gradle').write_text("group='fixture'; version='1.0'\n")
    for name in ['glide-ksp-repro.init.gradle', 'check-glide-version.init.gradle']:
        shutil.copyfile(source / 'scripts' / name, root / 'scripts' / name)
    # F-Droid's launcher selects a version from this ordinary text declaration.
    wrapper = root / 'android/gradle/wrapper'
    wrapper.mkdir(parents=True)
    properties = 'distributionUrl=https\\://services.gradle.org/distributions/gradle-8.14.3-bin.zip\n'
    (wrapper / 'gradle-wrapper.properties').write_text(properties)
    wrapper = included / 'gradle/wrapper'
    wrapper.mkdir(parents=True)
    (wrapper / 'gradle-wrapper.properties').write_text(properties)
    (root / 'android/settings.gradle').write_text("""rootProject.name='local-repo-test'
include ':app', ':expo-image'
project(':expo-image').projectDir=file('../expo-image')
includeBuild('../node_modules/@react-native/gradle-plugin') { name = 'fixture-included' }
""")
    build_file = root / 'expo-image/build.gradle'
    original = """configurations { implementation; ksp; kspReleaseKotlinProcessorClasspath { extendsFrom ksp } }
repositories { maven { url = uri(rootProject.file('../build/other-maven')) } }
dependencies {
 implementation 'com.github.bumptech.glide:glide:5.0.5'
 implementation 'com.github.bumptech.glide:avif-integration:5.0.5'
 implementation 'com.github.bumptech.glide:okhttp3-integration:5.0.5'
 ksp 'com.github.bumptech.glide:ksp:5.0.5'
}
"""
    build_file.write_text(original)

    def artifact(repo, group, module, version, dependencies=''):
        target = root / 'build' / repo / group.replace('.', '/') / module / version
        target.mkdir(parents=True)
        with zipfile.ZipFile(target / f'{module}-{version}.jar', 'w'):
            pass
        (target / f'{module}-{version}.pom').write_text(
            f'<project><modelVersion>4.0.0</modelVersion><groupId>{group}</groupId>'
            f'<artifactId>{module}</artifactId><version>{version}</version>{dependencies}</project>')

    artifact('repro-maven', 'com.github.bumptech.glide', 'ksp', '5.0.5',
             '<dependencies><dependency><groupId>com.squareup</groupId><artifactId>kotlinpoet</artifactId>'
             '<version>1.0</version></dependency></dependencies>')
    artifact('other-maven', 'com.squareup', 'kotlinpoet', '1.0')
    args = [gradle, '-I', '../../scripts/glide-ksp-repro.init.gradle',
            ':fixture-included:help', ':expo-image:homeLibraryGlideKspResolution', '--no-daemon']
    success = subprocess.run(args, cwd=root / 'android/app', text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    print(success.stdout)
    assert success.returncode == 0, 'Composite-build/local Maven regression failed'
    expected_jar = root / 'build/repro-maven/com/github/bumptech/glide/ksp/5.0.5/ksp-5.0.5.jar'
    assert f'HOMELIBRARY_KSP_PATCHED={expected_jar}' in success.stdout
    assert 'HOMELIBRARY_KSP_KOTLINPOET=[kotlinpoet-1.0.jar]' in success.stdout
    build_file.write_text(original.replace('5.0.5', '5.0.6'))
    mismatch = subprocess.run(args, cwd=root / 'android/app', text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    assert mismatch.returncode != 0
    assert 'Glide version mismatch: expected 5.0.5' in mismatch.stdout
    assert 'Update the Glide srclib commit' in mismatch.stdout
    # Missing build-local outputs must never fall back to the stock processor.
    build_file.write_text(original)
    expected_jar.unlink()
    missing = subprocess.run(args, cwd=root / 'android/app', text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    assert missing.returncode != 0
    assert 'Complete build-local Glide KSP 5.0.5 mirror is missing' in missing.stdout
print('Composite init, local processor/transitive resolution, version drift and missing-artifact checks passed.')
