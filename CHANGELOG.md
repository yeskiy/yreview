# Changelog

All notable changes to Y-Review are written in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

The first public release. Every entry below describes a part of the plugin that no earlier
public version had.

### Added

- Write a review comment on one line or on a range of lines of the editor. The action sits
  in the editor context menu, in the intention list, and on the shortcut Control Shift G.
- Write a review comment on either side of a diff. The plugin resolves the revision of the
  side you clicked, so the comment holds the commit it belongs to.
- Store every comment as a git note. A shared comment goes to
  `refs/notes/devtools/discuss` in the git-appraise format. A local comment stays in
  `refs/notes/y-review/local` and never leaves the machine.
- Choose the ref of one comment in the add-comment box, or set the default in the settings.
- Push a shared note to a git remote, and add the notes fetch refspec to the git
  configuration once, so the notes of other people come back with the next fetch.
- Show one gutter icon per comment range, and paint a quiet background over the lines the
  comment covers.
- Open a comment card inside the editor. The card reads Markdown, and it carries a Resolve
  button and a Delete button.
- List every open comment and every TODO item of the project in one tool window, with four
  tabs: Project, Current File, Scope Based, and Changelist.
- Group the tree by module or by directory, flatten the directories, filter by kind, and
  open a preview beside the tree. Each tab keeps its own view state.
- Resolve a comment from the tool window, and delete a comment or a TODO item from the
  tree.
- Add a color scheme page, so the background of a commented range follows the scheme.
- Expose the open comments to the IDE Model Context Protocol server, so an agent inside the
  IDE reads and resolves them.
- Run a Claude Code session in a tool window of the IDE, and send the open tasks to it.
- Ship a channel server inside the plugin, and run it with the Java runtime of the IDE. The
  server carries the tasks into a running session over the Model Context Protocol.
- Serve a review bridge on the loopback interface, guarded by a secret that the IDE makes
  for each run. The session reads the address and the secret from a discovery file under
  the user profile.
- Write `AGENT.md` and `tasks.json` into the git directory on every send, so an agent
  outside Claude Code reads the same tasks. The plugin reads `done.txt` from the same
  folder and closes the tasks the agent reports.
- Switch the channel and the Claude tool window off, and name the Claude command, in the
  settings page.
- Add an application switch that lets a maximized tool window cover the editor completely.

[Unreleased]: https://github.com/yeskiy/y-review
