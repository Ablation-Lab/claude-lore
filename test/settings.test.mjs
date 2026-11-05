// Tests for turning the hook on and off, the status command and the
// installer, all inside a throwaway Claude folder. Run with: node --test
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-lore-test-'));
process.env.CLAUDE_CONFIG_DIR = tmp;

const common = await import('../skills/lore-lookup/scripts/common.mjs');
const lore = await import('../skills/lore-lookup/scripts/lore.mjs');
const settingsFile = path.join(tmp, 'settings.json');
const skillDir = path.join(tmp, 'skills', 'lore-lookup');

const OTHER_HOOK = { matcher: 'startup', hooks: [{ type: 'command', command: 'echo sample-other-hook' }] };
const ORIGINAL = { model: 'sample-model', hooks: { SessionStart: [OTHER_HOOK], Stop: [OTHER_HOOK] } };

const read = () => JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
const backups = () => fs.readdirSync(tmp).filter((f) => f.includes('claude-lore-backup'));
const install = (...args) => spawnSync(process.execPath, [path.join(repo, 'install.mjs'), ...args],
  { env: { ...process.env, CLAUDE_CONFIG_DIR: tmp }, encoding: 'utf8' });

beforeEach(() => {
  for (const f of fs.readdirSync(tmp)) fs.rmSync(path.join(tmp, f), { recursive: true, force: true });
});

test('hook-on adds one async startup hook in exec form and keeps everything else', () => {
  fs.writeFileSync(settingsFile, JSON.stringify(ORIGINAL, null, 2));
  lore.hookOn();
  const s = read();
  assert.equal(s.model, 'sample-model');
  assert.deepEqual(s.hooks.Stop, [OTHER_HOOK]);
  assert.deepEqual(s.hooks.SessionStart[0], OTHER_HOOK);
  const ours = s.hooks.SessionStart[1];
  assert.equal(ours.matcher, 'startup');
  assert.equal(ours.hooks[0].command, 'node');
  assert.equal(ours.hooks[0].async, true);
  assert.match(ours.hooks[0].args[0], /lore-lookup\/hook\/daily-update\.mjs$/);
  assert.doesNotMatch(ours.hooks[0].args[0], /\\/);
  assert.equal(backups().length, 1);
});

test('hook-on when already on changes nothing, even if ours is not last', () => {
  fs.writeFileSync(settingsFile, JSON.stringify(ORIGINAL, null, 2));
  lore.hookOn();
  const s = read();
  s.hooks.SessionStart.push(OTHER_HOOK);
  fs.writeFileSync(settingsFile, JSON.stringify(s, null, 2));
  const before = fs.readFileSync(settingsFile, 'utf8');
  assert.match(lore.hookOn(), /already on/);
  assert.equal(fs.readFileSync(settingsFile, 'utf8'), before);
});

test('an old shell-form entry is updated in place', () => {
  const old = { matcher: 'startup', hooks: [{ type: 'command', command: "node '/x/.claude/skills/claude-lore/hook/daily-update.mjs'" }] };
  fs.writeFileSync(settingsFile, JSON.stringify({ hooks: { SessionStart: [old, OTHER_HOOK] } }));
  lore.hookOn();
  const s = read();
  assert.equal(s.hooks.SessionStart.length, 2);
  assert.equal(s.hooks.SessionStart[0].hooks[0].command, 'node');
  assert.deepEqual(s.hooks.SessionStart[1], OTHER_HOOK);
});

test('hook-off removes only ours and restores the original content', () => {
  fs.writeFileSync(settingsFile, JSON.stringify(ORIGINAL, null, 2));
  lore.hookOn();
  lore.hookOff();
  assert.deepEqual(read(), ORIGINAL);
  assert.match(lore.hookOff(), /was not on/);
});

test('hook-off with no hook of ours leaves the file byte for byte, with no backup', () => {
  const text = '{\n    "hooks": {\n        "Stop": []\n    }\n}\n';
  fs.writeFileSync(settingsFile, text);
  assert.match(lore.hookOff(), /was not on/);
  assert.equal(fs.readFileSync(settingsFile, 'utf8'), text);
  assert.equal(backups().length, 0);
});

