# Changelog

git-cliff writes this file from the commit messages. Do not edit it by hand.

## 1.2.0 - 2026-11-18

### Added

- Add the store walk and the record rewrite rules
- Find the store of a file outside the workspace
- Offer only local comments for a folder store
- Find the child stores of a repository
- Move child folder stores into the git notes with new identifiers
- Scan the open files outside the workspace
- Show open files outside the workspace in the task views

### Fixed

- Name a saved local file in the no place message
- Leave outside tasks out of a task list given to the copy
- Keep a repository outside the workspace an outside root

## 1.1.2 - 2026-11-17

### Fixed

- Run an agent command with its arguments
- Show a saved comment thread open when the editor marks are on

## 1.1.1 - 2026-11-16

### Fixed

- Write the comment when VS Code saves a draft
- Read the comments again when a write runs during a reload

## 1.1.0 - 2026-11-16

### Added

- Add the settings and a log that removes private data
- Encode records and derive identifiers as the plugin does
- Offer the IntelliJ key for Add Review Comment once
- Read and write git notes with a bounded runner
- Write, resolve and delete review comments
- Write, resolve and delete review comments in the editor
- Split comment ranges into segments by overlap depth
- Add the store, diff side and path containment rules
- Read every review note in two git processes
- Find TODO items with git grep
- Add the cut rules of a TODO delete
- Add the agent catalog, agent search and session registry
- Add the session shell command and the session rules
- Build the diagnostic report without private data
- Add comment links and marks to the Markdown preview
- Resolve the revision of a diff side with git
- Keep comments of files outside git in a folder store
- Add the task model and the rules of the task tree
- Scan the review tasks of every repository
- Write the handoff files and read the done file
- Anchor comments to diff sides and folder stores
- Offer a user key binding when a keymap takes Ctrl+Enter
- Close the tasks that an agent or a user reports
- Comment on both sides of a diff and in plain folders
- Build the agent prompts and migrate the task files
- Mark the comments that a failed push left behind
- Show the review tasks in the activity bar
- Add the filter, group and check actions of the task views
- List folder store comments and debounce the task scan
- Resolve and delete tasks from the task views
- Run review sessions in named terminals
- Copy review tasks and close the tasks an agent reports
- Add the loopback review bridge
- Port the review channel server to TypeScript
- Serve the four review tools on the VS Code bridge
- Write the MCP files and the channel launcher
- Push to OpenCode and report each send
- Start agent sessions with the review channel
- Send review tasks to a live session and add the server
- Give VS Code chat and Cursor the review tools
- Copy a diagnostic report and report a failure
- Add review comments from the Markdown preview
- Keep a record of each session start and each send
- Open the settings and show what each agent supports
- Keep the Comments panel closed when a thread opens
- Map a comment range through a git diff
- Store the commented lines in location.text
- Store the commented lines in location.text
- Comment from the Markdown preview without links
- Place the open comments of every commit in the working tree
- Show comments of earlier commits at their mapped lines
- Mark comment rows outdated or file removed
- Add the pure parts of the review preview
- Write, resolve and delete comments by line and by id
- Map a preview selection to exact source lines
- Open a review preview that renders like the built-in preview
- Comment on the exact selection of the review preview

### Changed

- Move the VS Code host out of the store folder
- Use the StoreKind type of the review service

### Fixed

- Stop a kill error from escaping the git runner
- Show saved comments after a window reload
- Open the native comment box with focus and keep threads in place
- Remove the long form of a short workspace path from the log
- Close comment boxes on Esc and cut git calls per action
- Await the record line in the folder store
- Wait for the first task scan before a handoff write
- Skip own folder store writes in the note watcher
- Register the Cursor review server on each bridge open
- Show only the kind of the agent command in the report
- Keep the agent command text out of the session record
- Keep the bridge file of another window on the same folder
- Refuse an end line that a record cannot hold
- Give the model the reason of a refused report
- Pass an id that matches no open comment to the editor
- Stop Add when .cursor/mcp.json does not read
- Refresh the channel launcher at activation
- Keep a change made to mcp.json during the Add dialog
- Keep an unsaved keybindings draft unsaved on Add
- Redact each record before the ring keeps it
- Keep the TODO rows of a dirty file out of a folder store
- Scan a repository that the git extension opens later
- Reload editor threads on outside writes and HEAD moves
- Link the login keychain into the temporary test home on macOS
- Save comments with Ctrl+Enter under a keymap extension
- Focus the comment box of a new editor on VS Code 1.101
- Mark the preview blocks of comments of earlier commits
- Comment on the selection of the rich Markdown editor
- Keep review preview links away from the webview host
- Keep the review box focused and wait for the page script
- Keep the box focused after a rich editor selection
- Open the source before the rich editor comes back
- Close the temporary tab after the source has the focus
- Select whole source lines for a preview selection
- Wait for the source group before the box from the rich editor
- Show the last page build in the review preview
- Keep a commit refused only when git says it does not exist
- Read the rows of the newest scan after a refresh
- Apply the waiting edit overlays before a refresh scans
- Put thread glyphs back on their lines after a file reload
- Give the source selection back when the comment box takes the focus
- Send the last page again when the webview host keeps it hidden
- Open a draft editor for a new comment on a line with a thread
