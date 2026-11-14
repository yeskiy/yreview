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

A keymap extension can bind Ctrl+Enter to another command in each text editor. The
IntelliJ IDEA Keybindings extension binds it to Go to Declaration, and an extension cannot
win over that binding. In this case, add this line to your `keybindings.json`:

```json
{ "key": "ctrl+enter", "command": "editor.action.submitComment", "when": "commentEditorFocused" }
```

A local comment stays on your machine in `refs/notes/y-review/local`. A shared comment goes
to `refs/notes/devtools/discuss`, and Yreview pushes that ref to your remote at once.

Click Resolve on a comment to close it. Click Delete to remove it from the notes.

The comment box opens on the first line of the commented text, and Yreview colors the full
text. For this reason, the VS Code Comments view shows only the first line of each comment.

Text under one open comment gets the color `yreview.commentRangeBackground`. Text under two
or more open comments gets the amber color `yreview.commentOverlapBackground`, and a small
number after the end of its last line shows how many comments cover it. Move the pointer
over that text to see the same count. The high contrast themes show an outline in the color
`yreview.commentOverlapBorder` in place of the amber color. You can change each color in the
setting `workbench.colorCustomizations`.

## Requirements

| Item      | Requirement                                                                                                     |
| --------- | --------------------------------------------------------------------------------------------------------------- |
| VS Code   | 1.101 or later                                                                                                  |
| git       | 2.24 or later, on the PATH or in the user setting `git.path`. With an older git, the comment commands stay off. |
| Folder    | A git repository. Yreview keeps comments in git notes only, so a folder outside git gets no comments.           |
| Workspace | Trusted. Yreview runs git, and git reads the repository configuration.                                          |
| File      | Inside the git repository, which has at least one commit                                                        |

## Settings

| Setting                | Default  | Effect                                                         |
| ---------------------- | -------- | -------------------------------------------------------------- |
| `yreview.newComments`  | `local`  | The button that the comment box shows first                    |
| `yreview.remote`       | `origin` | The remote that gets the shared comments                       |
| `yreview.writeRefspec` | `true`   | After a share, ask before Yreview adds the notes fetch refspec |
| `yreview.editorMarks`  | `true`   | Show the threads open and color the commented lines            |
| `yreview.intellijKey`  | `false`  | Also bind Ctrl+Shift+G, the IntelliJ key                       |

## What Yreview writes

| Place                                                 | When                                        |
| ----------------------------------------------------- | ------------------------------------------- |
| `refs/notes/y-review/local`                           | You save a local comment                    |
| `refs/notes/devtools/discuss`, and a push of that ref | You save a shared comment                   |
| `remote.<name>.fetch` in `.git/config`                | You click Add in the question after a share |

Yreview never changes a file of your working tree.

## Privacy

Yreview sends no telemetry. It sends data only with the git push of a shared comment, to
the remote that you chose. The log (Yreview: Show Log) removes your folders, remote
addresses, mail addresses and secret values from each line.

## Read the notes yourself

    git notes --ref refs/notes/y-review/local show <commit>
    git notes --ref refs/notes/devtools/discuss show <commit>

The format is in `spec/format.md` of the repository.
