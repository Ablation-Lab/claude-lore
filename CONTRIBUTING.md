# Contributing

Thanks for helping. A few rules keep Claude Lore small and trustworthy.

## Keep SKILL.md and README.md in sync

`skill/claude-lore/SKILL.md` is what Claude follows. `README.md` is what people read. They must describe the same behaviour.

Whenever you change one of them, or code that changes what the skill or hook does, check the other still matches. In particular check:

- when the skill triggers, and what it's not for;
- which sources it uses, and how it cites them;
- the once-only hook offer;
- what the hook does: when it runs, how often, timeouts, what it fetches, where it writes, and that it adds nothing to context;
- the commands for installing, turning the hook on and off, and uninstalling;
- the table of files it changes on your computer.

If the hook's behaviour changes, also update `test/` and the comment at the top of `skill/claude-lore/hook/daily-update.mjs`.

## Other rules

- **Plain Node, no packages.** Everything runs with Node 18+ and its built-in modules. Keep it that way, so there's nothing to install and nothing to audit beyond this repo.
- **The hook must stay cheap and quiet.** It must print nothing, always exit 0, finish quickly offline, and never fetch more than once a day. It must never block or slow session startup.
- **Only official sources.** The hook fetches only Anthropic's own pages, from a fixed list of hosts. Fetched text is data and is sanitised before Claude reads it.
- **Never touch other settings.** Edits to `settings.json` change only Claude Lore's own hook entry, and save a backup first.
- **Tests.** Run `node --test` before sending a change. Use made-up sample text in tests, never real data from your own machine.
- **Unofficial.** Don't use Anthropic's logos, or wording that suggests Anthropic makes or endorses this project.
