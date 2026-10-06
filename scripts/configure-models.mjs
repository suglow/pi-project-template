#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const help = `Configure the global Pi models.json for the R9700 profile.

Usage: configure-models [--base-url URL] [--agent-dir DIR] [--dry-run]
  --base-url URL  OpenAI-compatible API root (default: http://127.0.0.1:18982/v1)
  --agent-dir DIR Override PI_CODING_AGENT_DIR or ~/.pi/agent
  --dry-run       Preview destination and changes without writing
  --help          Show this help

Only the paiton and paiton-fast profiles are managed. Existing files are
backed up before writing. Other providers and other model IDs are retained.
`;

function parseArgs(args) {
  const options = {dryRun: false};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--agent-dir' || arg === '--base-url') {
      const value = args[++i];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}.`);
      options[arg === '--agent-dir' ? 'agentDir' : 'baseUrl'] = value;
    } else throw new Error('Unknown option. Use --help for usage.');
  }
  return options;
}

// Pi accepts JSON comments. Preserve strings such as https://... and escaped quotes.
function stripComments(input) {
  let output = '';
  let inString = false;
  let escaped = false;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (inString) {
      output += c;
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
    } else if (c === '"') {
      inString = true;
      output += c;
    } else if (c === '/' && input[i + 1] === '/') {
      output += ' ';
      i += 2;
      while (i < input.length && input[i] !== '\n' && input[i] !== '\r') i++;
      if (i < input.length) output += input[i];
    } else if (c === '/' && input[i + 1] === '*') {
      output += ' ';
      i += 2;
      while (i < input.length && !(input[i] === '*' && input[i + 1] === '/')) {
        if (input[i] === '\n' || input[i] === '\r') output += input[i];
        i++;
      }
      if (i >= input.length) throw new Error('Unterminated JSON comment.');
      i++;
    } else output += c;
  }
  return output;
}

function parseConfig(bytes, label) {
  let data;
  try { data = JSON.parse(stripComments(bytes.toString('utf8').replace(/^\ufeff/, ''))); }
  catch { throw new Error(`${label} is not valid JSON/JSONC. No configuration was changed.`); }
  if (!isObject(data) || (data.providers !== undefined && !isObject(data.providers))) {
    throw new Error(`${label} must be an object with an object-valued providers field.`);
  }
  for (const name of ['paiton', 'paiton-fast']) {
    const provider = data.providers?.[name];
    if (provider === undefined) continue;
    if (!isObject(provider) || (provider.compat !== undefined && !isObject(provider.compat))) {
      throw new Error(`Invalid ${name} provider configuration. No configuration was changed.`);
    }
    if (provider.models !== undefined && (!Array.isArray(provider.models) || provider.models.some(m => !isObject(m) || typeof m.id !== 'string'))) {
      throw new Error(`Invalid models list for ${name}. No configuration was changed.`);
    }
  }
  return data;
}

function normalizeUrl(raw) {
  let url;
  try { url = new URL(raw); } catch { throw new Error('The base URL must be an absolute HTTP(S) API root.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('The base URL must use HTTP(S) without credentials, query or fragment.');
  }
  return url.href.replace(/\/+$/, '');
}

function configure(options) {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 19)) throw new Error('Node.js 22.19 or newer is required.');
  const sourcePath = fileURLToPath(new URL('../config/pi/models.r9700.json', import.meta.url));
  const template = parseConfig(fs.readFileSync(sourcePath), 'Template');
  if (options.baseUrl) {
    const url = normalizeUrl(options.baseUrl);
    for (const provider of Object.values(template.providers)) provider.baseUrl = url;
  }
  const rawDir = options.agentDir || process.env.PI_CODING_AGENT_DIR || path.join(os.homedir(), '.pi', 'agent');
  const expandedDir = rawDir === '~' ? os.homedir() : /^~[\\/]/.test(rawDir) ? path.join(os.homedir(), rawDir.slice(2)) : rawDir;
  const target = path.join(path.resolve(expandedDir), 'models.json');
  if (fs.existsSync(target) && !fs.lstatSync(target).isFile()) {
    throw new Error('models.json must be a regular file; symbolic links and directories are not replaced.');
  }
  const previous = fs.existsSync(target) ? fs.readFileSync(target) : undefined;
  const current = previous ? parseConfig(previous, 'Existing models.json') : {};
  const result = structuredClone(current);
  result.providers = {...(current.providers || {})};
  for (const [name, profile] of Object.entries(template.providers)) {
    const existing = current.providers?.[name] || {};
    const incoming = new Map(profile.models.map(model => [model.id, model]));
    const seen = new Set();
    const models = (existing.models || []).flatMap(model => {
      if (!incoming.has(model.id)) return [model];
      if (seen.has(model.id)) return [];
      seen.add(model.id);
      return [incoming.get(model.id)];
    });
    for (const [id, model] of incoming) if (!seen.has(id)) models.push(model);
    result.providers[name] = {
      ...existing, ...profile,
      compat: {...existing.compat, ...profile.compat},
      models,
    };
  }
  const next = `${JSON.stringify(result, null, 2)}\n`;
  console.log(`Destination: ${target}`);
  console.log('Managed profiles: paiton/Qwen3.8, paiton-fast/Qwen3.8');
  if (previous?.toString('utf8') === next) {
    console.log('Already configured. No changes or backup needed.');
    return;
  }
  if (options.dryRun) {
    console.log(`Dry run: would ${previous ? 'back up and merge' : 'create'} models.json. No files written.`);
    return;
  }
  fs.mkdirSync(path.dirname(target), {recursive: true});
  if (previous) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backup = `${target}.bak-${stamp}-${randomUUID().slice(0, 8)}`;
    fs.writeFileSync(backup, previous, {flag: 'wx', mode: 0o600});
    console.log(`Backup: ${backup}`);
  }
  const temporary = path.join(path.dirname(target), `.models.json-${randomUUID()}.tmp`);
  try {
    fs.writeFileSync(temporary, next, {flag: 'wx', mode: 0o600});
    // Detect edits made after reading the file before replacing it.
    if (previous ? !fs.existsSync(target) || !fs.readFileSync(target).equals(previous) : fs.existsSync(target)) {
      throw new Error('models.json changed during setup. Retry after other configuration writers finish.');
    }
    fs.renameSync(temporary, target);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
  console.log('Configuration saved. Open /model in Pi or start Pi again.');
}

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) console.log(help);
  else configure(options);
} catch (error) {
  // Do not print raw config contents, API keys, or parser excerpts.
  console.error(error instanceof Error ? error.message : 'Configuration setup failed.');
  process.exitCode = 1;
}
