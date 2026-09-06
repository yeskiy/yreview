# Changelog

All notable changes to Yreview are written in this file.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-09-06

The first public release. The Added entries describe what the plugin does. The other
entries record the work done between the first draft of this section and the day it
was published, so no user of a released version met those defects.

### Added

- Write a review comment on one line or on a range of lines of the editor. The action sits
  in the editor context menu, in the intention list, and on the shortcut Control Shift G.
- Write a review comment on either side of a diff. The plugin resolves the revision of the
  side you clicked, so the comment holds the commit it belongs to.
- Add the Add Review Comment action to the context menu of the Markdown preview. A comment
  then starts from the rendered side of a split editor.
- Store every comment as a git note. A shared comment goes to
  `refs/notes/devtools/discuss` in the git-appraise format. A local comment stays in
  `refs/notes/y-review/local` and never leaves the machine.
- Store a comment in a `.y-review` folder when no git repository covers the file. The
  plugin moves those comments into the git notes as soon as a repository appears. A file
  that an inner repository covers always goes to the notes of that repository.
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
- Run a command line agent in a tool window of the IDE, and send the open tasks to it. The
  window opens one tab for each session, and every tab carries the name of its own agent.
  The plugin knows nine agents, and it also runs a command that you type.
- Give a tab a name of your own, or let the agent name it. Claude Code, GitHub Copilot CLI
  and Cursor CLI write the session name into the window title, and OpenCode answers it on a
  port of its own. An agent that names its own sessions keeps that right, and the plugin
  then names the command you type in the session instead.
- Ship a channel server inside the plugin, and run it with the Java runtime of the IDE. The
  server carries the tasks into a running session over the Model Context Protocol.
- Serve a review bridge on the loopback interface, guarded by a secret that the IDE makes
  for each run. The session reads the address and the secret from a discovery file under
  the user profile.
- Write `AGENT.md` and `tasks.json` into the git directory on every send, so an agent
  that takes no push reads the same tasks. The plugin reads `done.txt` from the same
  folder and closes the tasks the agent reports.
- Choose the command line agent, name its command, and switch the channel or the session
  tool window off, in the settings page.
- Add an application switch that lets a maximized tool window cover the editor completely.
- A review comment on a part of a line records the character position of each end. The
  comment card, the review tree, the clipboard prompt, the task file, the channel event and
  the agent tools all name those characters. A comment on whole lines keeps the line numbers
  alone, and a comment that an older build wrote reads unchanged.
- A task carries a short identifier of about 9 characters, in place of the 40 character
  value an agent read before. The short form comes from the task itself, so the same task
  reads the same identifier on every machine and after every restart. An identifier that
  names two tasks closes neither, and the plugin asks for the whole value. Every place that
  reads an identifier still takes the long form, so a session that started earlier keeps
  working.

### Changed

- The session tool window is named Yreview Session. Its stripe read Claude before, which
  named one of the nine agents that the window runs.
- Each project window writes its own send folder. Two windows open on one repository no
  longer replace the task list of each other. The folder they shared still holds the done
  file an older build wrote, and the plugin still reads it, so a finished task still closes.
- The agent configuration file carries the code of the JetBrains product that wrote it, so
  two products no longer share one file. Every product runs the channel server with a Java
  launcher and a plugin jar of its own.
- The channel prints an identifier whole. It cut the value to 7 characters before.
- One report from an agent closes at most 200 tasks, and the answer names how many closed
  and how many the agent must report again. The Resolve button of the review tree states no
  limit, because you checked those rows yourself.

### Fixed

- A send to an OpenCode session reached the session and never ran. The plugin asked for a
  version of HTTP that the server does not answer, so every send ran into its deadline after
  the server had already taken the text. A send that fails now names the reason, and the IDE
  log holds the whole cause.
- Deleting one TODO row removed the whole documentation comment that held it. A Javadoc or a
  KDoc of many lines went away when you deleted one row inside it. The delete now removes
  the lines of the row. A row that shares the line which opens or closes a comment stays in
  place, and the report names it.
