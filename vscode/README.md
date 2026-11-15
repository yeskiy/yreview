# Yreview

Yreview keeps review comments in git notes, in the git-appraise format. The comments stay
out of your files and out of your commits. The Yreview plugin for JetBrains IDEs reads and
writes the same notes, so one team can use VS Code and IntelliJ IDEA together.

## Use it

1. Select one or more lines, or put the caret on a line.
2. Press Ctrl+Alt+G (Cmd+Alt+G on macOS), or use Add Review Comment in the editor
   context menu.
3. Write the comment. Markdown works.
4. Click Save Local or Save Shared, or press Ctrl+Enter (Cmd+Enter on macOS).

To close a new comment box, click Discard or press Escape. Discard closes the box at once.
Escape asks first when the box has text, as for each comment box of VS Code.

A keymap extension can bind Ctrl+Enter to another command in each text editor. For example,
the IntelliJ IDEA Keybindings extension binds it to Go to Declaration. An extension cannot
win over that binding, but a user key binding can. When Yreview finds such a binding, it
offers to add this line to your `keybindings.json`. Click Add to let Yreview add the line.
On macOS, the line uses `cmd+enter`.

```json
{
  "key": "ctrl+enter",
  "command": "editor.action.submitComment",
  "when": "commentEditorFocused && commentController == yreview"
}
```

A local comment stays on your machine in `refs/notes/y-review/local`. A shared comment goes
to `refs/notes/devtools/discuss`, and Yreview pushes that ref to your remote at once.

Click Resolve on a comment to close it. Click Delete to remove it from the notes.

Open a change in the Source Control view. Both sides of the diff take comments. A comment on
the left side goes to the note of the revision of that side. A comment on the working tree
side goes to the note of HEAD. The thread label shows the revision, for example
`Lines 2-2 @4f2c8b1`. Diff views of other extensions, for example GitLens, take no comments.

The comment box opens on the first line of the commented text, and Yreview colors the full
text. For this reason, the VS Code Comments view shows only the first line of each comment.

Text under one open comment gets the color `yreview.commentRangeBackground`. Text under two
or more open comments gets the amber color `yreview.commentOverlapBackground`, and a small
number after the end of its last line shows how many comments cover it. Move the pointer
over that text to see the same count. The high contrast themes show an outline in the color
`yreview.commentOverlapBorder` in place of the amber color. You can change each color in the
setting `workbench.colorCustomizations`.

Yreview shows the open comments of every commit, not only those of HEAD. A comment of an
earlier commit follows its lines: when lines above it change, the comment moves with them.
When the commented lines change, the thread label starts with `Outdated`, the thread shows
the original text, and the lines get the color `yreview.commentOutdatedBackground`. When
the file is removed, the comment shows only in the task views, with the words
`file removed`. Click that row to open the file as it was at the commit of the comment.

In the Markdown preview, Add Review Comment opens the comment box in the source file. When the
source is not in view, it opens beside the preview, so the preview stays. Right-click a selection
or a block of the preview and select Add Review Comment to comment on the source lines of that
text. The title bar button and Ctrl+Alt+G use the selection or the caret of the source, because
VS Code gives a key and a title button no data from the preview. The preview marks each block
that an open comment covers.

VS Code 1.146 and later also has a rich Markdown editor. To open it, select Reopen Editor With,
then Markdown Editor. Its title bar button and Ctrl+Alt+G open the box in the source at the caret.

## The task views

Click the Yreview icon in the activity bar. It holds three views of the open review comments and
TODO items:

| View          | Content                                                 |
| ------------- | ------------------------------------------------------- |
| Project       | Every task of the workspace. The badge counts its rows. |
| Current File  | The tasks of the file in the editor                     |
| Local Changes | The tasks of the files that `git status` names          |

Click a row to open the file at the task. A click on a comment row also expands its thread. You
can drag the container to the panel at the bottom.

Yreview finds a TODO item with `git grep` and the patterns of `yreview.todoPatterns`. It reads the
text of the files, so a TODO inside a string also shows.

The extension runs the regular expressions of `yreview.todoPatterns` on each line with no time
limit. A slow pattern makes the scan slow.

## Requirements

| Item      | Requirement                                                                                                                 |
| --------- | --------------------------------------------------------------------------------------------------------------------------- |
| VS Code   | 1.101 or later                                                                                                              |
| git       | 2.24 or later, on the PATH or in the user setting `git.path`. With an older git, the comment commands stay off.             |
| Folder    | A git repository, or a folder outside git. Outside git, Yreview keeps the comments in `.y-review/` of the workspace folder. |
| Workspace | Trusted. Yreview runs git, and git reads the repository configuration.                                                      |
| File      | Inside a git repository that has at least one commit, or inside a workspace folder                                          |

### Remote development

In a remote window, Yreview runs on the remote host. git, the review bridge, the agent terminal
and the files under `~/.y-review/` are then on the remote host. The issue form opens in the
browser of your local machine. The Markdown preview loads the Yreview marks and the line script
only when the built-in Markdown extension runs on the same host as Yreview.

The table below holds the remote check of each setup. The check has not run yet, so each cell
says "not checked yet". The table fills after the check of the maintainer.

