# Claude Lore

Claude doesn't reliably know how its own apps work. Settings, plans and features change faster than the model is trained, so it can give out-of-date or made-up answers about itself. Claude Lore fixes that. Ask Claude anything about Claude or Claude Code, and it checks Anthropic's official docs and help pages for the answer. It can also add an optional hook that quietly checks for updates once a day, at the start of a session.

> **Unofficial.** Claude Lore is a community project from [Ablation Lab](https://github.com/Ablation-Lab). It isn't made, endorsed or supported by Anthropic. "Claude" and "Claude Code" are Anthropic's names for their products.

## What it does

**The skill (`lore-lookup`).** The project is Claude Lore; the skill itself is called `lore-lookup`, because skill names that work in claude.ai can't contain "claude". Claude loads it whenever you ask how Claude, Claude Code or the Claude apps work: what a setting, command, hook, plan, usage limit or feature does, whether Claude can do something, or what's new. When it's loaded, Claude:

1. checks whether today's summary of release notes is cached, and reads it for "what's new" questions;
2. fetches only the official pages the question needs, from the Claude Code docs, the Claude Help Center, the Claude Platform docs and the release notes;
3. answers from those pages and links to each one, and says plainly when something can't be confirmed;
4. if the daily hook isn't on, mentions it **once** and offers to turn it on. It never asks again, whatever you answer.

<img width="1569" height="529" alt="ClaudeLore" src="https://github.com/user-attachments/assets/8c126778-ab5a-44dc-b364-a95cb1a9923c" />

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

## Example prompts

Just ask in any Claude Code session (or type `/lore-lookup` and your question):

- "How do SessionStart hooks work in Claude Code?"
- "What's new in Claude Code this week?"
- "Is there a setting to turn off auto-compact?"
- "What does the Max plan include, and what are its usage limits?"
- "Can the Claude desktop app use MCP servers?"

Claude answers with links to the pages it used, such as `code.claude.com/docs/en/hooks`, and says so if it couldn't confirm something.

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

The installer copies the skill to your user-level Claude folder (`~/.claude/skills/lore-lookup`), so it works in every project. It then asks whether to turn on the daily hook. To answer in advance:

```sh
node install.mjs --hook       # install and turn the daily hook on
node install.mjs --no-hook    # install without adding the hook (the skill won't offer it later)
```

Run it again after `git pull` to update. It won't ask about the hook again once you've answered. If you've set `CLAUDE_CONFIG_DIR`, everything goes there instead of `~/.claude`.

### Install without Node

Copy the `skills/lore-lookup` folder into your Claude skills folder:

```sh
# macOS, Linux, Git Bash
mkdir -p ~/.claude/skills && cp -R skills/lore-lookup ~/.claude/skills/
```

```powershell
# Windows PowerShell
New-Item -ItemType Directory -Force "$HOME\.claude\skills" | Out-Null
Copy-Item -Recurse skills\lore-lookup "$HOME\.claude\skills\"
```

The skill still checks official sources. Without Node it skips the status check and the hook offer.

### Upgrading from `claude-lore`

Early versions installed the skill as `~/.claude/skills/claude-lore`. Running `node install.mjs` from an updated clone installs `lore-lookup`, points an existing daily hook at the new location, and removes the old copy (only the files the installer put there). Your cached summary and your answer to the hook offer are kept.

## Use it in claude.ai

You can also upload the skill to claude.ai, where it answers the same way using claude.ai's web search. The status helper and the daily hook are Claude Code features, so they're skipped there. You need a plan that supports custom skills, with code execution turned on.

1. Make a ZIP file whose root contains the `lore-lookup` folder (not its files on their own):

   ```sh
   # macOS, Linux, Git Bash
   cd skills && zip -r ../lore-lookup.zip lore-lookup && cd ..
   ```

   ```powershell
   # Windows PowerShell
   Compress-Archive -Path skills\lore-lookup -DestinationPath lore-lookup.zip
   ```

2. In claude.ai, go to **Customize > Skills**, click **+**, then **+ Create skill**, then **Upload a skill**, choose `lore-lookup.zip`, and turn the skill on with its toggle.
3. Make sure web search is on, then ask one of the [example prompts](#example-prompts).

A skill you turn on in claude.ai also loads in Claude Code 2.1.273 or later when you're signed in with the same account (as `anthropic-skills:lore-lookup`). If you've installed it in Claude Code as well, turn one of them off so it doesn't load twice. Skills installed in Claude Code aren't uploaded to claude.ai.

## Turn the daily hook on or off

From the repo folder:

```sh
node install.mjs --hook       # on
node install.mjs --hook-off   # off (keeps the skill)
```

Or say yes when the skill offers it. You can also use the installed helper directly, from anywhere:

```sh
node ~/.claude/skills/lore-lookup/scripts/lore.mjs hook-on
node ~/.claude/skills/lore-lookup/scripts/lore.mjs hook-off
node ~/.claude/skills/lore-lookup/scripts/lore.mjs status
node ~/.claude/skills/lore-lookup/scripts/lore.mjs summary   # print today's summary
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
            "args": ["C:/Users/you/.claude/skills/lore-lookup/hook/daily-update.mjs"],
            "async": true,
            "timeout": 30
          }
        ]
      }
    ]
  }
}
```

Claude Code starts `node` directly with the script path, without a shell, so this works the same on Windows, macOS and Linux. Claude Code doesn't enforce `timeout` for async hooks, so the script stops itself after 15 seconds. If you uninstall Node later, turn the hook off first. Otherwise the summary silently stops updating (the error is visible only in Claude Code's verbose mode).

## What it changes on your computer

| Path | What | When |
|---|---|---|
| `~/.claude/skills/lore-lookup/` | The skill, the hook script, the helper, and `.install-manifest.json` (the list of files it installed) | Install |
| `~/.claude/claude-lore-data/` | `state.json` (cache date, last failure), `offer.json` (when the hook was offered) and `cache/summary.md` | When the skill or hook first runs |
| `~/.claude/settings.json` | One SessionStart hook entry | Only if you turn the hook on |
| `~/.claude/settings.json.claude-lore-backup-…` | Copies of `settings.json` from before each edit (newest three kept) | Each time the hook is turned on or off |

The hook contacts only `raw.githubusercontent.com`, `support.claude.com` and `platform.claude.com`, over HTTPS. It checks every redirect before following it. It sends nothing except a standard request with the user agent `claude-lore`.

## Uninstall

```sh
node install.mjs --uninstall
```

This turns the hook off, then removes the files it installed in `~/.claude/skills/lore-lookup` and its files in `~/.claude/claude-lore-data`. Each folder is removed if nothing else is left in it. It never deletes files it didn't put there. It lists any `settings.json` backups it made, so you can delete them when you're happy.

To undo it by hand instead: delete those two folders, and remove the SessionStart entry whose `args` contain `lore-lookup/hook/daily-update.mjs` from `~/.claude/settings.json` (or restore a backup).

## How it works

```
install.mjs                     installer, hook on/off, uninstall
skills/lore-lookup/
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