- Writing a comment froze the editor for as long as git took, and starting a session wrote
  two files and picked a port on the thread that draws the window. That work now runs away
  from the drawing thread, and a write that fails reaches you as a dialog.
- The Send button of the review tool window started the bridge inside a read action of the
  platform, and a server socket bound there blocked every write action of the IDE. The
  button now reads the bridge that already runs.
- The Add button of the settings page started a command with no time limit and read its
  output to the end, so a command that asks for input froze the whole IDE. The command now
  stops after 20 seconds, and the page turns the button off while it waits. The button also
  ran the bare command name and relied on the search path of the IDE process, which a
  desktop launcher often shortens, so the page could list an agent as installed and still
  fail to add it. It now runs the path that the search found, and the preview box shows the
  same launcher.
- Both tool windows stayed shut while the IDE built its index, and every action of the
  plugin stayed grey. You had no route to write a review comment and no route to stop a
  running agent. All 23 actions now run during an index build, and the review window says
  that the tasks arrive when the index is complete.
- An agent that reported a finished TODO item while the IDE built its index waited for the
  whole build. The comments still close, and the TODO identifiers come back as a problem
  that names them and asks the agent to report them again. A resolve request also carries a
  timeout of 60 seconds, so no call waits without an end.
- A session whose command no shell resolves showed an empty terminal, no message and no
  ended mark. The panel kept answering that the session ran, the Stop button stayed, and a
  new start was refused. A session that ends now says so, and a session that ends inside two
  seconds points you at the terminal above, where the shell printed the reason.
- Closing one session tab left the agent running with no tab on screen, and nothing was left
  to close that terminal. Every job of a closed tab now stops.
- An OpenCode session ended about one second after it started when another process took the
  port in the gap between the search and the start. The plugin now starts again with a new
  port and a new password, at most five times for one press on Start.
- Every Codex session on Windows lost its configuration and answered "failed to load
  configuration". The plugin now writes the value in a form that both shell wrappers carry
  unchanged.
- A grey button of the session title bar gave no reason for being grey. All three buttons
  now carry their reason in the tooltip.
- The settings page named the entries Another agent and No agent as if they were products,
  so it read "The plugin did not find No agent on this machine" and a button read "Start
  Another agent". The page also asked for an agent search only once for the life of the
  project, so a user who installed an agent still read that the agent was missing, and the
  box that shows the appended arguments did not wrap, so the dialog grew wider than the
  screen.
- Four pieces of text still named Claude Code after the window learned to run nine agents. A
  send with no reader now says that no session reads this project, the channel help no
  longer claims that a send writes `AGENT.md` and `tasks.json` only while the channel is
  off, and two messages now name the Copy button instead of one label it does not always
  carry.
- On a machine with no git, the failure travelled out of every read of the store and only
  the review window caught it. The plugin now raises one notice for the project to say that
  git did not start, and a migration no longer reads a missing git as permission to move
  records.
- The plugin wrote a phantom remote into the git configuration. The remote field takes a
  path or an address as well as a name, and a push to a path made git write a remote section
  under that path, which git then warned about. The plugin asks git whether it holds the
  remote before it writes.
- The notes fetch refspec was forced, so an ordinary fetch replaced the local notes ref and
  a comment whose push had failed went away with no message and no copy. The refspec carries
  no plus now, git refuses a fetch that is not a fast forward and names the ref it refused,
  and the share removes a forced value that an older build wrote. The push also runs before
  the configuration write, so a failed push writes no line into the git configuration.
- A comment written after a read that failed destroyed every earlier record of a folder
  store. One byte that no UTF-8 text holds, or a disk that refused the read, looked the same
  as an empty file. The write now stops and names the file.
- A note larger than the read limit was read as a commit with no note. A migration then
  copied nothing, reported no problem, and moved the folder away. Such a read now refuses,
  the folder stays, and the notice names the reason.
- The plugin moved the records of a folder store into a repository rooted above that folder,
  and the paths in those records then named other files. A move happens only when the two
  roots are equal.