| Check                                         | Local Windows   | Remote-SSH      | WSL             | Dev Containers  | Codespaces      | Cursor          | Windsurf        | VSCodium        |
| --------------------------------------------- | --------------- | --------------- | --------------- | --------------- | --------------- | --------------- | --------------- | --------------- |
| 1. Show Log shows the start and the host      | not checked yet | not checked yet | not checked yet | not checked yet | not checked yet | not checked yet | not checked yet | not checked yet |
| 2. A shared comment reaches a second clone    | not checked yet | not checked yet | not checked yet | not checked yet | not checked yet | not checked yet | not checked yet | not checked yet |
| 3. A resolved comment stays resolved          | not checked yet | not checked yet | not checked yet | not checked yet | not checked yet | not checked yet | not checked yet | not checked yet |
| 4. A sent task reaches Claude Code            | not checked yet | not checked yet | not checked yet | not checked yet | not checked yet | not checked yet | not checked yet | not checked yet |
| 5. The agent resolves the task                | not checked yet | not checked yet | not checked yet | not checked yet | not checked yet | not checked yet | not checked yet | not checked yet |
| 6. The context menu of the Markdown preview   | not checked yet | not checked yet | not checked yet | not checked yet | not checked yet | not checked yet | not checked yet | not checked yet |
| 7. The Add button of the Markdown preview     | not checked yet | not checked yet | not checked yet | not checked yet | not checked yet | not checked yet | not checked yet | not checked yet |
| 8. The diagnostic report holds no remote path | not checked yet | not checked yet | not checked yet | not checked yet | not checked yet | not checked yet | not checked yet | not checked yet |
| 9. The Report button opens the issue form     | not checked yet | not checked yet | not checked yet | not checked yet | not checked yet | not checked yet | not checked yet | not checked yet |
| 10. The log export holds the Yreview log      | not checked yet | not checked yet | not checked yet | not checked yet | not checked yet | not checked yet | not checked yet | not checked yet |
| 11. The bridge file goes when the window goes | not checked yet | not checked yet | not checked yet | not checked yet | not checked yet | not checked yet | not checked yet | not checked yet |

## Settings

Run Yreview: Open Settings to see every setting. Run Yreview: Choose Agent to see the agents of
this machine and what each one supports.

| Setting                    | Default                     | Effect                                                         |
| -------------------------- | --------------------------- | -------------------------------------------------------------- |
| `yreview.newComments`      | `local`                     | The button that the comment box shows first                    |
| `yreview.remote`           | `origin`                    | The remote that gets the shared comments                       |
| `yreview.writeRefspec`     | `true`                      | After a share, ask before Yreview adds the notes fetch refspec |
| `yreview.editorMarks`      | `true`                      | Show the threads open and color the commented lines            |
| `yreview.channel`          | `true`                      | Open the review bridge, so an agent session gets tasks live    |
| `yreview.intellijKey`      | `false`                     | Also bind Ctrl+Shift+G, the IntelliJ key                       |
| `yreview.todoPatterns`     | `\btodo\b.*`, `\bfixme\b.*` | The TODO patterns of the task views                            |
| `yreview.todoFilters`      | none                        | Named sets of TODO patterns for the Filter button              |
| `yreview.agent`            | none                        | The command line agent of the review sessions                  |
| `yreview.agentCommands`    | none                        | The command of each agent, by agent id                         |
| `yreview.autoStartSession` | `true`                      | Start a session when the Yreview Session panel opens           |
| `yreview.sessionLocation`  | `panel`                     | Where the terminal of a new session opens: `panel` or `editor` |

VS Code has no Yreview switch that maximizes the session panel. Use the Maximize Panel Size
command of VS Code.

VS Code has no Scope tab. In a task view, run Filter and type a glob, such as `src/**/*.ts`, to
show the tasks of some files only.

## What Yreview writes

| Place                                                 | When                                                                                                                             |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `refs/notes/y-review/local`                           | You save a local comment                                                                                                         |
| `refs/notes/devtools/discuss`, and a push of that ref | You save a shared comment                                                                                                        |
| `remote.<name>.fetch` in `.git/config`                | You click Add in the question after a share                                                                                      |
| `.y-review/notes/` in the workspace folder            | You save a comment on a file outside every git repository                                                                        |
| `<git dir>/y-review/migrated-<time>`                  | A repository with a commit now holds that folder. Yreview copies the comments into the git notes, then moves the old folder here |

Yreview changes no file of your working tree, except the folder `.y-review/` of a workspace
folder outside git. Two editors that write comments in one folder outside git at the same
time can lose one comment, because each one locks only inside its own process.

## Known limits

Do not open one folder outside git in two editors at the same time (two VS Code windows, or
VS Code and IntelliJ). Each editor locks the comment file only inside its own process, so
one of two parallel writes can get lost.

## Report a problem

Run Yreview: Copy Diagnostic Report and paste the text into an issue. The report holds versions,
switches, counts, states and the last 50 records of this window. It holds no comment text, no
author, no path of your machine, no remote address and no token. Read it before you paste it.

When a command fails, the error message has a Report button. The button opens a new issue form
in your browser with the error and the versions. Nothing goes anywhere until you press Submit.

Run Yreview: Show Log to see the log of the extension. To attach the log files of VS Code, run
Developer: Export Logs, or run Developer: Open Logs Folder and copy the files. The remote check
above records which of the two commands holds the Yreview log.

A crash of the extension host itself makes no report. VS Code starts the host again and shows
its own message.

## Privacy

Yreview sends no telemetry. It sends data only with the git push of a shared comment, to
the remote that you chose. The log (Yreview: Show Log) removes your folders, remote
addresses, mail addresses and secret values from each line.

The diagnostic report and the issue form remove every path of your machine before you see them.
They also remove every remote address, every mail address and every token.

## Read the notes yourself

    git notes --ref refs/notes/y-review/local show <commit>
    git notes --ref refs/notes/devtools/discuss show <commit>

The format is in `spec/format.md` of the repository.
