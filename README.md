# Claude Lore

Claude doesn't reliably know how its own apps work. Settings, plans and features change faster than the model is trained, so it can give out-of-date or made-up answers about itself. Claude Lore fixes that. Ask Claude anything about Claude or Claude Code, and it checks Anthropic's official docs and help pages for the answer. It can also add an optional hook that quietly checks for updates once a day, at the start of a session.

> **Unofficial.** Claude Lore is a community project from [Ablation Lab](https://github.com/Ablation-Lab). It isn't made, endorsed or supported by Anthropic. "Claude" and "Claude Code" are Anthropic's names for their products.

## What it does

**The skill (`claude-lore`).** Claude Code loads it whenever you ask how Claude, Claude Code or the Claude apps work: what a setting, command, hook, plan, usage limit or feature does, whether Claude can do something, or what's new. When it's loaded, Claude:

1. checks whether today's summary of release notes is cached, and reads it for "what's new" questions;
2. fetches only the official pages the question needs, from the Claude Code docs, the Claude Help Center, the Claude Platform docs and the release notes;
3. answers from those pages and links to each one, and says plainly when something can't be confirmed;
4. if the daily hook isn't on, mentions it **once** and offers to turn it on. It never asks again, whatever you answer.

The skill pre-approves only reading Anthropic's own sites (`code.claude.com`, `support.claude.com`, `platform.claude.com`, `docs.claude.com`, `claude.com` and `www.anthropic.com`), web search, and its `status`, `summary` and `offer-made` helper commands. Turning the hook on isn't pre-approved, so Claude Code asks you first (unless your own permission settings already allow it). Questions about writing code against the Claude API are left to Anthropic's own `claude-api` skill.

**The optional daily hook.** A SessionStart hook runs a small script when a new Claude Code session starts. At most once a day, it fetches the newest entries from three public pages:

- the [Claude Code changelog](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md)
- the [Claude apps release notes](https://support.claude.com/en/articles/12138966-release-notes)
- the [Claude Platform release notes](https://platform.claude.com/docs/en/release-notes/overview)

It saves a short summary (under 12,000 characters) to `~/.claude/claude-lore-data/cache/summary.md`. It:

- runs in the background, so it never delays startup;
- runs only for new sessions, not when you resume, `/clear` or compact;
- prints nothing, so it adds nothing to your sessions' context or usage. The skill reads the summary only when you ask about Claude;
- does nothing at all if it has already run today;
- if you're offline, gives up quickly and silently, and waits at least an hour before trying again. Each source times out after 6 seconds, and the whole run after 15;
- lets only one session fetch when several start at once;
- downloads only the first part of each page where the site allows it (newest entries come first).

The summary is a plain extract of the release notes, not AI-written. Angle brackets and invisible characters in it are replaced or removed, so that nothing in a fetched page can pose as an instruction to Claude.

## Requirements

- [Claude Code](https://code.claude.com/docs/en/overview) 2.1.139 or later (the hook uses the `args` form of command hooks)
- [Node.js](https://nodejs.org) 18 or later, for the installer, the hook and the skill's status check. Without Node, see [Install without Node](#install-without-node).

## Install

Clone the repo somewhere outside your `~/.claude` folder (the installer refuses to run from inside its install folder):

```sh
git clone https://github.com/Ablation-Lab/claude-lore.git
cd claude-lore
node install.mjs
```

The installer copies the skill to your user-level Claude folder (`~/.claude/skills/claude-lore`), so it works in every project. It then asks whether to turn on the daily hook. To answer in advance:

```sh
node install.mjs --hook       # install and turn the daily hook on
node install.mjs --no-hook    # install without adding the hook (the skill won't offer it later)
```

Run it again after `git pull` to update. It won't ask about the hook again once you've answered. If you've set `CLAUDE_CONFIG_DIR`, everything goes there instead of `~/.claude`.

### Install without Node

Copy the `skill/claude-lore` folder into your Claude skills folder:

```sh
# macOS, Linux, Git Bash
mkdir -p ~/.claude/skills && cp -R skill/claude-lore ~/.claude/skills/
```

```powershell
# Windows PowerShell
New-Item -ItemType Directory -Force "$HOME\.claude\skills" | Out-Null
Copy-Item -Recurse skill\claude-lore "$HOME\.claude\skills\"
```

The skill still checks official sources. Without Node it skips the status check and the hook offer.

## Turn the daily hook on or off

From the repo folder:

```sh
node install.mjs --hook       # on
node install.mjs --hook-off   # off (keeps the skill)
```

Or say yes when the skill offers it. You can also use the installed helper directly, from anywhere:

```sh
node ~/.claude/skills/claude-lore/scripts/lore.mjs hook-on
node ~/.claude/skills/claude-lore/scripts/lore.mjs hook-off
node ~/.claude/skills/claude-lore/scripts/lore.mjs status
node ~/.claude/skills/claude-lore/scripts/lore.mjs summary   # print today's summary
```

Turning it on or off edits only Claude Lore's own entry in `~/.claude/settings.json`, keeping the rest of the file and its layout as they were. It saves a timestamped backup first (`settings.json.claude-lore-backup-…`; the newest three are kept). If `settings.json` isn't valid JSON, it changes nothing and says so.

This is the entry it adds (your path will differ):

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup",
        "hooks": [
          {
            "type": "command",
            "command": "node",
            "args": ["C:/Users/you/.claude/skills/claude-lore/hook/daily-update.mjs"],
            "async": true,
            "timeout": 30
          }
        ]
      }
    ]
  }
}
```

Claude Code starts `node` directly with the script path, without a shell, so this works the same on Windows, macOS and Linux. If you uninstall Node later, turn the hook off first. Otherwise the summary silently stops updating (the error is visible only in Claude Code's verbose mode).

## What it changes on your computer

| Path | What | When |
|---|---|---|
| `~/.claude/skills/claude-lore/` | The skill, the hook script, the helper, and `.install-manifest.json` (the list of files it installed) | Install |
| `~/.claude/claude-lore-data/` | `state.json` (cache date, last failure), `offer.json` (when the hook was offered) and `cache/summary.md` | When the skill or hook first runs |
| `~/.claude/settings.json` | One SessionStart hook entry | Only if you turn the hook on |
| `~/.claude/settings.json.claude-lore-backup-…` | Copies of `settings.json` from before each edit (newest three kept) | Each time the hook is turned on or off |

The hook contacts only `raw.githubusercontent.com`, `support.claude.com` and `platform.claude.com`, over HTTPS. It checks every redirect before following it. It sends nothing except a standard request with the user agent `claude-lore`.

## Uninstall

```sh
node install.mjs --uninstall
```

This turns the hook off, then removes the files it installed in `~/.claude/skills/claude-lore` and its files in `~/.claude/claude-lore-data`. Each folder is removed if nothing else is left in it. It never deletes files it didn't put there. It lists any `settings.json` backups it made, so you can delete them when you're happy.

To undo it by hand instead: delete those two folders, and remove the SessionStart entry whose `args` contain `claude-lore/hook/daily-update.mjs` from `~/.claude/settings.json` (or restore a backup).

## How it works

```
install.mjs                     installer, hook on/off, uninstall
skill/claude-lore/
  SKILL.md                      the instructions Claude follows
  sources.md                    the official sources and how to search each one
  hook/daily-update.mjs         the SessionStart entry point (15-second limit, always exits quietly)
  scripts/update.mjs            the once-a-day fetch and summary
  scripts/lore.mjs              status | summary | offer-made | hook-on | hook-off
  scripts/common.mjs            shared code: paths, files, settings.json edits
test/                           automated tests (node --test)
```

Everything is plain JavaScript run by Node, with no packages to install. Run the tests with `node --test`.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). In short: this README and `SKILL.md` must describe the same behaviour, so when you change one, check the other.

## Licence

[MIT](LICENSE). You're free to use, copy, change and share it, including in your own skills, as long as you keep the copyright and licence notice.