- A repository with no commit showed no TODO item at all, so a user who opened a new project
  and wrote a TODO item saw an empty window. A repository inside another showed every TODO
  item of the inner one twice.
- A comment that no push carried could still show as shared. A later push of any repository
  cleared the mark, a delete that pushed the same ref left the mark in place, and six kinds
  of thread wrote the list with no lock, so a mark could be lost. A mark now names the push
  that carries it, and every read and write of the list takes one lock.
- A comment that the plugin moved out of a folder store showed no preview card.
- An agent tool marked as read-only could start a note write and move a folder.
- A line longer than one megabyte in the done file stopped the hand-off for the rest of the
  session, and every identifier behind it was lost. The reader now moves past such a line.
- The count of finished TODO items claimed work that another project window handed out, and
  a restart announced the whole history again. A TODO item now counts as finished only when
  this window handed it out and the line is gone.
- The session working directory ran through a Windows path rule on every system, so a
  project under a single letter mount point did not open on Linux. An empty environment
  variable also read as a folder, and the bridge folded the case of a path on a file system
  that reads case.
- A file added but not committed took no diff comment on either side.
- The plugin changed a layout setting of the whole IDE and never put it back when you
  removed the plugin. It also wrote an error into the IDE log at every start, because a part
  of its descriptor declared a dependency that has no effect there.

### Security

- The plugin put the bridge token into the environment of the terminal, and the platform
  writes that environment into `idea.log`, so the secret landed in a file that a user
  attaches to a public bug report. The environment now carries the path of the discovery
  file, and the channel server reads the address and the token from that file.
- The plugin put the OpenCode server password into the environment of the terminal, with the
  same result. The shell line now reads the value from a file under the user profile with
  owner-only rights, removes that file, and sets the variable for the agent alone. A read
  that gives nothing stops the session, because an OpenCode server that starts with an empty
  password answers every unauthenticated local request.
- Two projects whose paths differ only in a hyphen or an underscore shared one bridge
  discovery file, so the second project read the bridge token of the first. Every project
  now gets a name of its own, and a reader refuses a file that names another project. The
  old rule also built a name that no file system accepts, so a project under a long path
  could never write the file.
- The bridge accepted a request that carried no token while the bridge had set none, because
  the comparison answered true for two empty values.
- A comment arrives from another person over a git note, and the clipboard prompt carried it
  into a terminal that runs it. The clipboard prompt, the channel batch and `tasks.json` now
  drop every control character. The tab, the carriage return and the line feed stay, because
  a comment has lines. The filter covers the second range of control characters as well,
  which holds the single character control sequence introducer.
- Text was cut by storage unit and not by character, so a cut could split one character in
  half and send a broken value to an agent. This covered the comment text, a branch name, a
  tree row and a title.
- The author and the path of a note drew as markup, because a label of Swing reads text that
  starts with the markup tag and escapes nothing. A cloned repository writes both values,
  and neither carried a length cap.
- A note can name any path, and a step of two dots in it opened a file that stands outside
  the repository of its task. The plugin settles the path before the row asks the file
  system.
- The prefilled issue form carried the absolute project path, because it asked for redaction
  with no project. An IDE that runs inside WSL also names the project folder in two
  spellings, and the report cleaned one of them. Five log lines printed the message of a
  failure, which holds the path the work failed on.
- A repository can commit a `.y-review` folder. The plugin read every record of a stranger
  into the shared notes ref of the user, moved the tracked folder out of the working tree,
  and a later share pushed those records to the remote of the user. A folder that git tracks
  is now left alone.
- Another person writes a git note, and the plugin read the whole answer of git into memory,
  so one note could exhaust the heap of the IDE. Each stream stops at 16 megabytes and the
  command answers a failure, because a part of a note reads as a whole note.
- A note whose path carried a few thousand separators emptied the review tree. The tree
  stops at 64 folders and shows the rest of the path in one row.

[Unreleased]: https://github.com/yeskiy/yreview/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/yeskiy/yreview/commits/v1.0.0
