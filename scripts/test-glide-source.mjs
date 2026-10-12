import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const root = process.cwd();
const pin = 'ebbf7e2680e0a5812bdb428034aa38fb9260dba7';
const sourceFile = 'ksp/src/main/kotlin/com/bumptech/glide/annotation/ksp/LibraryGlideModules.kt';

test('stages all processor inputs and patches ordering before scanning; rejects source drift', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'glide-source-'));
  try {
    const project = path.join(temp, 'app');
    const upstream = path.join(temp, 'upstream');
    fs.mkdirSync(path.join(project, 'scripts'), { recursive: true });
    fs.cpSync(path.join(root, 'scripts/glide-ksp'), path.join(project, 'scripts/glide-ksp'), { recursive: true });
    fs.copyFileSync(path.join(root, 'scripts/prepare-glide-ksp-source.sh'), path.join(project, 'scripts/prepare-glide-ksp-source.sh'));
    const put = (name, data) => {
      const file = path.join(upstream, name);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, data);
    };
    put(`annotation/${sourceFile}`, 'allLibraryGlideModules.associateBy { it.name }.values.toList()');
    put('annotation/src/main/java/Annotation.java', 'class Annotation {}');
    put('gradle/wrapper/gradle-wrapper.properties', 'distributionUrl=https\\://services.gradle.org/distributions/gradle-8.14.3-bin.zip');
    put('LICENSE', 'upstream license');
    put('gradle/wrapper/gradle-wrapper.jar', 'must not be copied');
    const bin = path.join(temp, 'bin');
    fs.mkdirSync(bin);
    fs.writeFileSync(path.join(bin, 'git'), `#!/bin/sh\nprintf '%s\\n' "${pin}"\n`, { mode: 0o755 });
    const run = () => spawnSync('bash', [path.join(project, 'scripts/prepare-glide-ksp-source.sh'), upstream], {
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` }, encoding: 'utf8',
    });
    assert.equal(run().status, 0);
    const staged = path.join(project, 'build/glide-source');
    assert.match(fs.readFileSync(path.join(staged, sourceFile), 'utf8'), /values.sortedBy/);
    assert.ok(fs.existsSync(path.join(staged, 'annotation/src/main/java/Annotation.java')));
    assert.ok(!fs.existsSync(path.join(staged, 'gradle/wrapper/gradle-wrapper.jar')));
    assert.equal(fs.readFileSync(path.join(staged, 'upstream-commit.txt'), 'utf8').trim(), pin);
    // A second preparation must start from source, not an already patched copy.
    assert.equal(run().status, 0);
    put(`annotation/${sourceFile}`, 'upstream changed');
    assert.notEqual(run().status, 0);
    fs.writeFileSync(path.join(bin, 'git'), '#!/bin/sh\necho wrong-revision\n');
    assert.notEqual(run().status, 0);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
