#!/usr/bin/env node
// Claude Lore installer. Needs Node 18 or later; uses no packages.
//
//   node install.mjs              install or update the skill, then ask about the daily hook
//   node install.mjs --hook       install or update, and turn the daily hook on
//   node install.mjs --no-hook    install or update without adding the hook (and don't offer it later)
//   node install.mjs --hook-off   turn the daily hook off, keep the skill
//   node install.mjs --uninstall  remove the skill, the hook and the cached summary
//
// Everything goes in your user-level Claude folder (~/.claude, or
// CLAUDE_CONFIG_DIR if you set it), so the skill works in every project.
//
// Safety: the installer only ever deletes files it installed itself (listed in
// .install-manifest.json) or its own cache files, never follows links out of
// its folders, and refuses to run if the repo is inside the install folder.

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const major = Number(process.versions.node.split('.')[0]);
if (major < 18) {
  console.error(`Claude Lore needs Node 18 or later (this is ${process.version}).`);
  process.exit(1);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const source = path.join(here, 'skill', 'claude-lore');
const { paths, readJson, loadSettings, hasOurHook, offerMadeAt, markOfferMade, listBackups } =
  await import('./skill/claude-lore/scripts/common.mjs');
const lore = await import('./skill/claude-lore/scripts/lore.mjs');

const OPTIONS = ['--hook', '--no-hook', '--hook-off', '--uninstall'];
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log(`Usage: node install.mjs [${OPTIONS.join(' | ')}]`);
  process.exit(0);
}
if (args.length > 1 || (args.length === 1 && !OPTIONS.includes(args[0]))) {
  console.error(`Unknown or extra option: ${args.join(' ')}`);
  console.error(`Usage: node install.mjs [${OPTIONS.join(' | ')}]`);
  process.exit(2);
}
const opt = args[0];
const p = paths();

const real = (f) => { try { return fs.realpathSync(f); } catch { return path.resolve(f); } };
const inside = (child, parent) => {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
};
const isLink = (f) => { try { return fs.lstatSync(f).isSymbolicLink(); } catch { return false; } };

// Relative paths (with /) of every file in the repo's skill folder.
function sourceFiles(dir = source, rel = '') {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...sourceFiles(path.join(dir, e.name), r));
    else if (e.isFile()) out.push(r);
  }
  return out;
}

// Delete one installed file, only if it's a plain file and neither root nor
// any folder between root and the file is a link (so nothing outside is reached).
function removeOwnFile(root, rel) {
  const parts = rel.split('/');
  let dir = root;
  for (const part of [null, ...parts.slice(0, -1)]) {
    if (part !== null) dir = path.join(dir, part);
    if (isLink(dir)) return;
  }
  const f = path.join(root, ...parts);
  let st;
  try { st = fs.lstatSync(f); } catch { return; }
  if (!st.isFile() || !inside(path.resolve(f), path.resolve(root))) return;
  fs.unlinkSync(f);
}

// Remove empty folders under root (deepest first), then root if empty.
function removeEmptyDirs(root) {
  const walk = (dir) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) if (e.isDirectory()) walk(path.join(dir, e.name));
    try { if (fs.readdirSync(dir).length === 0) fs.rmdirSync(dir); } catch { /* leave it */ }
  };
  if (fs.existsSync(root) && !isLink(root)) walk(root);
}

function checkSafeToInstall() {
  if (!fs.existsSync(path.join(source, 'SKILL.md'))) throw new Error(`Can't find the skill at ${source}`);
  const src = real(source);
  const dst = real(p.skillDir);
  if (inside(src, dst) || inside(dst, src) || inside(real(here), dst)) {
    throw new Error(`The repo is inside the install folder ${p.skillDir}. Clone it somewhere else (for example your projects folder) and run the installer from there.`);
  }
  // Never write through links: the install folder and the folders in it must be real folders.
  for (const f of [p.skillDir, ...['hook', 'scripts'].map((d) => path.join(p.skillDir, d))]) {
    if (isLink(f)) throw new Error(`${f} is a link. Remove it, then run the installer again.`);
  }
}

