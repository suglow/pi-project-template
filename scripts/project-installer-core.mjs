import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';

// This source is bundled with the template files by build-installers.mjs.
function argumentsForInstaller(args) {
  const options = {dryRun: false, overwrite: false, globalModels: false, nonInteractive: false};
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (flag === '--help' || flag === '-h') options.help = true;
    else if (flag === '--dry-run') options.dryRun = true;
    else if (flag === '--overwrite') options.overwrite = true;
    else if (flag === '--global-models') options.globalModels = true;
    else if (flag === '--non-interactive') options.nonInteractive = true;
    else if (['--project-dir', '--base-url', '--agent-dir', '--project-name', '--description', '--stack', '--agents'].includes(flag)) {
      const value = args[++i];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}.`);
      options[flag.slice(2)] = value;
    } else throw new Error('Unknown option. Use --help for usage.');
  }
  if (!options.globalModels && (options['agent-dir'] || options['base-url'])) {
    throw new Error('--agent-dir and --base-url require --global-models.');
  }
  return options;
}

const installerHelp = `Install generic Agent and Pi configuration into the current Git project.
Usage: install-project [options]
  --dry-run          Preview; do not change project or global configuration
  --overwrite        Back up and replace existing template-managed files
  --project-dir DIR  Locate the Git project from this directory (default: cwd)
  --non-interactive  Skip the interactive questionnaire and use defaults
  --project-name NAME Project name for PROJECT.md
  --description TEXT Project purpose for PROJECT.md
  --stack TEXT       Language/stack for PROJECT.md
  --agents LIST      Comma-separated agents (codex,pi,opencode,hermes,claude-code)
  --global-models    Also configure global Pi models.json (explicit opt in)
  --base-url URL     Model API root; requires --global-models
  --agent-dir DIR    Global Pi directory; requires --global-models
  --help             Show usage

Existing files are preserved by default. The business README and Git remotes,
branch, index and commit history are not changed. .gitignore gets a managed
block that ignores agent-specific and machine-specific files, while shared
rules (AGENTS.md, CLAUDE.md, PROJECT.md) stay committable.

When run from a terminal, an interactive questionnaire collects the project
name, purpose, stack, and selected agents, then renders PROJECT.md and lays
down only the relevant files. Piped/CI runs skip it; pass --non-interactive
or the --project-name/--description/--stack/--agents options to override.
`;

function checkPath(root, relative) {
  const destination = path.resolve(root, relative);
  const resolved = path.relative(root, destination);
  if (resolved.startsWith('..') || path.isAbsolute(resolved)) throw new Error('Invalid bundled path.');
  let current = destination;
  while (current !== root) {
    const info = fs.lstatSync(current, {throwIfNoEntry: false});
    if (info) {
      if (info.isSymbolicLink()) throw new Error(`Symbolic link conflicts with template path: ${relative}`);
      if (current === destination ? !info.isFile() : !info.isDirectory()) {
        throw new Error(`File/directory conflict at template path: ${relative}`);
      }
    }
    current = path.dirname(current);
  }
  return destination;
}

const ignoreBegin = '# BEGIN pi-project-template';
const ignoreEnd = '# END pi-project-template';
const ignoreBlock = `${ignoreBegin}\n.pi/settings.json\n.pi/STATE.md\n.pi/agent/\n.pi/sessions/\n.pi/template-backups/\nconfig/pi/models.r9700.json\nscripts/configure-models.mjs\nscripts/configure-models.sh\nscripts/configure-models.bat\ndocs/DECISIONS.md\nopencode.json\n${ignoreEnd}\n`;

function gitignoreContent(previous) {
  const text = previous?.toString('utf8') || '';
  const normalized = text.replaceAll('\r\n', '\n');
  if ((normalized.includes(ignoreBegin) || normalized.includes(ignoreEnd)) &&
      (normalized.split(ignoreBegin).length !== 2 || normalized.split(ignoreEnd).length !== 2)) {
    throw new Error('Invalid managed .gitignore block; correct its markers before retrying.');
  }
  const start = normalized.indexOf(ignoreBegin);
  if (start >= 0) {
    const end = normalized.indexOf(ignoreEnd);
    if (end < start) throw new Error('Invalid managed .gitignore block.');
    const existing = normalized.slice(start, end + ignoreEnd.length).trimEnd();
    if (existing === ignoreBlock.trimEnd()) return previous;
    throw new Error('Existing managed .gitignore block differs; review it before retrying.');
  }
  return Buffer.from(`${text}${text && !text.endsWith('\n') ? '\n' : ''}${text ? '\n' : ''}${ignoreBlock}`);
}

function canInteract(options) {
  if (options.nonInteractive) return false;
  if (process.stdin.isTTY) return true;
  if (process.platform !== 'win32') {
    try { fs.accessSync('/dev/tty', fs.constants.R_OK); return true; } catch {}
  }
  return false;
}

function interactiveFd() {
  if (process.platform !== 'win32') {
    try { return fs.openSync('/dev/tty', 'r'); } catch {}
  }
  return 0;
}

function askSync(fd, question, defaultValue) {
  const suffix = defaultValue ? ` [${defaultValue}]` : '';
  process.stdout.write(`${question}${suffix}: `);
  const buffer = Buffer.alloc(4096);
  let total = 0;
  while (total < buffer.length) {
    const read = fs.readSync(fd, buffer, total, buffer.length - total, null);
    if (read === 0) break;
    total += read;
    if (buffer.subarray(0, total).includes(0x0a)) break;
  }
  const answer = buffer.toString('utf8', 0, total).split(/\r?\n/, 1)[0].trim();
  return answer === '' ? (defaultValue ?? '') : answer;
}

function collectAnswers(options, root) {
  const fd = interactiveFd();
  try {
    const name = askSync(fd, '项目名称', options['project-name'] || path.basename(root));
    const description = askSync(fd, '一句话用途/描述', options['description'] || '');
    const stack = askSync(fd, '主要语言/技术栈', options['stack'] || '');
    const agentsDefault = options['agents'] || 'codex,pi,opencode,hermes,claude-code';
    const agents = askSync(fd, '选用哪些编码 Agent（逗号分隔，回车=全部）', agentsDefault);
    const globalModels = askSync(fd, '现在配置全局模型？(y/N)', 'n');
    return {
      name,
      description,
      stack,
      agents: agents.split(',').map(item => item.trim().toLowerCase()).filter(Boolean),
      globalModels: /^y(es)?$/i.test(globalModels.trim()),
    };
  } finally {
    if (fd !== 0) fs.closeSync(fd);
  }
}

function renderProjectMd(template, answers) {
  let text = template;
  if (answers.name) text = text.replace('- 项目名称：待确认', `- 项目名称：${answers.name}`);
  if (answers.description) text = text.replace('- 用途和用户：待确认', `- 用途和用户：${answers.description}`);
  if (answers.stack) text = text.replace('- 语言和运行时：待确认', `- 语言和运行时：${answers.stack}`);
  return text;
}

function filesForAgents(bundle, agents) {
  const groups = bundle.groups || {};
  const selected = {};
  for (const [relative, encoded] of Object.entries(bundle.files)) {
    const group = groups[relative] || 'common';
    if (group === 'common' || agents.includes(group) || agents.includes('all')) {
      selected[relative] = encoded;
    }
  }
  return selected;
}

function globalStage(bundle) {
  const tempRoot = fs.realpathSync(os.tmpdir());
  const directory = fs.mkdtempSync(path.join(tempRoot, 'pi-project-global-'));
  for (const relative of ['scripts/configure-models.mjs', 'config/pi/models.r9700.json']) {
    const file = path.join(directory, relative);
    fs.mkdirSync(path.dirname(file), {recursive: true});
    fs.writeFileSync(file, Buffer.from(bundle.files[relative], 'base64'));
  }
  return {
    run(options, dryRun) {
      const args = [path.join(directory, 'scripts/configure-models.mjs')];
      for (const name of ['base-url', 'agent-dir']) if (options[name]) args.push(`--${name}`, options[name]);
      if (dryRun) args.push('--dry-run');
      const result = spawnSync(process.execPath, args, {encoding: 'utf8'});
      if (result.stdout) process.stdout.write(result.stdout);
      if (result.stderr) process.stderr.write(result.stderr);
      if (result.status !== 0) throw new Error('Global model configuration failed.');
    },
    cleanup() {
      const relative = path.relative(tempRoot, path.resolve(directory));
      if (!relative.startsWith('pi-project-global-') || relative.includes(path.sep)) {
        throw new Error('Unexpected staging path; cleanup cancelled.');
      }
      fs.rmSync(directory, {recursive: true, force: true});
    },
  };
}

function installProject(bundle) {
  const options = argumentsForInstaller(process.argv.slice(2));
  if (options.help) { console.log(installerHelp); return; }
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 19)) throw new Error('Node.js 22.19+ is required.');
  const working = path.resolve(options['project-dir'] || process.cwd());
  const git = spawnSync('git', ['-C', working, 'rev-parse', '--show-toplevel'], {encoding: 'utf8'});
  if (git.status !== 0) throw new Error('No accessible Git project. Run git init first, or use --project-dir.');
  const root = fs.realpathSync(git.stdout.trim());
  console.log(`Project root: ${root}`);
  const answers = canInteract(options) ? collectAnswers(options, root) : {
    name: options['project-name'] || '',
    description: options['description'] || '',
    stack: options['stack'] || '',
    agents: (options['agents'] || 'codex,pi,opencode,hermes,claude-code').split(',').map(item => item.trim().toLowerCase()).filter(Boolean),
    globalModels: false,
  };
  if (answers.globalModels) options.globalModels = true;
  console.log(`Selected agents: ${answers.agents.join(', ') || '(common only)'}`);
  if (answers.name || answers.description || answers.stack) {
    console.log(`Project: ${answers.name || '-'} | ${answers.description || '-'} | ${answers.stack || '-'}`);
  }
  const plan = [];
  for (const [relative, encoded] of Object.entries(filesForAgents(bundle, answers.agents))) {
    const decoded = Buffer.from(encoded, 'base64');
    const incoming = relative === 'PROJECT.md'
      ? Buffer.from(renderProjectMd(decoded.toString('utf8'), answers))
      : decoded;
    const file = checkPath(root, relative);
    const previous = fs.existsSync(file) ? fs.readFileSync(file) : undefined;
    const action = previous ? previous.equals(incoming) ? 'MATCH' : options.overwrite ? 'REPLACE' : 'SKIP' : 'CREATE';
    plan.push({relative, file, previous, incoming, action});
  }
  const ignoreFile = checkPath(root, '.gitignore');
  const ignorePrevious = fs.existsSync(ignoreFile) ? fs.readFileSync(ignoreFile) : undefined;
  const ignoreIncoming = gitignoreContent(ignorePrevious);
  plan.push({relative: '.gitignore', file: ignoreFile, previous: ignorePrevious, incoming: ignoreIncoming,
    action: ignorePrevious ? ignorePrevious.equals(ignoreIncoming) ? 'MATCH' : 'UPDATE' : 'CREATE'});
  const changes = plan.filter(item => !['MATCH', 'SKIP'].includes(item.action));
  const backupRelative = `.pi/template-backups/${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
  for (const item of changes) if (item.previous) checkPath(root, `${backupRelative}/${item.relative}`);
  for (const item of plan) console.log(`${options.dryRun ? 'PREVIEW ' : ''}${item.action} ${item.relative}`);

  const stage = options.globalModels ? globalStage(bundle) : undefined;
  try {
    // Validate global input before making project changes.
    if (stage) stage.run(options, true);
    if (options.dryRun) { console.log('Dry run complete. Project and global configuration unchanged.'); return; }
    for (const item of changes) {
      checkPath(root, item.relative);
      if (item.previous ? !fs.existsSync(item.file) || !fs.readFileSync(item.file).equals(item.previous) : fs.existsSync(item.file)) {
        throw new Error(`File changed during setup: ${item.relative}. Earlier changes may already be installed.`);
      }
      if (item.previous) {
        const backup = checkPath(root, `${backupRelative}/${item.relative}`);
        fs.mkdirSync(path.dirname(backup), {recursive: true});
        fs.writeFileSync(backup, item.previous, {flag: 'wx', mode: 0o600});
      }
      fs.mkdirSync(path.dirname(item.file), {recursive: true});
      const temporary = path.join(path.dirname(item.file), `.pi-init-${randomUUID()}.tmp`);
      try {
        fs.writeFileSync(temporary, item.incoming, {flag: 'wx', mode: item.relative.endsWith('.sh') ? 0o755 : 0o644});
        fs.renameSync(temporary, item.file);
      } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
    }
    if (changes.some(item => item.previous)) console.log(`Backup directory: ${path.join(root, backupRelative)}`);
    if (stage) stage.run(options, false);
    console.log(changes.length ? 'Project configuration installed. Fill PROJECT.md, then start Pi.' : 'No changes needed.');
    if (plan.some(item => item.action === 'SKIP')) console.log('Existing files marked SKIP were kept; review them or use --overwrite with backups.');
  } finally { stage?.cleanup(); }
}
