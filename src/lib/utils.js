import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export function parseArgs(argv) {
  const out = { _: [] };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];

    if (!token.startsWith('--')) {
      out._.push(token);
      continue;
    }

    const key = token.slice(2);
    const next = argv[i + 1];

    if (!next || next.startsWith('--')) {
      out[key] = true;
      continue;
    }

    out[key] = next;
    i += 1;
  }

  return out;
}

export function toBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;

  const v = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(v)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(v)) return false;
  return fallback;
}

export function toInt(value, fallback) {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

export function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

export function readJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

export function readJsonIfExists(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return readJson(filePath);
  } catch {
    return fallback;
  }
}

export function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

export function resolvePath(fromCwdPath, cwd = process.cwd()) {
  return path.isAbsolute(fromCwdPath)
    ? fromCwdPath
    : path.resolve(cwd, fromCwdPath);
}

export function readPayloadFromFile(filePath) {
  return readJson(resolvePath(filePath));
}

export function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

export function randomUuid() {
  return crypto.randomUUID();
}

export function nowIso() {
  return new Date().toISOString();
}

export function exitWithError(message, details = undefined) {
  console.error(`\n[erro] ${message}`);
  if (details !== undefined) {
    if (typeof details === 'string') {
      console.error(details);
    } else {
      console.error(JSON.stringify(details, null, 2));
    }
  }
  process.exit(1);
}