test('hook-on keeps the file\'s indentation and leaves empty sections it didn\'t touch', () => {
  fs.writeFileSync(settingsFile, '{\n    "hooks": {\n        "Stop": []\n    }\n}\n');
  lore.hookOn();
  const text = fs.readFileSync(settingsFile, 'utf8');
  assert.match(text, /^ {4}"hooks"/m);
  lore.hookOff();
  assert.deepEqual(read(), { hooks: { Stop: [] } });
});

test('a missing settings.json is created, with no backup', () => {
  lore.hookOn();
  assert.ok(common.hasOurHook(read()));
  assert.equal(backups().length, 0);
});

test('only the newest three backups are kept', () => {
  fs.writeFileSync(settingsFile, '{}');
  for (let i = 0; i < 5; i++) { lore.hookOn(); lore.hookOff(); }
  assert.equal(backups().length, 3);
});

test('invalid JSON: refuses, leaves the file untouched and never quotes it', () => {
  const text = '{ "env": { "API_KEY": sample-secret-value } }';
  fs.writeFileSync(settingsFile, text);
  assert.throws(() => lore.hookOn(), (err) => /isn't valid JSON/.test(err.message) && !/sample-secret/.test(err.message));
  assert.equal(fs.readFileSync(settingsFile, 'utf8'), text);
  assert.equal(backups().length, 0);
});

test('a "hooks" value that is not an object: refuses', () => {
  fs.writeFileSync(settingsFile, '{"hooks": []}');
  assert.throws(() => lore.hookOn(), /isn't an object/);
});

test('Windows line endings and a byte-order mark are handled', () => {
  fs.writeFileSync(settingsFile, '\uFEFF{\r\n  "model": "sample-model"\r\n}\r\n');
  lore.hookOn();
  const text = fs.readFileSync(settingsFile, 'utf8');
  assert.ok(text.includes('\r\n'));
  assert.doesNotMatch(text.replace(/\r\n/g, ''), /\n/);
});

test('recognises our entries by path only, not a user command that mentions it', () => {
  assert.ok(common.isOurs({ command: 'node', args: ['C:\\x\\claude-lore\\hook\\daily-update.mjs'] }));
  assert.ok(common.isOurs({ command: 'node "C:\\x\\claude-lore\\hook\\daily-update.mjs"' }));
  assert.ok(!common.isOurs({ command: 'bash -c "node ~/x/claude-lore/hook/daily-update.mjs && my-thing"' }));
});

test('settings.json behind a symlink: the target is updated and the link kept', (t) => {
  const real = path.join(tmp, 'dotfiles-settings.json');
  fs.writeFileSync(real, JSON.stringify({ model: 'sample-model' }));
  try { fs.symlinkSync(real, settingsFile, 'file'); } catch { t.skip('this system does not allow file symlinks'); return; }
  lore.hookOn();
  assert.ok(fs.lstatSync(settingsFile).isSymbolicLink());
  assert.ok(common.hasOurHook(JSON.parse(fs.readFileSync(real, 'utf8'))));
});

test('status and summary never print settings', () => {
  fs.writeFileSync(settingsFile, JSON.stringify({ env: { SAMPLE_SECRET: 'do-not-print' } }));
  let out = lore.status();
  assert.match(out, /cache: none/);
  assert.match(out, /daily hook: not installed/);
  assert.match(out, /hook offer: not made yet/);
  assert.match(lore.summary(), /No summary from today/);
  lore.offerMade();
  lore.hookOn();
  out = lore.status();
  assert.match(out, /daily hook: installed/);
  assert.match(out, /already made on \d{4}-\d\d-\d\d/);
  assert.doesNotMatch(out, /do-not-print/);
});

test('status with unreadable settings says unknown instead of failing', () => {
  fs.writeFileSync(settingsFile, 'not json');
  assert.match(lore.status(), /daily hook: unknown/);
});

test('installer: install with hook, update prunes old files, uninstall removes only its own', () => {
  fs.writeFileSync(settingsFile, JSON.stringify(ORIGINAL, null, 2));
  let r = install('--hook');
  assert.equal(r.status, 0, r.stderr);
  assert.ok(fs.existsSync(path.join(skillDir, 'SKILL.md')));
  assert.ok(common.hasOurHook(read()));
  const scriptPath = read().hooks.SessionStart[1].hooks[0].args[0];
  assert.ok(fs.existsSync(scriptPath), scriptPath);

  // A file from an "older version" (in the manifest) is pruned; a user's own file is kept.
  const manifest = JSON.parse(fs.readFileSync(path.join(skillDir, '.install-manifest.json'), 'utf8'));
  fs.writeFileSync(path.join(skillDir, 'old-file.md'), 'x');
  fs.writeFileSync(path.join(skillDir, 'my-notes.md'), 'x');
  fs.writeFileSync(path.join(skillDir, '.install-manifest.json'), JSON.stringify({ files: [...manifest.files, 'old-file.md'] }));
  r = install('--no-hook');
  assert.equal(r.status, 0, r.stderr);
  assert.ok(!fs.existsSync(path.join(skillDir, 'old-file.md')));
  assert.ok(fs.existsSync(path.join(skillDir, 'my-notes.md')));
  assert.match(r.stdout, /still on from before/);

  r = install('--uninstall');
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(read(), ORIGINAL);
  assert.ok(fs.existsSync(path.join(skillDir, 'my-notes.md')), "the user's own file is kept");
  assert.ok(!fs.existsSync(path.join(skillDir, 'SKILL.md')));
  assert.ok(!fs.existsSync(path.join(tmp, 'claude-lore-data')));
  assert.match(r.stdout, /Backups of settings\.json/);

  assert.equal(install('--bogus').status, 2);
  assert.equal(install('--hook', '--no-hook').status, 2);
});

test('installer refuses to install over a clone of the repo inside the skills folder', () => {
  const fakeClone = path.join(tmp, 'skills', 'lore-lookup');
  fs.mkdirSync(fakeClone, { recursive: true });
  fs.cpSync(repo, fakeClone, { recursive: true, filter: (s) => !/[\\/](\.git|node_modules)([\\/]|$)/.test(s) });
  fs.writeFileSync(path.join(fakeClone, 'precious.txt'), 'x');
  const r = spawnSync(process.execPath, [path.join(fakeClone, 'install.mjs'), '--no-hook'],
    { env: { ...process.env, CLAUDE_CONFIG_DIR: tmp }, encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /inside the install folder/);
  assert.ok(fs.existsSync(path.join(fakeClone, 'precious.txt')));
  assert.ok(fs.existsSync(path.join(fakeClone, 'install.mjs')));
});

test('installer refuses to write through a link inside the install folder', (t) => {
  const outside = path.join(tmp, 'outside');
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside, 'precious.txt'), 'x');
  fs.mkdirSync(skillDir, { recursive: true });
  try { fs.symlinkSync(outside, path.join(skillDir, 'hook'), 'junction'); } catch { t.skip('cannot create a link here'); return; }
  const r = install('--no-hook');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /is a link/);
  assert.deepEqual(fs.readdirSync(outside), ['precious.txt']);
});

