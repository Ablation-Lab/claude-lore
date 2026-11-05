// Shared helpers for Claude Lore: paths, local dates, small JSON files, and
// the settings.json edits that turn the daily hook on and off.
// Uses only Node's built-in modules, so there is nothing to install.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Claude Code keeps its user folder in ~/.claude unless CLAUDE_CONFIG_DIR says
// otherwise. Honouring it here also lets the tests use a throwaway folder.
export function claudeDir() {
  return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
}

// The skill is called lore-lookup: skill names uploaded to claude.ai or the
// API can't contain "claude". Before 2026-11-05 it was installed as
// "claude-lore"; the installer moves that over (see LEGACY_SKILL_NAME).
export const SKILL_NAME = 'lore-lookup';
export const LEGACY_SKILL_NAME = 'claude-lore';
export const DATA_NAME = 'claude-lore-data'; // the project's data folder; not a skill or repo name

export function paths() {
  const base = claudeDir();
  const skillDir = path.join(base, 'skills', SKILL_NAME);
  const data = path.join(base, DATA_NAME);
  return {
    claudeDir: base,
    settings: path.join(base, 'settings.json'),
    skillDir,
    legacySkillDir: path.join(base, 'skills', LEGACY_SKILL_NAME),
    manifest: path.join(skillDir, '.install-manifest.json'),
    hookScript: path.join(skillDir, 'hook', 'daily-update.mjs'),
    dataDir: data,
    state: path.join(data, 'state.json'), // written only by the hook, under its lock
    offer: path.join(data, 'offer.json'), // written only when the hook is offered, declined or turned on
    cacheDir: path.join(data, 'cache'),
    summary: path.join(data, 'cache', 'summary.md'),
    lock: path.join(data, 'cache', 'update.lock'),
  };
}

// Our hook entry is recognised by its script path ending in one of these (the
// second is the old install location, so turning the hook on moves it over).
export const HOOK_MARKER = `${SKILL_NAME}/hook/daily-update.mjs`;
const HOOK_MARKERS = [HOOK_MARKER, `${LEGACY_SKILL_NAME}/hook/daily-update.mjs`];

