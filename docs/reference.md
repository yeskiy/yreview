# Yreview reference

This document holds the detail behind Yreview. It says where the plugin keeps a comment and
what one record looks like. It also lists every file the plugin writes, every process it
starts, and every setting. Read [README.md](../README.md) first for what the plugin does.

## Where the comments are stored

Yreview writes into your git repository. It writes git notes, and it never writes a commit
and never touches a file of your working tree.

### The note refs

| Ref                            | Holds                                                                                     | Pushed              |
|--------------------------------|-------------------------------------------------------------------------------------------|---------------------|
| `refs/notes/y-review/local`    | A comment you keep to yourself                                                            | Never               |
| `refs/notes/devtools/discuss`  | A comment you share with the team                                                         | Yes, when you share |
| `refs/notes/devtools/analyses` | A comment written by a machine. The plugin reads this ref and writes nothing to it today. | No                  |

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

| Field             | Type              | Meaning                                                                 |
|-------------------|-------------------|-------------------------------------------------------------------------|
| `timestamp`       | string            | The seconds since 1970, as text                                         |
| `author`          | string            | The value of `git config user.email` at the moment of writing           |
| `description`     | string, optional  | The text of the comment                                                 |
| `parent`          | string, optional  | The identifier of the comment this record answers                       |
| `original`        | string, optional  | The identifier of the comment this record edits                         |
| `resolved`        | boolean, optional | True in the record that closes a comment                                |
| `location.commit` | string            | The commit the comment belongs to                                       |
| `location.path`   | string            | The file, relative to the repository root                               |
| `location.range`  | object, optional  | `startLine`, `startColumn`, `endLine`, `endColumn`                      |
| `v`               | integer, optional | The format version. The value is 0 today, and a value of 0 is left out. |

A comment on whole lines writes no column, so `startColumn` and `endColumn` are 0 there. A
comment on a part of a line writes the character position of each end. A column is a zero
based character position in a line, and `endColumn` names the character after the last
character of the comment.

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

| Place                                              | Content                                                                                                                                                         | When                                                                                                                             |
|----------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------|
| `refs/notes/y-review/local`                        | A local comment                                                                                                                                                 | You write a local comment                                                                                                        |
| `refs/notes/devtools/discuss`                      | A shared comment                                                                                                                                                | You write a shared comment                                                                                                       |
| `<folder root>/.y-review/notes/`                   | A comment of a file that no git repository covers                                                                                                               | You write a comment outside a repository                                                                                         |
| `<git directory>/y-review/migrated-<milliseconds>` | The folder store, after the records reach the git notes                                                                                                         | A git repository starts to cover a folder store                                                                                  |
| `remote.<name>.fetch` in the git configuration     | The line `+refs/notes/devtools/*:refs/notes/devtools/*`, added once                                                                                             | The first time you share a comment                                                                                               |
| A push to your git remote                          | The shared note ref only                                                                                                                                        | You write a shared comment                                                                                                       |
| `<git directory>/y-review/<window>/AGENT.md`       | The rules an agent reads                                                                                                                                        | Every send                                                                                                                       |
| `<git directory>/y-review/<window>/tasks.json`     | The open tasks of the repository                                                                                                                                | Every send                                                                                                                       |
| `<git directory>/y-review/<window>/done.txt`       | Read only. An agent appends the tasks it finished. The plugin never writes this file.                                                                           | Never                                                                                                                            |
| `<git directory>/y-review/done.txt`                | Read only. The done file that an earlier version wrote, outside any window folder. The plugin still reads it, so a task an agent already reported still closes. | Never                                                                                                                            |
| `~/.y-review/bridge/<mangled project path>.json`   | The loopback address of the bridge and a fresh secret. Owner rights only, where the file system knows them.                                                     | The project opens and the channel switch stands on                                                                               |
| `~/.y-review/mcp/<agent>-<build code>.json`        | The Model Context Protocol configuration of one agent. It holds no secret.                                                                                      | A session of Claude Code, OpenCode, Gemini CLI, or GitHub Copilot CLI starts, and the file there does not hold that text already |
| `<project>/.cursor/mcp.json`                       | The review server, in the file that Cursor CLI reads                                                                                                            | You press Add on the settings page while Cursor CLI is the chosen agent                                                          |
| The Model Context Protocol file of Antigravity CLI | The review server. The plugin runs `agy mcp add`, and Antigravity CLI writes the file.                                                                          | You press Add on the settings page while Antigravity CLI is the chosen agent                                                     |
| `<project>/.idea/y-review.xml`                     | The settings of this plugin for this project                                                                                                                    | You change a setting                                                                                                             |
| `<IDE configuration>/options/y-review.xml`         | The maximize switch and the editor size it replaced. The switch belongs to the whole IDE, so it stands beside the IDE and not beside a project.                 | You move the maximize switch                                                                                                     |
| The IDE registry key `ide.mainSplitter.min.size`   | The value `0`                                                                                                                                                   | Only while the maximize switch stands on                                                                                         |

The git directory is `.git` in a normal repository. Git never tracks that folder, so no
review file reaches a commit.

`<window>` is the folder of one project window. The name joins the name of the project
folder and a short digest of its whole path. You can open two windows on one repository,
and each one then keeps its own task list.

## What the plugin runs

The plugin starts one process that you can see, the agent. That agent starts a second
process, the review server, when the plugin registered the server for it.

**The command line agent.** The session tool window runs the command from the settings,
through a shell. The page holds one command for each agent, and `claude` is the default
command of Claude Code. The plugin then appends the arguments of the chosen agent.

Claude Code takes these two flags.