test('uninstall leaves a folder with no manifest alone', () => {
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), 'hand-copied');
  const r = install('--uninstall');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /no install manifest/);
  assert.ok(fs.existsSync(path.join(skillDir, 'SKILL.md')));
});

test('installer without a terminal does not turn the hook on or record a "no"', () => {
  const r = install();
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Daily hook left off/);
  assert.ok(!fs.existsSync(settingsFile));
  assert.equal(common.offerMadeAt(), null);
});

test('installer skips the question when the hook was declined before', () => {
  install('--no-hook');
  const r = install();
  assert.match(r.stdout, /Daily hook is off\. Turn it on with/);
});

test('a fork installed under another name is not mistaken for ours', () => {
  assert.ok(!common.isOurs({ command: 'node', args: ['/x/skills/my-claude-lore/hook/daily-update.mjs'] }));
  assert.ok(common.isOurs({ command: 'node', args: ['/x/skills/claude-lore/hook/daily-update.mjs'] }));
});

test('uninstall never deletes through a linked cache folder', (t) => {
  const outside = path.join(tmp, 'outside');
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside, 'state.json'), 'x');
  fs.writeFileSync(path.join(outside, 'notes.tmp'), 'x');
  fs.mkdirSync(path.join(tmp, 'claude-lore-data'), { recursive: true });
  try { fs.symlinkSync(outside, path.join(tmp, 'claude-lore-data', 'cache'), 'junction'); } catch { t.skip('cannot create a link here'); return; }
  const r = install('--uninstall');
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(fs.readdirSync(outside).sort(), ['notes.tmp', 'state.json']);
});