// Local calendar date as YYYY-MM-DD ("today" means the user's today).
export function localDate(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

export function readJson(file, fallback) {
  try {
    const v = JSON.parse(fs.readFileSync(file, 'utf8'));
    return v && typeof v === 'object' && !Array.isArray(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

function realOrSelf(file) {
  try { return fs.realpathSync(file); } catch { return file; }
}

// Write via a temporary file and a rename, so readers never see half a file.
// If the file is a symlink, the file it points to is updated (the link stays).
// Keeps the old file's permissions. Windows can briefly refuse the rename
// while another program has the file open, so retry for about two seconds.
export function writeFileAtomic(file, text) {
  const target = realOrSelf(file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  let mode;
  try { mode = fs.statSync(target).mode & 0o777; } catch { /* new file */ }
  const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, text, mode === undefined ? {} : { mode });
  if (mode !== undefined) { try { fs.chmodSync(tmp, mode); } catch { /* best effort */ } }
  for (let attempt = 0, wait = 25; ; attempt++, wait = Math.min(wait * 2, 500)) {
    try {
      fs.renameSync(tmp, target);
      return;
    } catch (err) {
      if (attempt >= 8 || !['EPERM', 'EACCES', 'EBUSY'].includes(err.code)) {
        try { fs.unlinkSync(tmp); } catch { /* already gone */ }
        throw err;
      }
      sleepSync(wait);
    }
  }
}

export function writeJson(file, value) {
  writeFileAtomic(file, JSON.stringify(value, null, 2) + '\n');
}

// ---------- the one-time hook offer ----------

export function offerMadeAt() {
  return readJson(paths().offer, {}).offeredAt || null;
}

export function markOfferMade() {
  if (!offerMadeAt()) writeJson(paths().offer, { offeredAt: new Date().toISOString() });
}

// ---------- settings.json: the hook entry ----------

// Exec form: Claude Code starts node directly with the script path as its
// argument. No shell is involved, so the path never needs quoting and it
// behaves the same on Windows, macOS and Linux. Needs Claude Code 2.1.139+.
export function hookHandler(scriptPath = paths().hookScript) {
  return { type: 'command', command: 'node', args: [scriptPath.replace(/\\/g, '/')], async: true, timeout: 30 };
}

const norm = (s) => String(s).replace(/\\/g, '/').replace(/^['"]+|['"]+$/g, '').trim();
// The marker must be the whole path or follow a "/", so "my-lore-lookup/…" isn't ours.
const endsWithMarker = (s) => HOOK_MARKERS.some((m) => s === m || s.endsWith(`/${m}`));

// A hook handler is ours if its script path (in args, or at the end of the
// command for older shell-form entries) ends in our marker.
export function isOurs(h) {
  if (!h || typeof h !== 'object') return false;
  if (Array.isArray(h.args) && h.args.length && endsWithMarker(norm(h.args[h.args.length - 1]))) return true;
  return typeof h.command === 'string' && /^node\s/.test(h.command.trim()) && endsWithMarker(norm(h.command.trim().slice(4)));
}

function groupsOf(settings) {
  const hooks = settings && settings.hooks;
  if (!hooks || typeof hooks !== 'object' || Array.isArray(hooks)) return [];
  return Object.entries(hooks).filter(([, groups]) => Array.isArray(groups));
}

export function hasOurHook(settings) {
  return groupsOf(settings).some(([, groups]) =>
    groups.some((g) => g && Array.isArray(g.hooks) && g.hooks.some(isOurs)));
}

// Remove our handlers. Only groups and events that our removal left empty are
// dropped; anything that was already empty is left alone.
export function withoutOurHook(settings) {
  if (!hasOurHook(settings)) return settings;
  const out = structuredClone(settings);
  for (const [event, groups] of groupsOf(out)) {
    let touched = false;
    const kept = [];
    for (const g of groups) {
      if (!g || !Array.isArray(g.hooks) || !g.hooks.some(isOurs)) { kept.push(g); continue; }
      touched = true;
      const rest = g.hooks.filter((h) => !isOurs(h));
      if (rest.length) kept.push({ ...g, hooks: rest });
    }
    if (!touched) continue;
    if (kept.length) out.hooks[event] = kept;
    else delete out.hooks[event];
  }
  if (Object.keys(out.hooks).length === 0) delete out.hooks;
  return out;
}

// Add our handler, or bring an existing one up to date where it is.
export function withOurHook(settings, scriptPath) {
  const want = hookHandler(scriptPath);
  if (!hasOurHook(settings)) {
    const out = structuredClone(settings);
    out.hooks = out.hooks || {};
    out.hooks.SessionStart = [...(out.hooks.SessionStart || []), { matcher: 'startup', hooks: [want] }];
    return out;
  }
  // Already there and exactly right: nothing to do.
  const ours = groupsOf(settings).flatMap(([, groups]) =>
    groups.flatMap((g) => (g && Array.isArray(g.hooks) ? g.hooks.filter(isOurs) : [])));
  if (ours.length === 1 && JSON.stringify(ours[0]) === JSON.stringify(want)) return settings;
  // Otherwise replace the first of ours in place and drop any duplicates.
  const out = structuredClone(settings);
  let placed = false;
  for (const [event, groups] of groupsOf(out)) {
    out.hooks[event] = groups.map((g) => {
      if (!g || !Array.isArray(g.hooks) || !g.hooks.some(isOurs)) return g;
      const hooks = g.hooks.flatMap((h) => {
        if (!isOurs(h)) return [h];
        if (placed) return [];
        placed = true;
        return [want];
      });
      return { ...g, hooks };
    }).filter((g) => !g || !Array.isArray(g.hooks) || g.hooks.length);
  }
  return out;
}

function stamp(d = new Date()) {
  return localDate(d).replace(/-/g, '') + '-' + d.toTimeString().slice(0, 8).replace(/:/g, '');
}

// Read settings.json strictly. A missing file counts as empty settings; a file
// we can't parse is an error, and nothing gets written. Error messages never
// quote the file, because it can hold secrets (such as API keys under "env").
export function loadSettings(file = paths().settings) {
  let text = null;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if (err.code !== 'ENOENT') throw new Error(`Can't read ${file} (${err.code}). Nothing was changed.`);
  }
  if (text === null || text.trim() === '') return { text, data: {} };
  let data;
  try {
    data = JSON.parse(text.replace(/^﻿/, ''));
  } catch {
    throw new Error(`${file} isn't valid JSON, so Claude Lore left it alone. Fix it (or turn the hook on or off by hand) and try again.`);
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(`${file} doesn't contain a JSON object. Nothing was changed.`);
  }
  if (data.hooks !== undefined && (typeof data.hooks !== 'object' || data.hooks === null || Array.isArray(data.hooks))) {
    throw new Error(`"hooks" in ${file} isn't an object. Nothing was changed.`);
  }
  return { text, data };
}

const BACKUP_PREFIX = 'settings.json.claude-lore-backup-';
const KEEP_BACKUPS = 3;

export function listBackups(dir = path.dirname(paths().settings)) {
  try {
    return fs.readdirSync(dir).filter((f) => f.startsWith(BACKUP_PREFIX)).sort();
  } catch {
    return [];
  }
}

function writeBackup(file, text) {
  const base = `${path.dirname(file)}/${BACKUP_PREFIX}${stamp()}`;
  for (let n = 1; ; n++) {
    const name = n === 1 ? base : `${base}-${n}`;
    try {
      fs.writeFileSync(name, text, { flag: 'wx', mode: 0o600 });
      return path.normalize(name);
    } catch (err) {
      if (err.code !== 'EEXIST' || n > 50) throw err;
    }
  }
}

function pruneBackups(dir) {
  const all = listBackups(dir);
  for (const f of all.slice(0, Math.max(0, all.length - KEEP_BACKUPS))) {
    try { fs.unlinkSync(path.join(dir, f)); } catch { /* leave it */ }
  }
}

// Apply change(data) to settings.json, keeping the file's indentation and line
// endings. If change() returns the same object, nothing is written. Otherwise
// a timestamped backup is saved next to settings.json first (the newest three
// are kept). Returns { changed, backup }.
export function editSettings(change, file = paths().settings) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { text, data } = loadSettings(file);
    const next = change(data);
    if (next === data) return { changed: false, backup: null };
    const eol = text && text.includes('\r\n') ? '\r\n' : '\n';
    const indentMatch = text && text.match(/^([ \t]+)"/m);
    const indent = indentMatch ? indentMatch[1] : 2;
    const out = JSON.stringify(next, null, indent).replace(/\n/g, eol) + eol;
    const backup = text !== null ? writeBackup(file, text) : null;
    // If something else saved settings.json while we were working, start again.
    let now = null;
    try { now = fs.readFileSync(file, 'utf8'); } catch { /* still missing */ }
    if (now !== text) {
      if (backup) { try { fs.unlinkSync(backup); } catch { /* leave it */ } }
      continue;
    }
    try {
      writeFileAtomic(file, out);
    } catch (err) {
      if (backup) { try { fs.unlinkSync(backup); } catch { /* leave it */ } }
      throw new Error(`Couldn't save ${file} (${err.code || err.message}). Nothing was changed; try again.`);
    }
    pruneBackups(path.dirname(file));
    return { changed: true, backup };
  }
  throw new Error(`${file} kept changing while Claude Lore was editing it. Nothing was changed; try again.`);
}
