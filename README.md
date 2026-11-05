# Lore Lookup

Part of the Claude Lore project from Ablation Lab.

Claude doesn't reliably know how its own apps work. Settings, plans and features change faster than the model is trained, so it can give out-of-date or made-up answers about itself. Lore Lookup fixes that with a skill called `lore-lookup`. Ask Claude anything about Claude or Claude Code, and `lore-lookup` checks Anthropic's official docs and help pages for the answer. In Claude Code you can also turn on an optional hook that quietly refreshes a summary of the latest release notes each day, at the start of a session.

The project and this repo are called Claude Lore, but the skill and the plugin are called `lore-lookup`. The skill was first called `claude-lore` and was renamed because skill names can't contain "claude".

> **Unofficial.** Claude Lore is a community project from [Ablation Lab](https://github.com/Ablation-Lab). It isn't made, endorsed or supported by Anthropic. "Claude" and "Claude Code" are Anthropic's names for their products.

## Where it works

- **Claude Code:** yes. Install `lore-lookup` as a plugin, with the installer, or by copying its folder (see [Install](#install)). The optional daily hook works only here, and only when the skill is installed manually in Claude Code (with the installer, or by copying its folder to `~/.claude/skills/lore-lookup`), not with the plugin.
- **claude.ai chat and Cowork:** the skill loads when you add the plugin from the directory (**Customize > Plugins**) or upload the skill yourself (see [Use it in the Claude app](#use-it-in-the-claude-app)). There, Claude answers using that app's own web search and fetch, so turn web search on. The local helper and the daily hook are Claude Code features, so they're skipped.
- **A plugin added in claude.ai also appears in Claude Code** as a synced plugin at the next session start. It works there like the plugin installed in Claude Code: the skill and its helper, but no daily hook.

## What this plugin runs, sends and fetches

In short: the plugin adds one skill (`lore-lookup`) and no hooks. Nothing runs in the background unless you install the skill manually and turn on the daily hook yourself.

**The `lore-lookup` skill**, when Claude loads it for a question:

- In Claude Code, it runs its local helper, `node <skill folder>/scripts/lore.mjs` with `status`, `summary` or `offer-made`. These read the cached summary and record whether the hook has been offered (`~/.claude/claude-lore-data/offer.json`). `status` also reads `~/.claude/settings.json` to see whether the hook entry is there; it's read only, and never printed or sent. They make no network requests.
- Claude reads pages with its own web fetch tool from Anthropic's sites (`code.claude.com`, `support.claude.com`, `platform.claude.com`, `docs.claude.com`, `claude.com` and `www.anthropic.com`), and may run web searches. A search query can include words from your question. Nothing else is sent anywhere, and Claude Lore has no server of its own. See also [Privacy](#privacy).

**The optional daily hook** (Claude Code only, off unless you turn it on):

- **Not part of the plugin.** It's available only when the skill is installed manually in Claude Code (with the installer, or by copying its folder to `~/.claude/skills/lore-lookup`). It's added only by `node install.mjs --hook`, by saying yes when the installer asks, by running the helper's `hook-on`, or by saying yes when the skill offers it (it offers only once, and only when the skill is installed manually). In plugin and claude.ai installs, `hook-on` refuses and changes nothing. It's one SessionStart entry in `~/.claude/settings.json`, shown in [Turn the daily hook on or off](#turn-the-daily-hook-on-or-off).
- **What triggers it:** Claude Code starting a new session (SessionStart with the `startup` matcher; not resuming, `/clear` or compacting). Claude Code then runs `node ~/.claude/skills/lore-lookup/hook/daily-update.mjs` in the background. The script does nothing more if it already fetched today (by your local date), if a fetch failed in the last hour, or if another session is fetching right now.
- **What it fetches:** an HTTPS GET of these three pages, and nothing else:
  - [raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md](https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md): the Claude Code changelog in Anthropic's GitHub repo (only the first 60 KB)
  - [support.claude.com/en/articles/12138966-release-notes](https://support.claude.com/en/articles/12138966-release-notes): the Claude apps release notes (it reads at most 800 KB)
  - [platform.claude.com/docs/en/release-notes/overview.md](https://platform.claude.com/docs/en/release-notes/overview.md): the Claude Platform release notes (only the first 60 KB)

  It follows at most three redirects, and only to those three hosts.
- **What it sends:** only those requests, with the user agent `claude-lore (+https://github.com/Ablation-Lab/claude-lore)` and, for the two Markdown pages, a `Range` header. It sends no cookies, keys, settings, files or anything from your sessions.
- **What it writes:** only in `~/.claude/claude-lore-data/`: `cache/summary.md` (under 12,000 characters), `state.json` (when it last succeeded or failed, and which sources failed), and while it runs, a lock file (`cache/update.lock`) and temporary files. It never edits `settings.json`.
- **How it behaves:** it prints nothing, so it adds nothing to your session's context. It always exits quietly, gives each page 6 seconds and stops itself after 15.
- **Not in the Claude app:** hooks are a Claude Code feature. The uploaded skill's ZIP contains the script file, but the Claude app never runs it. There, the skill uses the app's own web search instead.
- **Turn it off:** run `node install.mjs --hook-off` from the repo folder, or `node ~/.claude/skills/lore-lookup/scripts/lore.mjs hook-off`. To remove the hook, the skill and its data, run `node install.mjs --uninstall`. To do it by hand, delete the SessionStart entry whose `args` contain `lore-lookup/hook/daily-update.mjs` from `~/.claude/settings.json`.

**The installer** (`install.mjs`, only if you run it) copies the skill to `~/.claude/skills/lore-lookup`. Only if you say yes, it also adds the hook entry to `~/.claude/settings.json`, saving a backup first. It makes no network requests. [What it changes on your computer](#what-it-changes-on-your-computer) lists every file.

## What it does

**The skill (`lore-lookup`).** Claude loads it when you ask how Claude, Claude Code or the Claude apps work: what a setting, command, hook, plan, usage limit or feature does, whether a Claude product has a feature, or what's new. When it's loaded, Claude:

1. checks whether today's summary of release notes is cached, and reads it for "what's new" questions;
2. fetches only the official pages the question needs, from the Claude Code docs, the Claude Help Center, the Claude Platform docs and the release notes;
3. answers from those pages and links to each one, and says plainly when something can't be confirmed;
4. if the skill is installed manually and the daily hook isn't on, mentions it **once** and offers to turn it on. It never asks again, whatever you answer.

<img width="1569" height="529" alt="ClaudeLore" src="https://github.com/user-attachments/assets/8c126778-ab5a-44dc-b364-a95cb1a9923c" />

The skill pre-approves only reading Anthropic's own sites (`code.claude.com`, `support.claude.com`, `platform.claude.com`, `docs.claude.com`, `claude.com` and `www.anthropic.com`), web search, and its `status`, `summary` and `offer-made` helper commands. Turning the hook on isn't pre-approved, so Claude Code asks you first (unless your own permission settings already allow it). Questions about writing code against the Claude API are left to Anthropic's own `claude-api` skill.

**The optional daily hook** (Claude Code only). When a new session starts and today's summary isn't cached yet, it fetches the newest entries from the [Claude Code changelog](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md), the [Claude apps release notes](https://support.claude.com/en/articles/12138966-release-notes) and the [Claude Platform release notes](https://platform.claude.com/docs/en/release-notes/overview), and saves a short summary for the skill. After a successful fetch it waits until the next day; if every page fails, it tries again at most once an hour. It runs in the background, so it never delays startup, and it adds nothing to your sessions' context or usage: the skill reads the summary only when you ask about Claude. [What this plugin runs, sends and fetches](#what-this-plugin-runs-sends-and-fetches) has the details.

The summary is a plain extract of the release notes, not AI-written. Angle brackets and invisible characters in it are replaced or removed, so text in a fetched page can't pass for a system tag. The skill also tells Claude to treat the summary and every fetched page as reference data and never to follow instructions in them.

## Example prompts

Just ask in any Claude Code session. To call the skill directly, type `/lore-lookup:lore-lookup` and your question if you installed the plugin, or `/lore-lookup` if you used the installer or copied the folder.

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
```

Then, from the clone, run the installer (you can read `install.mjs` first):

```sh
cd claude-lore
node install.mjs
```

The installer copies the skill to your user-level Claude folder (`~/.claude/skills/lore-lookup`), so it works in every project. It then asks whether to turn on the daily hook. To answer in advance:

```sh
node install.mjs --hook       # install and turn the daily hook on
node install.mjs --no-hook    # install without adding the hook (the skill won't offer it later)
```

Run it again after `git pull` to update. It won't ask about the hook again once you've answered. If you've set `CLAUDE_CONFIG_DIR`, everything goes there instead of `~/.claude`.

### Install as a Claude Code plugin

The repo is also a Claude Code plugin, and its own plugin marketplace. In Claude Code 2.1.275 or later:

```text
/plugin install lore-lookup --marketplace Ablation-Lab/claude-lore
```

On older versions, run `/plugin marketplace add Ablation-Lab/claude-lore`, then `/plugin install lore-lookup@lore-lookup`. To update it later, run `claude plugin update lore-lookup@lore-lookup`.

The plugin gives you the skill only. It doesn't add the daily hook, which stays opt-in: turning it on needs the skill installed manually in Claude Code (with the installer, or by copying its folder to `~/.claude/skills/lore-lookup`), so with the plugin alone the skill's status check says the hook isn't available, and the skill never offers it. Use either the plugin or the installer, not both, or Claude Code loads the skill twice. `node install.mjs --uninstall` removes the installed copy.

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

## Use it in the Claude app

You can also upload the skill to claude.ai, or add the plugin from the directory, and use it in claude.ai chat and Cowork, where it answers the same way using the app's web search. The status helper and the daily hook are Claude Code features, so they're skipped there. You need a plan that supports custom skills, with code execution turned on.

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

Or say yes when the skill offers it (it only offers when the skill is installed manually). If the skill came from the plugin or claude.ai, `hook-on` changes nothing and says why, because there's no installed hook script for Claude Code to run. You can also use the installed helper directly, from anywhere:

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
| `~/.claude/claude-lore-data/` | `state.json` (cache date, last failure) and `cache/summary.md` | When the hook runs |
| `~/.claude/claude-lore-data/offer.json` | When the hook was offered or turned on | Only when the skill offers the hook, or you turn it on |
| `~/.claude/settings.json` | One SessionStart hook entry | Only if you turn the hook on |
| `~/.claude/settings.json.claude-lore-backup-…` | Copies of `settings.json` from before each edit (newest three kept) | Each time the hook is turned on or off |

The hook contacts only `raw.githubusercontent.com`, `support.claude.com` and `platform.claude.com`, over HTTPS, and checks every redirect before following it. [What this plugin runs, sends and fetches](#what-this-plugin-runs-sends-and-fetches) lists exactly what it fetches and sends.

## Uninstall

```sh
node install.mjs --uninstall
```

This turns the hook off, then removes the files it installed in `~/.claude/skills/lore-lookup` and its files in `~/.claude/claude-lore-data`. Each folder is removed if nothing else is left in it. It never deletes files it didn't put there. It lists any `settings.json` backups it made, so you can delete them when you're happy.

To undo it by hand instead: delete those two folders, and remove the SessionStart entry whose `args` contain `lore-lookup/hook/daily-update.mjs` from `~/.claude/settings.json` (or restore a backup).

## How it works

```
install.mjs                     installer, hook on/off, uninstall
.claude-plugin/                 plugin.json, marketplace.json and the listing icon, for the Claude Code plugin
skills/lore-lookup/
  SKILL.md                      the instructions Claude follows
  sources.md                    the official sources and how to search each one
  hook/daily-update.mjs         the SessionStart entry point (15-second limit, always exits quietly)
  scripts/update.mjs            the once-a-day fetch and summary
  scripts/lore.mjs              status | summary | offer-made | hook-on | hook-off
  scripts/common.mjs            shared code: paths, files, settings.json edits
test/                           automated tests (node --test)
scripts/privacy-check.sh        maintainer pre-commit privacy check, run by .githooks/pre-commit;
.githooks/                        not part of the skill, and never run by the plugin
```

Everything is plain JavaScript run by Node, with no packages to install. Run the tests with `node --test`.

## Privacy

Lore Lookup collects nothing. It has no server, no telemetry and no account.

- **Read:** the cached summary, `offer.json` and `state.json` in `~/.claude/claude-lore-data/`, and `~/.claude/settings.json`, read only, to see whether the hook entry is there. `settings.json` is never printed or sent. The cached summary is shown to Claude when it answers a question, and `status` shows only dates, whether the hook is on and which sources failed.
- **Written:** data files only in `~/.claude/claude-lore-data/`. If you use the installer, it also copies the skill to `~/.claude/skills/lore-lookup/`. Only if you turn the daily hook on, it adds one entry to `~/.claude/settings.json` and keeps backups next to it (`settings.json.claude-lore-backup-…`, newest three).
- **Sent:** Claude's own web fetch and web search reach Anthropic's pages, and a search query can include words from your question. If the daily hook is on, it fetches its three pages at most once a day after a successful fetch (while all three fail, it tries again at most once an hour), following up to three redirects within the same hosts. The requests carry a user agent and, for the two Markdown pages, a `Range` header, and nothing else. [What this plugin runs, sends and fetches](#what-this-plugin-runs-sends-and-fetches) has the details.

Everything it stores stays on your computer until you delete it; `node install.mjs --uninstall` removes it.

## Support

Questions, problems and security reports: [GitHub issues](https://github.com/Ablation-Lab/claude-lore/issues).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). In short: this README and `SKILL.md` must describe the same behaviour, so when you change one, check the other.

## Licence

[MIT](LICENSE). You're free to use, copy, change and share it, including in your own skills, as long as you keep the copyright and licence notice.
