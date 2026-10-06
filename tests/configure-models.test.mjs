import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync, existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const script = path.join(root, 'scripts/configure-models.mjs');
const sandbox = () => mkdtempSync(path.join(tmpdir(), 'pi-template-test-'));
const run = (args = [], env = {}) => spawnSync(process.execPath, [script, ...args], {
  cwd: tmpdir(), encoding: 'utf8', env: {...process.env, ...env},
});
const parse = dir => JSON.parse(readFileSync(path.join(dir, 'models.json'), 'utf8'));

test('creates models in an explicit directory containing spaces and Chinese characters', () => {
  const dir = path.join(sandbox(), '测试项目 with spaces', 'agent');
  const result = run(['--agent-dir', dir]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(parse(dir).providers.paiton.models[0].id, 'Qwen3.8');
  assert.equal(parse(dir).providers['paiton-fast'].models[0].contextWindow, 245000);
  assert.equal(readdirSync(dir).length, 1);
});

test('backs up exact existing bytes and preserves unrelated providers, models and fields', () => {
  const dir = sandbox();
  const original = '\ufeff{\n// personal settings\n"customRoot":true,"providers":{"cloud":{"apiKey":"secret-example"},"paiton":{"headers":{"X-Custom":"yes"},"models":[{"id":"OtherModel","contextWindow":4096},{"id":"Qwen3.8","maxTokens":1}]}}}\n';
  writeFileSync(path.join(dir, 'models.json'), original);
  const result = run(['--agent-dir', dir]);
  assert.equal(result.status, 0, result.stderr);
  const data = parse(dir);
  assert.equal(data.customRoot, true);
  assert.equal(data.providers.cloud.apiKey, 'secret-example');
  assert.equal(data.providers.paiton.headers['X-Custom'], 'yes');
  assert.equal(data.providers.paiton.models.find(x => x.id === 'OtherModel').contextWindow, 4096);
  assert.equal(data.providers.paiton.models.filter(x => x.id === 'Qwen3.8').length, 1);
  assert.equal(data.providers.paiton.models.find(x => x.id === 'Qwen3.8').maxTokens, 16384);
  const backups = readdirSync(dir).filter(x => x.startsWith('models.json.bak-'));
  assert.equal(backups.length, 1);
  assert.equal(readFileSync(path.join(dir, backups[0]), 'utf8'), original);
  assert.ok(!result.stdout.includes('secret-example'));
});

test('repeated setup makes no change and does not create more backups', () => {
  const dir = sandbox();
  assert.equal(run(['--agent-dir', dir]).status, 0);
  const before = readFileSync(path.join(dir, 'models.json'), 'utf8');
  const result = run(['--agent-dir', dir]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(path.join(dir, 'models.json'), 'utf8'), before);
  assert.deepEqual(readdirSync(dir), ['models.json']);
});

test('existing duplicates of the managed model are consolidated', () => {
  const dir = sandbox();
  writeFileSync(path.join(dir, 'models.json'), JSON.stringify({providers: {paiton: {models: [{id: 'Qwen3.8', maxTokens: 1}, {id: 'Qwen3.8', maxTokens: 2}]}}}));
  const result = run(['--agent-dir', dir]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(parse(dir).providers.paiton.models.filter(x => x.id === 'Qwen3.8').length, 1);
});

test('dry run does not create the destination directory', () => {
  const dir = path.join(sandbox(), 'nonexistent', 'agent');
  const result = run(['--agent-dir', dir, '--dry-run']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(dir), false);
});

test('invalid JSON fails without modifying it or exposing its contents', () => {
  const dir = sandbox();
  const original = '{"secret-example" bad json';
  writeFileSync(path.join(dir, 'models.json'), original);
  const result = run(['--agent-dir', dir]);
  assert.notEqual(result.status, 0);
  assert.equal(readFileSync(path.join(dir, 'models.json'), 'utf8'), original);
  assert.deepEqual(readdirSync(dir), ['models.json']);
  assert.ok(!result.stderr.includes('secret-example'));
});

test('invalid provider/model shapes are rejected without writing', () => {
  for (const data of [{providers: []}, {providers: {paiton: 'invalid'}}, {providers: {paiton: {models: {}}}}]) {
    const dir = sandbox();
    const original = JSON.stringify(data);
    writeFileSync(path.join(dir, 'models.json'), original);
    assert.notEqual(run(['--agent-dir', dir]).status, 0);
    assert.equal(readFileSync(path.join(dir, 'models.json'), 'utf8'), original);
    assert.deepEqual(readdirSync(dir), ['models.json']);
  }
});

test('environment directory and explicit directory precedence work', () => {
  const envDir = path.join(sandbox(), 'env-agent');
  const explicitDir = path.join(sandbox(), 'explicit-agent');
  assert.equal(run([], {PI_CODING_AGENT_DIR: envDir}).status, 0);
  assert.ok(existsSync(path.join(envDir, 'models.json')));
  assert.equal(run(['--agent-dir', explicitDir], {PI_CODING_AGENT_DIR: envDir}).status, 0);
  assert.ok(existsSync(path.join(explicitDir, 'models.json')));
});

test('base URL validation and replacement affect both template providers', () => {
  const dir = sandbox();
  const result = run(['--agent-dir', dir, '--base-url', 'http://192.0.2.1:18982/v1/']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(parse(dir).providers.paiton.baseUrl, 'http://192.0.2.1:18982/v1');
  assert.equal(parse(dir).providers['paiton-fast'].baseUrl, 'http://192.0.2.1:18982/v1');
  const invalidDir = path.join(sandbox(), 'bad-url');
  assert.notEqual(run(['--agent-dir', invalidDir, '--base-url', 'file:///tmp/model']).status, 0);
  assert.equal(existsSync(invalidDir), false);
});

test('JSON comments preserve URL strings and escaped content', () => {
  const dir = sandbox();
  writeFileSync(path.join(dir, 'models.json'), '{/* note */"providers":{"other":{"baseUrl":"https://example.com/a//b","note":"quote \\\" /* literal */"}}}');
  const result = run(['--agent-dir', dir]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(parse(dir).providers.other.baseUrl, 'https://example.com/a//b');
  assert.equal(parse(dir).providers.other.note, 'quote " /* literal */');
});

test('unknown options and missing arguments fail before writing', () => {
  const dir = sandbox();
  assert.notEqual(run(['--agent-dir', dir, '--unknown']).status, 0);
  assert.notEqual(run(['--base-url']).status, 0);
  assert.deepEqual(readdirSync(dir), []);
});

test('BAT wrapper works from an unrelated working directory', {skip: process.platform !== 'win32'}, () => {
  const dir = path.join(sandbox(), '测试 agent with spaces');
  const batch = path.join(root, 'scripts', 'configure-models.bat');
  const result = spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `""${batch}" --agent-dir "${dir}""`], {cwd: tmpdir(), encoding: 'utf8', windowsVerbatimArguments: true});
  assert.equal(result.status, 0, result.stderr);
  assert.equal(parse(dir).providers.paiton.models[0].id, 'Qwen3.8');
});

test('Bash wrapper works from an unrelated working directory', {skip: !existsSync('C:/Program Files/Git/bin/bash.exe') && process.platform === 'win32'}, () => {
  const dir = path.join(sandbox(), 'agent with spaces');
  const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';
  const wrapper = path.join(root, 'scripts/configure-models.sh').replaceAll('\\', '/');
  const result = spawnSync(bash, [wrapper, '--agent-dir', dir], {cwd: tmpdir(), encoding: 'utf8'});
  assert.equal(result.status, 0, result.stderr);
  assert.equal(parse(dir).providers['paiton-fast'].models[0].id, 'Qwen3.8');
});
