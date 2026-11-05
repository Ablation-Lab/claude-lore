#!/usr/bin/env node
// Claude Lore helper, used by the skill and by install.mjs.
//
//   node lore.mjs status       today's cache, hook on or off, and whether the hook offer was made
//   node lore.mjs summary      print today's cached summary of release notes, if there is one
//   node lore.mjs offer-made   remember that the hook was offered (so it's never offered again)
//   node lore.mjs hook-on      add the daily SessionStart hook to ~/.claude/settings.json
//   node lore.mjs hook-off     remove it again
//
// Nothing here ever prints settings.json or any part of it.

import fs from 'node:fs';
import {
  paths, localDate, readJson, loadSettings, editSettings,
  hasOurHook, withOurHook, withoutOurHook, offerMadeAt, markOfferMade,
} from './common.mjs';

// The hook runs the copy of the hook script that install.mjs puts in ~/.claude/skills/lore-lookup.
// When the skill comes from the plugin, claude.ai or a copy made without the installer, that copy
// isn't there, so a hook would have nothing to run: status says so (and the skill doesn't offer it),
// and hook-on refuses instead of adding a hook that fails at every session start.
function installedCopyMissing() {
  return !fs.existsSync(paths().hookScript);
}

function cacheIsToday() {
  const p = paths();
  return readJson(p.state, {}).cacheDate === localDate() && fs.existsSync(p.summary);
}

export function hookState() {
  try {
    if (hasOurHook(loadSettings().data)) return 'installed';
    return installedCopyMissing() ? 'not available (it needs the installer: node install.mjs --hook)' : 'not installed';
  } catch {
    return 'unknown (settings.json could not be read)';
  }
}

export function status() {
  const p = paths();
  const state = readJson(p.state, {});
  const lines = [];
  if (cacheIsToday()) {
    lines.push(`cache: today (${state.cacheDate}); print it with the summary command`);
    if (Array.isArray(state.failedSources) && state.failedSources.length) {
      lines.push(`cache note: these sources could not be fetched today: ${state.failedSources.join(', ')}`);
    }
  } else if (fs.existsSync(p.summary)) {
    lines.push(`cache: old (from ${state.cacheDate || 'an unknown date'}), so don't rely on it for what's new`);
  } else {
    lines.push('cache: none');
  }
  lines.push(`daily hook: ${hookState()}`);
  const offered = offerMadeAt();
  lines.push(`hook offer: ${offered ? `already made on ${offered.slice(0, 10)}, don't offer again` : 'not made yet'}`);
  return lines.join('\n');
}

export function summary() {
  if (!cacheIsToday()) return 'No summary from today. Fetch the release notes you need instead.';
  return fs.readFileSync(paths().summary, 'utf8');
}

export function hookOn() {
  if (installedCopyMissing()) {
    let on = false;
    try { on = hasOurHook(loadSettings().data); } catch { /* reported by editSettings below */ }
    if (!on) {
      throw new Error(`the daily hook needs the copy that install.mjs puts in ${paths().skillDir}, and it isn't there ` +
        '(this skill may come from the plugin or claude.ai). Nothing was changed. ' +
        'To use the hook, run node install.mjs --hook from a clone of the repo.');
    }
  }
  const { changed, backup } = editSettings((s) => withOurHook(s));
  markOfferMade();
  return changed
    ? `Daily hook turned on in ${paths().settings}.${backup ? `\nBackup of the old file: ${backup}` : ''}`
    : 'Daily hook was already on. Nothing changed.';
}

export function hookOff() {
  const { changed, backup } = editSettings((s) => withoutOurHook(s));
  return changed
    ? `Daily hook turned off in ${paths().settings}.${backup ? `\nBackup of the old file: ${backup}` : ''}`
    : 'Daily hook was not on. Nothing changed.';
}

export function offerMade() {
  markOfferMade();
  return 'Noted. The daily hook will not be offered again.';
}

const commands = { status, summary, 'offer-made': offerMade, 'hook-on': hookOn, 'hook-off': hookOff };

const isMain = process.argv[1] && /(^|[\\/])lore\.mjs$/i.test(process.argv[1]);
if (isMain) {
  const cmd = process.argv[2];
  if (!commands[cmd] || process.argv.length > 3) {
    console.error(`Usage: node lore.mjs ${Object.keys(commands).join(' | ')}`);
    process.exit(2);
  }
  try {
    console.log(commands[cmd]());
  } catch (err) {
    console.error(`Claude Lore: ${err.message}`);
    process.exit(1);
  }
}