```
--mcp-config <the configuration file of the agent>
--dangerously-load-development-channels server:y-review
```

OpenCode takes `--hostname 127.0.0.1` and `--port <the port of this session>`. OpenCode
binds a port only when both flags stand in its arguments. The plugin reads that port to push
a task, and to read the name of the session.

The flag `--dangerously-load-development-channels` belongs to Claude Code and not to the
IDE. Claude Code channels are a research preview, so a channel server that Anthropic does
not list needs that flag before the session loads it. Without the flag the session starts,
but the comments never arrive in the open turn. Claude Code is the only agent that reads a
channel, so no other agent takes this flag. The settings page prints the arguments of every
agent as plain text, so you read what the session runs before it runs.

**The channel server.** The agent starts a small Java process that ships inside the plugin,
`channel/y-review-channel.jar`. The Java runtime of your IDE runs it. The process holds no
IDE class. It reads the bridge address and the bridge secret from its environment, it
refuses any address that is not a loopback address, and it drops every log record so no file
can hold the secret.

**The bridge.** The plugin opens one HTTP server on `127.0.0.1`, on a port the operating
system picks. It holds two paths. `GET /events` carries the tasks out to the session.
`POST /resolve` carries the finished task identifiers back. Every request must carry a
bearer secret of 32 random bytes that the IDE makes new for each run.

Only a session of this tool window takes a send. An agent can start a session of its own,
and that session can hold the review tools. It holds no channel, so a send never reaches it.

You can switch all of this off. Clear the box **Send the review tasks through the channel**
in the settings, and the plugin opens no port and starts no server.

## Settings reference

Open Settings, Tools, Yreview to reach this page.

| Setting                                            | Default                                                           | What it does                                                                                                                                                                                                                                              |
|----------------------------------------------------|-------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| New comments:                                      | Local only                                                        | Where a new comment goes. `Local only` writes `refs/notes/y-review/local`. `Shared` writes `refs/notes/devtools/discuss` and pushes that ref. The add-comment box can change the choice for one comment.                                                  |
| Remote for shared comments:                        | `origin`                                                          | The remote that a shared note goes to. Not every repository names its remote `origin`. A blank field falls back to `origin`.                                                                                                                              |
| Add the notes refspec to the git configuration     | On                                                                | The plugin adds `+refs/notes/devtools/*:refs/notes/devtools/*` to `remote.<name>.fetch` once, so the notes other people write come back with the next fetch. With the box clear the plugin writes no git configuration, and you add that line by hand.    |
| Send the review tasks through the channel          | On                                                                | With the box clear, the plugin opens no port and starts no channel server. Every send then writes `AGENT.md` and `tasks.json` in the review folder of this project window, and it copies the prompt to the clipboard.                                     |
| Show the session tool window                       | On                                                                | Whether the review session window appears. The window appears and disappears at once, so you need no restart.                                                                                                                                             |
| Command line agent:                                | Claude Code                                                       | The agent that the session window runs. A running session keeps the agent it started with, and the next session uses the new choice.                                                                                                                      |
| Command:                                           | The default command of the chosen agent, `claude` for Claude Code | The one command a shell runs to start the session. The page keeps one command for each agent. Paste a full path when the command is not on the PATH.                                                                                                      |
| Start a session when the session tool window opens | On                                                                | Opening the window starts the session of its first tab with no press. With the box clear that tab opens and waits, and the Start button in the title bar starts it. The plus button always starts the session of the tab it opens.                        |
| Show comment marks in the editor                   | On                                                                | An open editor shows one icon for each comment range, and a quiet background over the lines of that range. With the box clear the editor stays plain, and the tool window still lists every comment.                                                      |
| Hide the editor beside a maximized tool window     | Off                                                               | A maximized tool window always leaves a strip of editor. This box writes the IDE registry key `ide.mainSplitter.min.size`, which belongs to the whole IDE and not to this plugin alone. The plugin writes the earlier value again when you clear the box. |

Two agents keep their servers in a file of their own, so the page shows an **Add** button
for them. Antigravity CLI gets a command that the plugin runs once, and Cursor CLI gets the
file `.cursor/mcp.json` in the project. The plugin writes nothing there until you press Add.

Two more pages carry settings of this plugin.

| Page                           | Setting                                                         |
|--------------------------------|-----------------------------------------------------------------|
| Settings, Editor, Color Scheme | The color of the lines an open comment covers                   |
| Settings, Keymap               | The keystroke of Add Review Comment, Control Shift G by default |

The tool window toolbar holds the per-tab view state: group by module, group by directory,
flatten the directories, the preview pane, the kind filter, and the resolved switch. The
resolved switch lists the comments that somebody already resolved. It starts off, and each
tab keeps its own answer.

## Report a problem

1. Open an issue at https://github.com/yeskiy/yreview/issues .
2. Run `Copy Yreview Diagnostic Report` from Help, Diagnostic Tools, or from the menu you
   get with the right mouse button in the Yreview tool window.
3. Read the report, then paste it into the issue.
4. The report holds the versions, the switches and the state of the last review records. It
   holds no comment text, no path of your machine, no git remote, no address of an author
   and no bridge token.
5. After a crash, press `Report to the Yreview Issue Tracker` in the error dialog of the
   IDE. That opens a filled issue form in the browser. Nothing goes anywhere until you
   press Submit there.
6. The plugin sends nothing anywhere on its own. Every report needs a press.

The log of the IDE at Help, Show Log in Explorer holds one line for each record. Help,
Collect Logs and Diagnostic Data writes the same report into `troubleshooting.txt` inside
the archive.
