#!/usr/bin/env node
// Claude Lore daily update, run by an optional SessionStart hook.
//
// At most once a day it downloads the newest entries from Anthropic's public
// release notes and writes a short summary to
// ~/.claude/claude-lore-data/cache/summary.md for the claude-lore skill to
// read. It prints nothing (so it adds nothing to the session's context),
// always exits 0, and stops itself after 15 seconds. The work is done in
// ../scripts/update.mjs.

const HARD_LIMIT_MS = 15_000;
setTimeout(() => process.exit(0), HARD_LIMIT_MS).unref();

import('../scripts/update.mjs')
  .then((m) => m.run())
  .catch(() => {})
  .finally(() => process.exit(0));
