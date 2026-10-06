import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn, spawnSync} from 'node:child_process';
import {createServer} from 'node:http';

const root = fileURLToPath(new URL('../', import.meta.url));
function fixture(git = true) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-init-test-'));
  const project = path.join(dir, '测试 project with spaces');
  fs.mkdirSync(project);
  if (git) {
    const result = spawnSync('git', ['init', '-b', 'main', project], {encoding: 'utf8'});
    assert.equal(result.status, 0, result.stderr);
  }
  return {dir, project};
}
function run(project, args = []) {
  // Copy the single downloaded entry point away from the template repository.
  const downloaded = path.join(path.dirname(project), 'downloaded-install.mjs');
  fs.copyFileSync(path.join(root, 'scripts/install-project.mjs'), downloaded);
  return spawnSync(process.execPath, [downloaded, ...args], {cwd: project, encoding: 'utf8'});
}

test('standalone downloaded installer configures an existing Git project', () => {
  const {project} = fixture();
  const originalReadme = 'Existing business README\n';
  fs.writeFileSync(path.join(project, 'README.md'), originalReadme);
  const result = run(project);
  assert.equal(result.status, 0, result.stderr);
  for (const file of ['AGENTS.md', 'PROJECT.md', '.pi/settings.json', '.pi/STATE.example.md', '.pi/prompts/project-start.md', 'scripts/configure-models.bat', 'config/pi/models.r9700.json']) {
    assert.ok(fs.existsSync(path.join(project, file)), file);
  }
  assert.equal(fs.readFileSync(path.join(project, 'README.md'), 'utf8'), originalReadme);
  assert.equal(fs.existsSync(path.join(project, '.pi/STATE.md')), false);
  assert.equal(spawnSync('git', ['symbolic-ref', '--short', 'HEAD'], {cwd: project, encoding: 'utf8'}).stdout.trim(), 'main');
  assert.equal(spawnSync('git', ['remote'], {cwd: project, encoding: 'utf8'}).stdout, '');
});

test('existing project rules and settings are preserved by default', () => {
  const {project} = fixture();
  fs.mkdirSync(path.join(project, '.pi'));
  fs.writeFileSync(path.join(project, 'AGENTS.md'), 'Specific existing rules');
  fs.writeFileSync(path.join(project, '.pi/settings.json'), '{"defaultProvider":"custom"}');
  const result = run(project);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.readFileSync(path.join(project, 'AGENTS.md'), 'utf8'), 'Specific existing rules');
  assert.equal(fs.readFileSync(path.join(project, '.pi/settings.json'), 'utf8'), '{"defaultProvider":"custom"}');
  assert.ok(result.stdout.includes('SKIP AGENTS.md'));
});

test('explicit overwrite backs up old files before replacement', () => {
  const {project} = fixture();
  fs.writeFileSync(path.join(project, 'AGENTS.md'), 'Old rules');
  const result = run(project, ['--overwrite']);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(fs.readFileSync(path.join(project, 'AGENTS.md'), 'utf8').includes('通用 Agent'));
  const backups = fs.readdirSync(path.join(project, '.pi/template-backups'));
  assert.equal(fs.readFileSync(path.join(project, '.pi/template-backups', backups[0], 'AGENTS.md'), 'utf8'), 'Old rules');
});

test('gitignore additions preserve existing rules and remain idempotent', () => {
  const {project} = fixture();
  fs.writeFileSync(path.join(project, '.gitignore'), 'specific-cache/\n');
  assert.equal(run(project).status, 0);
  const first = fs.readFileSync(path.join(project, '.gitignore'), 'utf8');
  assert.ok(first.startsWith('specific-cache/\n'));
  assert.ok(first.includes('.pi/template-backups/'));
  const result = run(project);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.readFileSync(path.join(project, '.gitignore'), 'utf8'), first);
  assert.ok(result.stdout.includes('No changes needed'));
});

