# Yreview

Yreview writes code review comments on any line of the editor and on any line of a diff,
inside IntelliJ IDEA. It stores each comment as a git note in your own repository, in the
git-appraise format, so a comment travels with the code and needs no server and no account.
It also lists every open comment and every TODO item of the project in one tool window, and
it can hand those tasks to a Claude Code session that runs inside the IDE.

Nothing leaves your machine. The plugin has no server, and the author receives no data. See
[Privacy](#privacy).

- License: [Apache License 2.0](LICENSE)
- Contribute: [CONTRIBUTING.md](CONTRIBUTING.md)
- Report a problem: https://github.com/yeskiy/y-review/issues
- Report a security weakness in private: [SECURITY.md](SECURITY.md)

<!-- SCREENSHOT: a comment card open inside the editor, over the lines it covers. -->

## What it does

Write a comment on one line or on a range of lines. The action sits in the editor context
menu, in the intention list under Alt and Enter, and on the shortcut Control Shift G. The
same action works on both sides of a diff, and the plugin records the revision of the side
you clicked.

The plugin marks a commented range with a gutter icon and a quiet background. A click on
the icon opens a card inside the editor. The card reads Markdown, and it carries a Resolve
button and a Delete button.

The tool window lists every open comment and every TODO item of the project. It holds four
tabs, Project, Current File, Scope Based, and Changelist. Each tab groups by module or by
directory, filters by kind, and opens a preview beside the tree.

One button sends the open tasks to a Claude Code session. The session runs in a tool window
of the IDE. When the agent reports that a task is done, the plugin marks the comment
resolved.

<!-- SCREENSHOT: the tool window with the four tabs and the task tree. -->

## Where the comments are stored

This is the part to read before you install the plugin. Yreview writes into your git
repository. It writes git notes, and it never writes a commit and never touches a file of
your working tree.

### The note refs

| Ref | Holds | Pushed |
|---|---|---|
| `refs/notes/y-review/local` | A comment you keep to yourself | Never |
| `refs/notes/devtools/discuss` | A comment you share with the team | Yes, when you share |
| `refs/notes/devtools/analyses` | A comment written by a machine. The plugin reads this ref and writes nothing to it today. | No |

`refs/notes/devtools/discuss` is the ref of
[git-appraise](https://github.com/google/git-appraise), so the `git appraise` tool reads
the same notes. A local comment sits in a ref of this plugin, and no push command of this
plugin ever names it.

### A file outside a git repository

A file that no git repository covers still takes a comment. The plugin then writes a
`.y-review` folder in the project folder, or in the content root that holds the file. That
folder holds one directory per note ref, and one line of a file holds one record, in the
format below.

The plugin moves those records into the git notes as soon as a git repository covers the
folder. It then puts the old folder at `<git directory>/y-review/migrated-<milliseconds>`,
and it says so in a balloon. A file that an inner repository covers always goes to the notes
of that repository, and never to the folder.

### The record

One note holds one JSON object per line. `git notes append` writes a blank line between two
records, so a note with three comments holds three non-blank lines.

An open comment looks like this, on one line.

```json
{"timestamp":"1787194427","author":"reviewer@example.com","description":"This branch never runs when the input is empty.","location":{"commit":"4f2c8b19a0e6d3c5b7a2f1e8d4c6b9a3f0e2d5c7","path":"src/main/kotlin/Parser.kt","range":{"startLine":88,"endLine":94}}}
```

| Field | Type | Meaning |
|---|---|---|
| `timestamp` | string | The seconds since 1970, as text |
| `author` | string | The value of `git config user.email` at the moment of writing |
| `description` | string, optional | The text of the comment |
| `parent` | string, optional | The identifier of the comment this record answers |
| `original` | string, optional | The identifier of the comment this record edits |
| `resolved` | boolean, optional | True in the record that closes a comment |
| `location.commit` | string | The commit the comment belongs to |
| `location.path` | string | The file, relative to the repository root |
| `location.range` | object, optional | `startLine`, `startColumn`, `endLine`, `endColumn` |
| `v` | integer, optional | The format version. The value is 0 today, and a value of 0 is left out. |

A field with no value is left out. A reader that meets an unknown field keeps the record.

The identifier of a comment is the SHA-1 digest of the JSON text of that comment. The
record above has the identifier `b1e2ffb6cbad1181ddfde2543019227ce316a288`.

A resolve writes a second record that names the first one.

```json
{"timestamp":"1787198000","author":"reviewer@example.com","parent":"b1e2ffb6cbad1181ddfde2543019227ce316a288","resolved":true}
```

A delete removes the line from the note. The plugin keeps no copy.

### Read the notes yourself

Run these commands in your repository at any time. You need no plugin to read what the
plugin wrote.

```bash
git notes --ref refs/notes/y-review/local list
git notes --ref refs/notes/y-review/local show <commit>
git notes --ref refs/notes/devtools/discuss show <commit>
```

### Everything the plugin writes

| Place | Content | When |
|---|---|---|
| `refs/notes/y-review/local` | A local comment | You write a local comment |
| `refs/notes/devtools/discuss` | A shared comment | You write a shared comment |
| `<folder root>/.y-review/notes/` | A comment of a file that no git repository covers | You write a comment outside a repository |
| `<git directory>/y-review/migrated-<milliseconds>` | The folder store, after the records reach the git notes | A git repository starts to cover a folder store |
| `remote.<name>.fetch` in the git configuration | The line `+refs/notes/devtools/*:refs/notes/devtools/*`, added once | The first time you share a comment |
| A push to your git remote | The shared note ref only | You write a shared comment |
| `<git directory>/y-review/AGENT.md` | The rules an agent reads | Every send |
| `<git directory>/y-review/tasks.json` | The open tasks of the repository | Every send |
| `<git directory>/y-review/done.txt` | Read only. An agent appends the tasks it finished. The plugin never writes this file. | Never |
| `~/.y-review/bridge/<mangled project path>.json` | The loopback address of the bridge and a fresh secret. Owner rights only, where the file system knows them. | The project opens and the channel switch stands on |
| A temporary file `claude-y-review-mcp-*.json` | The configuration of one review session. It holds no secret. | A session starts |
| `<project>/.idea/y-review.xml` | The settings of this plugin for this project | You change a setting |
| `<IDE configuration>/options/y-review.xml` | The maximize switch and the editor size it replaced. The switch belongs to the whole IDE, so it stands beside the IDE and not beside a project. | You move the maximize switch |
| The IDE registry key `ide.mainSplitter.min.size` | The value `0` | Only while the maximize switch stands on |

The git directory is `.git` in a normal repository. Git never tracks that folder, so no
review file reaches a commit.

## What the plugin runs

The plugin starts one process that you can see, and one that the agent starts.

**Claude Code.** The Claude tool window runs the command from the settings, `claude` by
default, through a shell. The plugin appends two flags to that command.

```
--mcp-config <the configuration file of the session>
--dangerously-load-development-channels server:y-review
```

The flag `--dangerously-load-development-channels` belongs to Claude Code and not to the
IDE. Claude Code channels are a research preview, so a channel server that Anthropic does
not list needs that flag before the session loads it. Without the flag the session starts,
but the comments never arrive in the open turn. The settings page prints both flags as
plain text, so you read what the session runs before it runs.

**The channel server.** Claude Code starts a small Java process that ships inside the
plugin, `channel/y-review-channel.jar`. The Java runtime of your IDE runs it. The process
holds no IDE class. It reads the bridge address and the bridge secret from its environment,
it refuses any address that is not a loopback address, and it drops every log record so no
file can hold the secret.

**The bridge.** The plugin opens one HTTP server on `127.0.0.1`, on a port the operating
system picks. It holds two paths. `GET /events` carries the tasks out to the session.
`POST /resolve` carries the finished task identifiers back. Every request must carry a
bearer secret of 32 random bytes that the IDE makes new for each run.

You can switch all of this off. Clear the box **Send the review tasks through the channel**
in the settings, and the plugin opens no port and starts no server.

## Requirements

| Item | Version | Needed |
|---|---|---|
| IntelliJ IDEA | 2026.2 or newer, build 262 or newer | Yes. The plugin declares no upper build limit. |
| Git | Any current version, on the PATH | Yes. The plugin runs the `git` program of your machine. |
| Claude Code | Any current version | No. Without it every comment feature works, and only the review session stays out. |

The plugin depends on the bundled Git plugin. It needs no Node.js and no account.

## Install

**From the JetBrains Marketplace.** Open Settings, Plugins, Marketplace. Search for
`Yreview`. Press Install, then restart the IDE.

**From an archive.** Download `y-review-<version>.zip` from the
[releases page](https://github.com/yeskiy/y-review/releases). Open Settings, Plugins, press
the gear icon, then Install Plugin from Disk. Pick the archive, then restart the IDE.

**From source.** Read [CONTRIBUTING.md](CONTRIBUTING.md). One command builds the archive.

```bash
./gradlew buildPlugin
```

The archive lands in `build/distributions/`.

## Settings

Open Settings, Tools, Yreview.

| Setting | Default | What it does |
|---|---|---|
| New comments | Local only | Where a new comment goes. `Local only` writes `refs/notes/y-review/local`. `Shared` writes `refs/notes/devtools/discuss` and pushes that ref. The add-comment box can change the choice for one comment. |
| Send the review tasks through the channel | On | With the box clear, the plugin opens no port and starts no channel server. Every send then writes `AGENT.md` and `tasks.json` in the git directory, and it copies the prompt to the clipboard. |
| Show the Claude tool window | Follows the search for a Claude Code installation | Whether the review session window appears. The window appears and disappears at once, so you need no restart. |
| Claude command | `claude` | The one command a shell runs to start the session. Paste a full path when the command is not on the PATH. |
| Hide the editor beside a maximized tool window | Off | A maximized tool window always leaves a strip of editor. This box writes the IDE registry key `ide.mainSplitter.min.size`, which belongs to the whole IDE and not to this plugin alone. The plugin writes the earlier value again when you clear the box. |

Two more pages carry settings of this plugin.

| Page | Setting |
|---|---|
| Settings, Editor, Color Scheme | The color of the lines an open comment covers |
| Settings, Keymap | The keystroke of Add Review Comment, Control Shift G by default |

The tool window toolbar holds the per-tab view state: group by module, group by directory,
flatten the directories, the preview pane, and the kind filter.

<!-- SCREENSHOT: the settings page at Settings, Tools, Yreview. -->

## Privacy

Nothing leaves your machine. The plugin has no server, and the author receives nothing.

The plugin never sends:

- the text of a comment,
- the name or the address of an author,
- the content of a file, a path, or a repository name,
- a token, a key, or a password,
- a usage count, a crash report, or any other measurement.

The plugin opens one port on `127.0.0.1` and nothing else. Two things reach the network,
and you start both.

1. The git push of a shared comment. It goes to your own git remote, and it carries the
   note ref only.
2. Claude Code, when you start a review session. Claude Code talks to Anthropic under its
   own settings and its own account. The plugin starts the program and adds no data of its
   own to that traffic.

The bridge secret lives in memory and in one file under your user profile, never in a
repository, a log file, or a command line. Read [SECURITY.md](SECURITY.md) for the full
list of what the plugin touches.

## License

Apache License 2.0. See [LICENSE](LICENSE) for the full text and [NOTICE](NOTICE) for the
third-party components the archive carries.
