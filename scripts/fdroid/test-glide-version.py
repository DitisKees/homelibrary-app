#!/usr/bin/env python3
"""Exercise the shared Gradle rule with a small isolated dependency fixture."""
from pathlib import Path
import subprocess
import sys
import tempfile
import zipfile

source = Path(__file__).resolve().parents[1] / 'glide-version.gradle'
gradle = sys.argv[1]
group = 'com.github.bumptech.glide'
with tempfile.TemporaryDirectory() as directory:
    root = Path(directory)
    for name in ('app', 'expo-image'):
        (root / name).mkdir()
    # F-Droid's gradlew-fdroid launcher needs a text-only Gradle version
    # declaration. Match the actual Expo SDK 57 Android wrapper version so
    # Gradle 9's project-lock checks are exercised before the full ABI matrix.
    wrapper = root / 'gradle/wrapper'
    wrapper.mkdir(parents=True)
    (wrapper / 'gradle-wrapper.properties').write_text(
        'distributionUrl=https\\://services.gradle.org/distributions/gradle-9.3.1-bin.zip\n'
    )
    (root / 'settings.gradle').write_text("rootProject.name='fixture'\ninclude ':app', ':expo-image'\n")
    (root / 'glide-version.gradle').write_text(source.read_text())
    (root / 'build.gradle').write_text(
        "allprojects { repositories { maven { url = rootProject.file('repo') } } }\n"
        "apply from: 'glide-version.gradle'\n"
    )
    def artifact(name, dependencies=(), version='5.0.9', artifact_group=group):
        path = root / 'repo' / artifact_group.replace('.', '/') / name / version
        path.mkdir(parents=True)
        deps = ''.join(
            f'<dependency><groupId>{dep_group}</groupId><artifactId>{dep}</artifactId>'
            f'<version>{dep_version}</version></dependency>'
            for dep_group, dep, dep_version in dependencies
        )
        (path / f'{name}-{version}.pom').write_text(
            f'<project><modelVersion>4.0.0</modelVersion><groupId>{artifact_group}</groupId>'
            f'<artifactId>{name}</artifactId><version>{version}</version>'
            f'<dependencies>{deps}</dependencies></project>'
        )
        with zipfile.ZipFile(path / f'{name}-{version}.jar', 'w') as jar:
            jar.writestr('fixture.txt', name)
    artifact('annotations')
    artifact('glide', ((group, 'annotations', '5.0.9'),))
    artifact('ksp', ((group, 'annotations', '5.0.9'),))
    artifact('avif-integration', ((group, 'glide', '5.0.9'),))
    artifact('okhttp3-integration', ((group, 'glide', '5.0.9'),))
    # Mirror the actual SDK 57 graph: external image integrations request older
    # Glide core versions. They must resolve to 5.0.9, not fail at selection.
    for version in ('4.11.0', '4.12.0', '5.0.10'):
        artifact('glide', version=version)
    artifact('legacy-image-a', ((group, 'glide', '4.11.0'),),
             version='1.0', artifact_group='fixture')
    artifact('legacy-image-b', ((group, 'glide', '4.12.0'),),
             version='1.0', artifact_group='fixture')
    expo = root / 'expo-image' / 'build.gradle'
    expo.write_text(
        "configurations { implementation; ksp; kspReleaseKotlinProcessorClasspath { extendsFrom ksp } }\n"
        "dependencies {\n" +
        ''.join(f"implementation '{group}:{name}:5.0.5'\n" for name in
                ('glide', 'avif-integration', 'okhttp3-integration')) +
        f"ksp '{group}:ksp:5.0.5'\n}}\n"
    )
    app = root / 'app' / 'build.gradle'
    app.write_text(
        "configurations { releaseRuntimeClasspath }\n" +
        "dependencies {\n" +
        ''.join(f"releaseRuntimeClasspath '{group}:{name}:5.0.5'\n" for name in
                ('glide', 'avif-integration', 'okhttp3-integration')) +
        "releaseRuntimeClasspath 'fixture:legacy-image-a:1.0'\n"
        "releaseRuntimeClasspath 'fixture:legacy-image-b:1.0'\n}\n"
    )
    def run():
        return subprocess.run(
            [gradle, '--offline', '--no-daemon', '--parallel',
             ':expo-image:homeLibraryVerifyGlideKsp', ':app:homeLibraryVerifyGlideRuntime'],
            cwd=root, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        )
    good = run()
    assert good.returncode == 0, good.stdout
    assert 'HOMELIBRARY_GLIDE_KSP=ksp-5.0.9.jar' in good.stdout, good.stdout
    assert 'HOMELIBRARY_GLIDE_GRAPH releaseRuntimeClasspath:' in good.stdout, good.stdout
    assert 'com.github.bumptech.glide:glide:5.0.9' in good.stdout, good.stdout
    original = expo.read_text()
    expo.write_text(original.replace(':ksp:5.0.5', ':ksp:5.0.10'))
    bad = run()
    assert bad.returncode != 0 and 'Expo Image Glide declarations changed' in bad.stdout, bad.stdout
    expo.write_text(original)
    app.write_text(app.read_text().replace(':glide:5.0.5', ':glide:5.0.10'))
    bad = run()
    assert bad.returncode != 0 and 'Unexpected Glide graph on releaseRuntimeClasspath' in bad.stdout, bad.stdout
print('Official Glide version selection and declaration/graph guards passed.')