test('dry run leaves Git project and global configuration untouched', () => {
  const {dir, project} = fixture();
  const globalDir = path.join(dir, 'global-agent');
  const result = run(project, ['--dry-run', '--global-models', '--agent-dir', globalDir]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(fs.readdirSync(project), ['.git']);
  assert.equal(fs.existsSync(globalDir), false);
});

test('non Git directory is rejected without writing', () => {
  const {project} = fixture(false);
  const result = run(project);
  assert.notEqual(result.status, 0);
  assert.deepEqual(fs.readdirSync(project), []);
});

test('running inside a Git subdirectory installs at repository root', () => {
  const {project} = fixture();
  const sub = path.join(project, 'nested');
  fs.mkdirSync(sub);
  const result = run(sub);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(fs.existsSync(path.join(project, 'AGENTS.md')));
  assert.deepEqual(fs.readdirSync(sub), []);
});

test('global model setup is opt in and uses the requested directory and URL', () => {
  const {dir, project} = fixture();
  const globalDir = path.join(dir, 'global-agent');
  const result = run(project, ['--global-models', '--agent-dir', globalDir, '--base-url', 'http://192.0.2.2:18982/v1']);
  assert.equal(result.status, 0, result.stderr);
  const config = JSON.parse(fs.readFileSync(path.join(globalDir, 'models.json'), 'utf8'));
  assert.equal(config.providers.paiton.baseUrl, 'http://192.0.2.2:18982/v1');
});

test('global-only options require explicit opt in before any project changes', () => {
  const {project} = fixture();
  const result = run(project, ['--agent-dir', path.join(project, 'agent')]);
  assert.notEqual(result.status, 0);
  assert.deepEqual(fs.readdirSync(project), ['.git']);
});

test('directory conflicts abort during preflight before project writes', () => {
  const {project} = fixture();
  fs.mkdirSync(path.join(project, 'AGENTS.md'));
  const result = run(project);
  assert.notEqual(result.status, 0);
  assert.deepEqual(fs.readdirSync(project).sort(), ['.git', 'AGENTS.md']);
});

test('global configuration validation failure leaves the project unchanged', () => {
  const {dir, project} = fixture();
  const globalDir = path.join(dir, 'invalid-agent');
  fs.mkdirSync(globalDir);
  fs.writeFileSync(path.join(globalDir, 'models.json'), 'not JSON');
  const result = run(project, ['--global-models', '--agent-dir', globalDir]);
  assert.notEqual(result.status, 0);
  assert.deepEqual(fs.readdirSync(project), ['.git']);
  assert.equal(fs.readFileSync(path.join(globalDir, 'models.json'), 'utf8'), 'not JSON');
});

test('symlinked configuration directory is rejected before writing', () => {
  const {dir, project} = fixture();
  const outside = path.join(dir, 'outside');
  fs.mkdirSync(outside);
  fs.symlinkSync(outside, path.join(project, '.pi'), process.platform === 'win32' ? 'junction' : 'dir');
  const result = run(project);
  assert.notEqual(result.status, 0);
  assert.equal(fs.existsSync(path.join(project, 'AGENTS.md')), false);
  assert.deepEqual(fs.readdirSync(outside), []);
});

test('Bash entry runs from streamed stdin with no local template files', {skip: process.platform === 'win32' && !fs.existsSync('C:/Program Files/Git/bin/bash.exe')}, () => {
  const {project} = fixture();
  const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';
  const result = spawnSync(bash, ['-s', '--'], {cwd: project, input: fs.readFileSync(path.join(root, 'scripts/install-project.sh')), encoding: 'utf8'});
  assert.equal(result.status, 0, result.stderr);
  assert.ok(fs.existsSync(path.join(project, '.pi/settings.json')));
});

test('downloaded BAT entry runs with no adjacent template files', {skip: process.platform !== 'win32'}, () => {
  const {dir, project} = fixture();
  const batch = path.join(dir, '下载 installer with spaces.bat');
  fs.copyFileSync(path.join(root, 'scripts/install-project.bat'), batch);
  const result = spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `""${batch}""`], {cwd: project, encoding: 'utf8', windowsVerbatimArguments: true});
  assert.equal(result.status, 0, result.stderr);
  assert.ok(fs.existsSync(path.join(project, '.pi/settings.json')));
});

test('curl downloads a self-contained installer; HTTP failure prevents execution', {skip: process.platform === 'win32' && !fs.existsSync('C:/Program Files/Git/bin/bash.exe')}, async () => {
  const server = createServer((request, response) => {
    if (request.url === '/install-project.sh') {
      response.writeHead(200, {'Content-Type': 'text/plain'});
      response.end(fs.readFileSync(path.join(root, 'scripts/install-project.sh')));
    } else { response.writeHead(404); response.end('not found'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';
  try {
    for (const route of ['install-project.sh', 'missing.sh']) {
      const {dir, project} = fixture();
      const download = path.join(dir, 'downloaded.sh').replaceAll('\\', '/');
      const url = `http://127.0.0.1:${server.address().port}/${route}`;
      const result = await new Promise((resolve, reject) => {
        const child = spawn(bash, ['-c', 'curl -fsSL "$1" -o "$2" && bash "$2"', 'pi-init', url, download], {cwd: project});
        let stderr = '';
        child.stderr.on('data', text => { stderr += text; });
        child.stdout.resume();
        child.on('error', reject);
        child.on('close', status => resolve({status, stderr}));
      });
      if (route === 'install-project.sh') {
        assert.equal(result.status, 0, result.stderr);
        assert.ok(fs.existsSync(path.join(project, 'AGENTS.md')));
      } else {
        assert.notEqual(result.status, 0);
        assert.deepEqual(fs.readdirSync(project), ['.git']);
      }
    }
  } finally { await new Promise(resolve => server.close(resolve)); }
});