test('the new name is recognised, and look-alike folders are not', () => {
  assert.ok(common.isOurs({ command: 'node', args: ['/x/skills/lore-lookup/hook/daily-update.mjs'] }));
  assert.ok(!common.isOurs({ command: 'node', args: ['/x/skills/my-lore-lookup/hook/daily-update.mjs'] }));
});

test('an install from before the rename (claude-lore) is moved over, hook included', () => {
  const legacy = path.join(tmp, 'skills', 'claude-lore');
  fs.mkdirSync(path.join(legacy, 'hook'), { recursive: true });
  fs.writeFileSync(path.join(legacy, 'SKILL.md'), 'old');
  fs.writeFileSync(path.join(legacy, 'hook', 'daily-update.mjs'), 'old');
  fs.writeFileSync(path.join(legacy, '.install-manifest.json'), JSON.stringify({ files: ['SKILL.md', 'hook/daily-update.mjs'] }));
  const oldEntry = { matcher: 'startup', hooks: [{ type: 'command', command: 'node', args: [path.join(legacy, 'hook', 'daily-update.mjs').split(path.sep).join('/')], async: true, timeout: 30 }] };
  fs.writeFileSync(settingsFile, JSON.stringify({ model: 'sample-model', hooks: { SessionStart: [OTHER_HOOK, oldEntry] } }, null, 2));
  const r = install();
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Moved the daily hook/);
  assert.ok(!fs.existsSync(legacy), 'old copy removed');
  const s = read();
  assert.equal(s.hooks.SessionStart.length, 2);
  assert.deepEqual(s.hooks.SessionStart[0], OTHER_HOOK);
  assert.match(s.hooks.SessionStart[1].hooks[0].args[0], /\/skills\/lore-lookup\/hook\/daily-update\.mjs$/);
  assert.ok(fs.existsSync(s.hooks.SessionStart[1].hooks[0].args[0]));
});

function makeLegacyInstall() {
  const legacy = path.join(tmp, 'skills', 'claude-lore');
  fs.mkdirSync(path.join(legacy, 'hook'), { recursive: true });
  fs.writeFileSync(path.join(legacy, 'SKILL.md'), 'old');
  fs.writeFileSync(path.join(legacy, 'hook', 'daily-update.mjs'), 'old');
  fs.writeFileSync(path.join(legacy, '.install-manifest.json'), JSON.stringify({ files: ['SKILL.md', 'hook/daily-update.mjs'] }));
  const args = [path.join(legacy, 'hook', 'daily-update.mjs').split(path.sep).join('/')];
  return { legacy, entry: { matcher: 'startup', hooks: [{ type: 'command', command: 'node', args, async: true, timeout: 30 }] } };
}

test('old copy is kept when settings.json cannot be read', () => {
  const { legacy } = makeLegacyInstall();
  fs.writeFileSync(settingsFile, '{ "hooks": { "SessionStart": [] }, }');
  const r = install();
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Kept the old "claude-lore" copy/);
  assert.ok(fs.existsSync(path.join(legacy, 'hook', 'daily-update.mjs')));
});

test('--hook never removes the old copy if the hook cannot be moved', (t) => {
  const { legacy, entry } = makeLegacyInstall();
  fs.writeFileSync(settingsFile, JSON.stringify({ hooks: { SessionStart: [entry] } }, null, 2));
  fs.chmodSync(settingsFile, 0o444);
  try {
    const r = install('--hook');
    if (r.status === 0) { t.skip('this system lets read-only files be replaced'); return; }
    assert.ok(fs.existsSync(path.join(legacy, 'hook', 'daily-update.mjs')), 'old copy must survive');
    assert.match(read().hooks.SessionStart[0].hooks[0].args[0], /claude-lore\/hook/);
  } finally {
    fs.chmodSync(settingsFile, 0o644);
  }
});

test('--hook with an old install moves the hook and removes the old copy', () => {
  const { legacy, entry } = makeLegacyInstall();
  fs.writeFileSync(settingsFile, JSON.stringify({ hooks: { SessionStart: [entry] } }, null, 2));
  const r = install('--hook');
  assert.equal(r.status, 0, r.stderr);
  assert.ok(!fs.existsSync(legacy));
  const s = read();
  assert.equal(s.hooks.SessionStart.length, 1);
  assert.match(s.hooks.SessionStart[0].hooks[0].args[0], /\/lore-lookup\/hook\//);
});
