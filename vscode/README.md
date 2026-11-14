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

## Settings

| Setting                | Default                     | Effect                                                         |
| ---------------------- | --------------------------- | -------------------------------------------------------------- |
| `yreview.newComments`  | `local`                     | The button that the comment box shows first                    |
| `yreview.remote`       | `origin`                    | The remote that gets the shared comments                       |
| `yreview.writeRefspec` | `true`                      | After a share, ask before Yreview adds the notes fetch refspec |
| `yreview.editorMarks`  | `true`                      | Show the threads open and color the commented lines            |
| `yreview.intellijKey`  | `false`                     | Also bind Ctrl+Shift+G, the IntelliJ key                       |
| `yreview.todoPatterns` | `\btodo\b.*`, `\bfixme\b.*` | The TODO patterns of the task views                            |
| `yreview.todoFilters`  | none                        | Named sets of TODO patterns for the Filter button              |

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

## Privacy

Yreview sends no telemetry. It sends data only with the git push of a shared comment, to
the remote that you chose. The log (Yreview: Show Log) removes your folders, remote
addresses, mail addresses and secret values from each line.

## Read the notes yourself

    git notes --ref refs/notes/y-review/local show <commit>
    git notes --ref refs/notes/devtools/discuss show <commit>

The format is in `spec/format.md` of the repository.