function install() {
  checkSafeToInstall();
  const files = sourceFiles();
  const old = readJson(p.manifest, {}).files;
  for (const rel of files) {
    const to = path.join(p.skillDir, ...rel.split('/'));
    if (isLink(to)) throw new Error(`${to} is a link. Remove it, then run the installer again.`);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(path.join(source, ...rel.split('/')), to);
  }
  // Remove files an older version installed that this version no longer has.
  if (Array.isArray(old)) {
    for (const rel of old) if (typeof rel === 'string' && !files.includes(rel) && !rel.includes('..')) removeOwnFile(p.skillDir, rel);
  }
  if (isLink(p.manifest)) throw new Error(`${p.manifest} is a link. Remove it, then run the installer again.`);
  fs.writeFileSync(p.manifest, JSON.stringify({ files }, null, 2) + '\n');
}

function uninstallSkill() {
  if (!fs.existsSync(p.skillDir)) return 'The skill was not installed.';
  const files = readJson(p.manifest, {}).files;
  if (!Array.isArray(files)) {
    return `Left ${p.skillDir} alone: it has no install manifest, so it wasn't installed by this installer. Delete it by hand if you're sure.`;
  }
  for (const rel of files) if (typeof rel === 'string' && !rel.includes('..')) removeOwnFile(p.skillDir, rel);
  removeOwnFile(p.skillDir, '.install-manifest.json');
  removeEmptyDirs(p.skillDir);
  return fs.existsSync(p.skillDir)
    ? `Removed the skill's files. ${p.skillDir} still holds files Claude Lore didn't install, so it was kept.`
    : `Removed the skill: ${p.skillDir}`;
}

function uninstallData() {
  if (!fs.existsSync(p.dataDir)) return 'There was no cache to remove.';
  if (isLink(p.dataDir)) return `Left ${p.dataDir} alone because it is a link.`;
  for (const dir of [p.dataDir, p.cacheDir]) {
    let names = [];
    try { names = fs.readdirSync(dir); } catch { continue; }
    for (const n of names) {
      if (['state.json', 'offer.json', 'summary.md', 'update.lock'].includes(n) || n.endsWith('.tmp') || n.endsWith('.stale')) removeOwnFile(dir, n);
    }
  }
  removeEmptyDirs(p.dataDir);
  return fs.existsSync(p.dataDir)
    ? `Removed the cache files. ${p.dataDir} still holds other files, so it was kept.`
    : `Removed the cache and state: ${p.dataDir}`;
}

async function askYesNo(question) {
  if (!process.stdin.isTTY) return null; // not interactive: don't guess
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question(question)).trim().toLowerCase();
    return answer === 'y' || answer === 'yes';
  } finally {
    rl.close();
  }
}

function hookIsOn() {
  try { return hasOurHook(loadSettings().data); } catch { return false; }
}

try {
  if (opt === '--uninstall') {
    console.log(lore.hookOff()); // stops here (with nothing removed) if settings.json can't be read
    console.log(uninstallSkill());
    console.log(uninstallData());
    const backups = listBackups();
    if (backups.length) {
      console.log(`Backups of settings.json made by Claude Lore are still in ${path.dirname(p.settings)}. Delete them when you no longer need them:`);
      for (const b of backups) console.log(`  ${b}`);
    }
    process.exit(0);
  }

  if (opt === '--hook-off') {
    console.log(lore.hookOff());
    process.exit(0);
  }

  install();
  console.log(`Installed the claude-lore skill in ${p.skillDir}`);

  if (opt === '--hook') {
    console.log(lore.hookOn());
  } else if (hookIsOn()) {
    console.log(opt === '--no-hook'
      ? 'The daily hook is still on from before. Turn it off with: node install.mjs --hook-off'
      : 'The daily hook is on.');
  } else if (opt === '--no-hook') {
    markOfferMade(); // a clear "no" counts as the one-time offer, so the skill won't ask again
    console.log('Daily hook left off. Turn it on later with: node install.mjs --hook');
  } else if (offerMadeAt()) {
    console.log('Daily hook is off. Turn it on with: node install.mjs --hook');
  } else {
    const yes = await askYesNo(
      'Turn on the optional daily hook? Once a day, when a new Claude Code session starts, it fetches\n' +
      "Anthropic's release notes in the background and saves a short summary. [y/N] ");
    if (yes) {
      console.log(lore.hookOn());
    } else {
      if (yes === false) markOfferMade();
      console.log('Daily hook left off. Turn it on later with: node install.mjs --hook');
    }
  }
  console.log('Done. Ask Claude anything about Claude or Claude Code to use it.');
} catch (err) {
  console.error(`Claude Lore: ${err.message}`);
  process.exit(1);
}
