# Claude Lore

A Claude Code skill and an optional SessionStart hook that keep Claude's answers about Claude, Claude Code and the Claude apps tied to Anthropic's official sources.

- `skills/lore-lookup/SKILL.md` and `README.md` must describe the same behaviour. Whenever you edit one (or code that changes behaviour), check the other and update it in the same change. CONTRIBUTING.md has the checklist.
- Plain Node 18+, built-in modules only. Run `node --test` after changes.
- Test against a throwaway folder by setting `CLAUDE_CONFIG_DIR`. Never run `hook-on`, `hook-off` or `install.mjs` against the real `~/.claude` unless asked.
- The hook must print nothing, always exit 0, and fetch at most once a day.
