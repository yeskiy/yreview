# Changelog

git-cliff writes this file from the commit messages. Do not edit it by hand.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-09-06

### Added

- Add the git-appraise comment model and its json codec
- Read and write git notes through a runner interface
- Add the comment book and the ide git runner
- Resolve the review anchor for each diff side
- Add the editor action, the diff action, the gutter, and the tool window
- Add the review comments setting with a local and a shared value
- Push a shared comment and mark it when the push fails
- Choose the ref of a single comment in the add comment dialog
- Draw one gutter icon per comment range and resolve from it
- Resolve a comment from the tool window and refresh after a write
- Add closed, commits, and find to the comment book
- Expose the review comments as ide mcp tools
- Add the claude code channel server for review comments
- Build the review session command line
- Read the review bridge from the discovery file
- Plan a session that starts without the bridge
- Add the claude review tool window
- Serve the review bridge on the loopback address
- Write the file a session reads to find the bridge
- Run one bridge for the lifetime of a project
- Add the send all comments action to the tool window
- Add the tool window icons, the plugin logo and the intention description
- Replace the comment dialog and the gutter route
- List every review comment and TODO in one task tree
- Turn the review window into an enhanced todo view
- Read markdown in the comment box and bind a shortcut
- Mark the lines a comment covers and show a comment card
- Lay the review panel out like the todo panel and let a comment go
- Switch the channel and the session window off
- Take the launch command from the settings
- Add the changelist scope tab
- Ship the channel server inside the plugin
- Run the channel server on the jvm, in place of node
- Render a comment inside the editor, in place of a floating window
- Open the preview, trim a row, and bind the delete key
- Show a loading state in the task window
- Size the editor card to its text and add Delete
- Open a review session when the window opens
- Add a switch that hides the editor beside a maximized window
- Copy the review tasks as a prompt for any agent
- Add the comment action to the markdown preview menu
- Store review comments for a file outside a git repository
- Read the tasks again after a folder becomes a repository
- Draw the plugin its own icons
- Draw the comment icons in the diff gutter
- Build a diagnostic report a user can paste
- Wire the diagnostic report into the ide
- Let the user decide what the plugin assumed
- Address a review send to one session
- Choose which session a review send reaches
- Run many agent sessions in tabs
- Prepare the plugin to run other command line agents
- Send to a session that reads no event stream
- Choose and run any of nine command line agents
- Name each tab after the agent that runs in it
- Record which agents name their own sessions
- Let the user name a tab
- Keep two sessions of one name apart in the send picker
- Take the tab name from the window title of the agent
- Take the tab name from a running OpenCode session
- Start a session again after a lost port
- Record the characters a comment covers inside a line
- Give every task a short handle for an agent to read
- Put the yeskiy logo on the plugin icon

### Changed

- Breaking. Rename the plugin to y-review
- Update the toolbar off the event thread
- Delete a condition that never fires
- Name the session classes after the work, not one agent

### Fixed

- Make the agent comment tool follow the sharing setting
- Reword the status text for a missing bridge file
- Leave every session flag to the launcher
- Report the true state of the review session
- Open the review bridge when the project opens
- Follow the agent process and lay the terminal out at once
- Say that the channel is off, in place of asking the user to wait
- Wrap the comment text and clear the preview card
- Stop the endless rescan of the task window
- Start the preview editor on the first column
- Read the plugin folder without an internal api
- Add a review comment from a split editor
- Read the scope again when a tab reaches the screen
- Write a comment over the markdown preview
- Clear the preview card when its comment is gone
- Run the session terminal on the bundled engine
- Drop a preview answer that arrives out of order
- Give the comment field listener a parent
- Find the executable without a removed platform call
- Send and read the comments of a folder store
- Keep the agent configuration file after the session ends
- Count only the sessions this window started as receivers
- Stop naming one agent in text that serves nine
- Stop an unsigned build from reaching the marketplace
- Leave a review folder that git tracks alone
- Stop a note field from drawing as markup
- Drop control characters from task text on every exit
- Redact the project path in the issue form
- Let an empty token match nothing
- Close the last five security findings
- Clean both spellings of the project path
- Delete the descriptor element that has no effect
- Give each project a discovery file of its own
- Cap the output of one git command
- Register the review server with Codex on Windows
- Open both tool windows while the IDE builds the index
- Keep an unpushed comment safe from an ordinary fetch
- Refuse an append after a read that failed
- Run every plugin action while the IDE builds the index
- Bound the command that the Add button runs
- Drop the queued work of a tab that closed
- Three defects that a running IDE found
- Tell the user when a session ends
- Show the reason that a title bar button carries
- Keep the bridge token out of the IDE log
- Show every TODO item once, in any repository
- Write no phantom remote into the git configuration
- Move folder records only into the repository that holds them
- Report one clear problem when git does not start
- Keep the OpenCode password out of the IDE log
- Stop an agent from waiting with no bound on a finished TODO item
- Write a comment away from the thread that draws
- Read the session list without starting the bridge
- Keep the list of unshared comments safe across threads
- Resolve a comment away from the thread that draws
- Prepare a session away from the thread that draws
- Make the OpenCode send work and name its failure
- Correct five defects the unexercised path sweep found
- Bound and check every record the plugin does not trust
- Name every shared file by the thing that owns it
- Read text and platform rules the way a machine reads them
- Bound what outlives a close and what grows without end
- Stop the release from shipping the notes of an earlier version
- Test the unreleased section for content, not for size
- Stop the page from choosing an agent for the user
- Say what the plugin tested, and leave no dead window
- Keep the prompt off the line the user was typing
- Keep Send and Copy out of the toolbar overflow
- List the sqids library among the redistributed components

[Unreleased]: https://github.com/yeskiy/yreview/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/yeskiy/yreview/commits/v1.0.0
