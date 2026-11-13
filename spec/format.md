# Yreview format specification

This file states the rules that the IntelliJ plugin and the VS Code extension both keep.
The files in `spec/vectors/` hold the inputs and the expected outputs of these rules. Both
builds run them. If this text and a vector differ, the vector is correct, and this text
gets a fix in the same pull request.

The Kotlin source of the plugin is the reference implementation. Each section names the
source files that hold its rule. All plugin paths start at
`src/main/kotlin/com/yeskiy/yreview/`. The channel server paths start at
`channel-server/src/main/kotlin/com/yeskiy/yreview/channel/`.

## 1. Note refs

Source: `store/NoteRefs.kt`, `store/NotesGateway.kt`.

| Ref | Use | Pushed |
|---|---|---|
| `refs/notes/y-review/local` | Local comments | No |
| `refs/notes/devtools/discuss` | Shared comments | Yes, to the chosen remote |
| `refs/notes/devtools/analyses` | Read only | No |
| `refs/notes/y-review/scratch/<uuid>` | Temporary ref of one write | No, deleted after the write |

A reader reads the three refs in this order: `discuss`, `analyses`, `local`. A new local
comment goes to `refs/notes/y-review/local`, and a new shared comment goes to
`refs/notes/devtools/discuss`. The ref alone tells a local comment from a shared one. No
field of the record holds that fact. `refs/notes/devtools/discuss` is the ref of
git-appraise, so the `git appraise` tool reads the same notes.

## 2. Note layout

Source: `store/NotesGateway.kt`, `store/CommentStore.kt`.

One record is one JSON object on one line. `git notes append` puts a blank line between two
records. A rewrite joins the records with `\n\n` and ends with `\n`. A reader splits the note
text at `\r\n`, `\r` and `\n`, and drops each line that is blank by the Kotlin rule
(`isBlank`, section 9). Vectors: `notes.json`.

A reader decodes each line that stays (section 3). A line that does not decode gives no
record, and the other lines of the note still give their records. A rewrite keeps every line
that it does not remove byte for byte, also a line that does not decode.

## 3. The record

Source: `store/Comment.kt`.

| Field | Type | Required | Meaning |
|---|---|---|---|
| `timestamp` | string | Yes | The seconds since 1970, as decimal text |
| `author` | string | Yes | The value of `git config user.email` at the moment of the write |
| `description` | string | No | The text of the comment |
| `parent` | string | No | The identifier of the comment that this record answers |
| `original` | string | No | The identifier of the comment that this record changes. A resolve record sets it. |
| `resolved` | boolean | No | `true` in the record that closes a comment |
| `location` | object | No | The place of the comment |
| `location.commit` | string | Yes, in `location` | The commit that the comment belongs to. The folder store writes `worktree` (section 8). |
| `location.path` | string | Yes, in `location` | The file, relative to the repository root, with `/` |
| `location.range` | object | No | The lines and columns. With no range, the comment names the whole file. |
| `location.range.startLine` | integer | Yes, in `range` | The first line |
| `location.range.startColumn` | integer | No, default 0 | The column of the start |
| `location.range.endLine` | integer | Yes, in `range` | The last line |
| `location.range.endColumn` | integer | No, default 0 | The column of the end |
| `v` | integer | No, default 0 | The format version. The value is 0 today. |

The Kotlin decoder (`CommentJson.decode`) applies these type rules. A reader in another
language must give the same result for each line.

| Input | Result |
|---|---|
| A line that is not one JSON object, or that has text after the object | Refused |
| A key with single quotes, or any other syntax outside strict JSON | Refused |
| `timestamp` or `author` is missing, or holds `null` | Refused |
| `location` holds an object with no `commit` or no `path` | Refused |
| `range` holds an object with no `startLine` or no `endLine` | Refused |
| A string field holds a number, a boolean, an object or an array | Refused |
| `description`, `parent`, `original`, `resolved`, `location` or `range` holds `null` | Accepted. The field is absent. |
| `startColumn`, `endColumn` or `v` holds `null` | Refused |
| An integer field holds a number with a fraction (`1.5`, also `1.0`) | Refused |
| An integer field holds a number outside the signed 32-bit range | Refused |
| An integer field holds an exponent that gives a whole number (`1e0`) | Accepted as that number |
| An integer field holds a quoted number (`"2"`) | Accepted as that number |
| `resolved` holds a quoted boolean (`"true"`) | Accepted as that boolean |
| An unknown key, with any value | Accepted. The key is dropped. |
| The same key two times | Accepted. The last value wins. |

Lines and columns: lines are one-based. Columns are zero-based UTF-16 code units, and the
end column is exclusive. A comment on whole lines writes no column. The selection rule is
`CommentRange.of` (section 3.1 below).

### 3.1 Whole lines or a part of a line

Source: `action/CommentRange.kt`.

A selection names whole lines when it is empty (a caret), or when it starts at column 0 and
ends at column 0 or at the end of its last line. Otherwise it names both columns.

The end of the last line is the length of that line in UTF-16 code units, without the line
break. A range of whole lines keeps both columns at 0, so the encoder leaves them out
(section 4, rule 2).

## 4. Canonical encoding and the record identifier

Source: `store/Comment.kt` (`CommentJson.encode`, `Comment.id`).

The Kotlin encoder decodes a line, drops unknown fields, and encodes again. Another encoder
must give the same bytes. The rules:

1. Write the keys in this order: `timestamp`, `author`, `description`, `parent`, `original`, `resolved`, `location`, `v`. Inside `location`: `commit`, `path`, `range`. Inside `range`: `startLine`, `startColumn`, `endLine`, `endColumn`.
2. Leave out a key whose value is absent. Leave out `startColumn` and `endColumn` when the value is 0. Leave out `v` when the value is 0. Keep `resolved: false` when a record holds it.
3. Drop every unknown key. For this reason a future field never changes an identifier, and the spec must say so.
4. Write no white space.
5. Escape `"` and `\`. Escape U+0008, U+0009, U+000A, U+000C, U+000D as `\b \t \n \f \r`. Escape the other characters below U+0020 as `\u00xx` with lowercase hex. Write every other character as itself, `/` and U+007F and U+2028 included.
6. Refuse a lone surrogate on write. Java encodes it to `?` and JavaScript escapes it, so the two identifiers differ. A reader that meets one keeps the record and takes the identifier that the Kotlin rule gives (the vector file holds that value).

A future field never changes an identifier, because rule 3 drops it before the hash.

The identifier is the lowercase hex SHA-1 of the UTF-8 bytes of the canonical encoding.
A lone surrogate becomes `?` before the bytes are made, because Java does that. A reader
that cannot decode a line keeps no record for it. Vectors: `records.json`.

The identifier comes from the canonical encoding and not from the stored line. Two lines
that differ only in key order, white space, escapes or unknown keys therefore have the same
identifier.

## 5. Resolve and delete

Source: `store/CommentStore.kt` (`CommentBook.resolve`, `CommentBook.remove`).

A resolve appends a second record with `original` set to the identifier of the comment,
`resolved: true`, and the `location` of the comment. A comment is closed when a record of
the same note holds `original` equal to its identifier and `resolved: true`. A record with
`original` is never a task of its own. A delete rewrites the note without the line of the
comment and without each record whose `original` names it.

The resolve record has a new `timestamp` and the `author` of the person who resolves. It
has no `description` and no `parent`. The resolve record goes to the same ref and the same
commit as the comment. A delete keeps no copy of the removed lines.

## 6. Write protocol

Source: `store/NotesGateway.kt`, `store/GitAuthor.kt`.

1. Take a lock for the pair (common git dir, ref). The common git dir is the output of
   `git rev-parse --path-format=absolute --git-common-dir`.
2. Read the tip with `git rev-parse -q --verify <ref>`. No output means that the ref does
   not exist.
3. Create `refs/notes/y-review/scratch/<uuid>` at the tip (skip when the ref does not exist).
4. Write the note on the scratch ref (`append -F <file>`, `add -f -F <file>`, or
   `remove --ignore-missing`).
5. Run `git update-ref <ref> <scratch tip> <old tip>` (an empty old tip when the ref did not
   exist).
6. When step 5 fails and the ref moved, start again at step 2. Stop after 5 tries with an
   error. When step 5 fails and the ref did not move, stop with the git error.
7. Delete the scratch ref with `git update-ref -d` in every case.

The lock of step 1 serializes the writers of one editor process. Two worktrees of one
repository share the note refs, so the lock key is the common git dir and not the worktree.
The `update-ref` of step 5 protects against every other writer.

Step 4 gives the note text to git through a temporary file, never through a command line
argument. An append writes one record. A rewrite reads the note again in each try of step 2,
applies its change, and writes the result. A rewrite with no lines removes the note of that
commit. A rewrite that changes no line writes nothing. When step 4 leaves the scratch ref
with no commit, the write stops with an error.

A read that git could not start stops a write with an error. A note that does not exist is
an empty note, not an error.

The author of a new record is the output of `git config user.email`. With no value, the
write stops with an error, and reads still work.

## 7. Sharing

Source: `store/NotesSharing.kt`, `store/GitValuePattern.kt`, `store/RefspecPrompt.kt`.

A shared comment goes to the remote with `git push <remote> refs/notes/devtools/discuss`.
After a good push, the editor checks `remote.<name>.fetch`. When the list does not hold
`refs/notes/devtools/*:refs/notes/devtools/*`, or holds the forced form with a leading
`+`, the editor asks the user once for each repository in a session. The answer
"Do not ask again" is kept for that repository. Only the button Add changes `.git/config`.
It removes the forced form with the exact value pattern (`GitValuePattern.exactly`) and adds
the plain form once. The plain form makes git refuse a fetch that would drop a local note.

| Item | Value |
|---|---|
| Default remote | `origin`. A blank setting also gives `origin`. |
| Plain form | `refs/notes/devtools/*:refs/notes/devtools/*` |
| Forced form | `+refs/notes/devtools/*:refs/notes/devtools/*` |
| Read of the list | `git config --get-all remote.<name>.fetch`, each value trimmed |
| Exact value pattern | `^` + the value with a backslash before each pattern character + `$` (see below) |
| Removal | `git config --unset-all remote.<name>.fetch <pattern>`. Exit code 5 (no value matched) is no error. |
| Addition | `git config --add remote.<name>.fetch <plain form>`, only when the list does not already hold it |

The pattern characters are the 14 characters of `GitValuePattern.SPECIAL`:
`\^$.[]|()*+?{}`. The pattern of the forced form is therefore
`^\+refs/notes/devtools/\*:refs/notes/devtools/\*$`.

The editor asks only when the setting "Add the notes refspec to the git configuration" is
on, and only when `git remote get-url <remote>` succeeds. When git cannot start for the read
of the list, the editor does not ask. The IntelliJ plugin keeps the "Do not ask again"
answers in `.idea/y-review.xml`.

The refspec has no plus, so a fetch does not overwrite a local note ref that has notes that
no push carried. Git then refuses the non-fast-forward update of that ref, and the user
joins the two histories with `git notes merge`.

## 8. Folder store

Source: `store/FolderNotes.kt`, `store/AnchorRules.kt`.

A file that no git repository holds keeps its comments in a folder store. The file of one
ref is `<root>/.y-review/notes/<ref with / as ->/worktree.jsonl`. For example, the local
ref gives `<root>/.y-review/notes/refs-notes-y-review-local/worktree.jsonl`. The name
`worktree` is the key of the records, and the records write `worktree` as
`location.commit`. The key is not hexadecimal, so it is never a commit.

| Rule | Detail |
|---|---|
| Lines | One record per line, in the same canonical form that a git note holds. A write joins the lines with `\n` and ends with `\n`. |
| Read | UTF-8. The reader splits at `\r\n`, `\r` and `\n`, and drops each blank line. A file that does not exist holds no record. A file that is not valid UTF-8 stops a write with an error. |
| Write | The writer reads every record first, then writes a temporary file in the same folder and moves it over the old file. A write with no lines deletes the file. |
| Keys | The keys of a ref are the names of the `.jsonl` files in its folder, without the suffix. |
| Root | The project folder when it holds the file. Else the longest content root that holds the file. |
| Repository first | The innermost git repository that holds a file wins. A file inside a repository never goes to a folder store, also when that repository has no commit yet. |

When a git repository starts to hold a folder store, the plugin moves the records into the
git notes and puts the old folder at `<git dir>/y-review/migrated-<milliseconds>`.

## 9. TODO identifier

Source: `tasks/ReviewTask.kt` (`TaskIds.forTodo`, `TaskIds.normalTodoText`), `tasks/TodoIds.kt`.

`todo-` + hex SHA-1 of the UTF-8 bytes of `repository + "\n" + path + "\n" + normal` +
`-` + order.

| Part | Rule |
|---|---|
| repository | `TodoIds.repositoryOf(projectFolder, root)`: `""` when the root is the project folder, the part after `projectFolder/` when the root is inside it, else the full root path. With no project folder, or an empty one, the full root path. |
| path | The file path relative to the repository root, with `/`. |
| normal | The text trimmed with the Kotlin `trim()` set, then each run of `[ \t\n\x0B\f\r]` replaced by one space. The Kotlin `trim()` set is every character for which `Character.isWhitespace` or `Character.isSpaceChar` is true. It holds U+001C to U+001F and U+00A0, and it does not hold U+FEFF. |
| order | The count of earlier items of the same file, in source order, with the same normal text. |

The Kotlin `trim()` set also holds U+2028 and U+3000, and it does not hold U+0085 and
U+200B. The run replacement uses the six ASCII characters only, so a U+00A0 inside the
text stays. The hex is lowercase. The order is a decimal number with no leading zero.

The line is not part of the identifier, so a line move keeps it. The older form
`todo-<sha1(path)>-<line>` stays readable: a task file of version 1 holds it, and the
migration of section 11 maps it. Vectors: `todo-ids.json`.

The older form is `todo-` + lowercase hex SHA-1 of the UTF-8 bytes of the path + `-` + the
line (`TaskIds.legacyTodo`).

## 10. Identifier syntax and short handles

Source: `tasks/ReviewTask.kt` (`TaskIds`), `tasks/TaskHandles.kt`.

| Name | Pattern | Use |
|---|---|---|
| Safe | `^[A-Za-z0-9_-]{1,200}$` | Every identifier that the plugin gives out |
| Comment | `^[0-9a-f]{40}$` | The record identifier of section 4 |
| TODO | `^todo-[0-9a-f]{40}-[0-9]{1,7}$` | The TODO identifier of section 9 |
| Handle | `^y[a-z0-9]{2,32}$` | The short handle |

A long identifier is a comment identifier or a TODO identifier. A known identifier is a long
identifier or a handle. A value that starts with `todo-` is a TODO value.

A handle is `y` + the Sqids encoding of a list of numbers. The encoder has these settings:

| Setting | Value |
|---|---|
| Alphabet | `abcdefghijklmnopqrstuvwxyz0123456789` |
| Block list | Empty |
| Minimum length | The library default (0) |

The key is the first 8 hex characters of the digest, read as an unsigned number from 0 to
0xffffffff. For a comment, the digest is the identifier itself. For a TODO identifier, the
digest is the 40 characters after `todo-`.

| Input of `TaskHandles.of` | Output |
|---|---|
| A comment identifier | `y` + Sqids of [key] |
| A TODO identifier | `y` + Sqids of [key, order] |
| Any other value, a handle included | The same value, unchanged |

`TaskHandles.keyOf(text)` reads a value that an agent sends:

| Input | Key |
|---|---|
| A long identifier | Exact, with the identifier |
| A handle that decodes to one number from 0 to 0xffffffff | Comment prefix: the number as 8 lowercase hex characters, with leading zeros |
| A handle that decodes to two numbers, each from 0 to 0xffffffff | TODO prefix: the first number as 8 lowercase hex characters, and the second number as a signed 32-bit integer |
| A handle that decodes to no number, to more than two numbers, or to a number outside that range | None |
| Any other text | None |

`TaskHandles.match(key, ids)` searches a list of known long identifiers:

| Key | An identifier matches when |
|---|---|
| Exact | It is equal to the identifier of the key |
| Comment prefix | It does not start with `todo-`, and it starts with the prefix |
| TODO prefix | It starts with `todo-` + the prefix, and the number after its last `-` is equal to the second number |

The match removes duplicate identifiers first. No identifier gives the answer None, one
identifier gives One with that identifier, and more give Many with the count. A caller that
gets Many closes nothing and asks for the long identifier. A second number of 2^31 or more
becomes negative as a signed 32-bit integer, so it matches no identifier. Vectors:
`handles.json`, `match.json`.

## 11. Task document

Source: `tasks/ReviewTask.kt` (`TaskDocument`, `TaskJson`), `tasks/TodoIds.kt`
(`TodoMigration`), `handoff/HandoffFiles.kt`, `handoff/SentTasks.kt`.

`tasks.json` is `TaskDocument` version 2: `version`, `repository`, `commit`, `generated`,
`tasks`. The fields of the document:

| Field | Type | Meaning |
|---|---|---|
| `version` | integer | 2. A file with no `version` reads as 2. |
| `repository` | string | The absolute path of the repository root, with `/` |
| `commit` | string | The head commit of the repository, or `worktree` for a folder store |
| `generated` | string | The time of the send, ISO 8601 in UTC, whole seconds (`2026-11-14T10:00:00Z`) |
| `tasks` | array | The tasks, each one an object of the table below |

The fields of one task:

| Field | Type | Meaning |
|---|---|---|
| `id` | string | The short handle of the task (section 10). A file of an older build holds the long identifier. |
| `kind` | string | `comment` or `todo` |
| `path` | string | The file, relative to the repository root, with `/` |
| `startLine` | integer | The first line |
| `startColumn` | integer, optional | The start column of a comment on a part of a line |
| `endLine` | integer | The last line |
| `endColumn` | integer, optional | The end column of a comment on a part of a line |
| `text` | string | The comment text or the TODO text |
| `pattern` | string, optional | The TODO pattern that matched |
| `author` | string, optional | The author of a comment |

The writer writes indented JSON with 4 spaces, leaves out each optional field that has no
value, and ends the file with `\n`. Before the write, the text of each task loses every
character from U+0000 to U+001F and from U+007F to U+009F, except the tab, the carriage
return and the line feed. The writer writes a temporary file and moves it over the old one.
The reader drops unknown keys, and it reads nothing from a file larger than 4,194,304 bytes.

A file of version 1 is migrated once: each TODO entry whose identifier or handle is the
older form for its path and line gets the identifier (or handle) of the open item at that
path and line. When two items share the line, the one with the same normal text wins.
Other entries stay. An agent can still report an older handle, and it names the same entry.

More detail of the migration (`TodoMigration.migrate`):

1. The open items are the open TODO items of the repository that `repository` names.
2. An entry has the older form when `TaskHandles.of` of its `id` is equal to
   `TaskHandles.of` of the older form for its `path` and `startLine`.
3. When exactly one open item is at that path and line, that item wins. Else, when exactly
   one of them has the same normal text as the entry, that item wins. Else the entry stays.
4. An entry that held a handle gets the handle of the winner. An entry that held a long
   identifier gets the long identifier of the winner.
5. The document gets `version` 2, also when no entry changed.

## 12. Window folder and discovery file names

Source: `bridge/DiscoveryFile.kt`, `handoff/HandoffPlace.kt`, `handoff/GitDir.kt`.

Both names replace each character outside `[A-Za-z0-9]` with `-`. The replacement goes by
Unicode code point, the way the Java regular expression engine reads a string. A character
outside the Basic Multilingual Plane (two UTF-16 code units) therefore gives one `-`, and
a lone surrogate also gives one `-`. The hash reads the UTF-8 bytes of the whole path, with
`?` in place of a lone surrogate. The hex is lowercase. Vectors: `names.json`.

The discovery file name (`DiscoveryFile.fileName(projectPath)`):

1. Replace each character of the project path as stated above.
2. Keep the last 58 characters of the result.
3. Add `-`, then the first 8 bytes of the SHA-256 of the path as 16 hex characters.
4. Add `.json`.

The name has 80 characters or fewer. The file is
`<home>/.y-review/bridge/<name>`. The home folder is the value of `USERPROFILE` when that
value is set and not blank, else the Java `user.home` value.

The window folder name (`HandoffPlace.window(projectPath)`):

1. Take the part of the project path after the last `/` or `\`.
2. Replace each character of that part as stated above.
3. Keep the last 24 characters of the result. An empty result becomes `project`.
4. Add `-`, then the first 4 bytes of the SHA-256 of the whole path as 8 hex characters.

The window folder is `<git dir>/y-review/<window>/` in a git repository. The git dir is the
output of `git rev-parse --absolute-git-dir`. In a folder store, the window folder is
`<root>/.y-review/<window>/`.

The two editors keep these files apart, because both editors can open one folder:

| File | IntelliJ | VS Code |
|---|---|---|
| Bridge discovery file | `~/.y-review/bridge/<name>.json` | `~/.y-review/bridge/vscode/<name>.json` |
| Handoff window folder | `<git dir>/y-review/<window>/` | `<git dir>/y-review/vscode-<window>/` |
| MCP config file | `~/.y-review/mcp/<agent>-<IDE code>.json` | `~/.y-review/mcp/<agent>-vscode.json` |

In this table, `<name>` is the discovery file name without `.json`. The name rules of both
editors are the same, so the vectors cover both.

## 13. Bridge protocol

Source: `bridge/BridgeServer.kt`, `bridge/BridgeToken.kt`, `bridge/SessionKey.kt`,
`bridge/StreamQueue.kt`, `bridge/ResolveRequest.kt`, `bridge/ReviewBatch.kt`,
`bridge/BatchBuilder.kt`, `bridge/DiscoveryFile.kt`, and the channel server files
`BridgeClient.kt`, `Config.kt`, `Schema.kt`.

The bridge is an HTTP server on `127.0.0.1`, on a port that the operating system picks.

| Item | Rule |
|---|---|
| Token | 32 random bytes as 64 lowercase hex characters. The server makes a new token at each start. |
| Token header | `X-Y-Review-Token`. The server compares the SHA-256 digests of the two values in constant time. An empty value matches nothing. |
| Session header | `X-Y-Review-Session`. A value of 8 to 64 characters of `[A-Za-z0-9-]` names a session. Any other value names no session, and the request goes on with no session. |
| Session key | 8 random bytes as 16 lowercase hex characters. The agent session gets it in the variable `Y_REVIEW_SESSION_KEY`. |
| Bridge file variable | `Y_REVIEW_BRIDGE_FILE` names the discovery file for the channel server |
| Errors | `text/plain; charset=utf-8`, with a sentence that names the problem |

The discovery file holds one JSON object on one line:

| Field | Type | Meaning |
|---|---|---|
| `url` | string | `http://127.0.0.1:<port>` |
| `token` | string | The token |
| `projectPath` | string | The project path that the file name comes from |
| `pid` | integer | The process identifier of the editor |

The writer writes a temporary file, sets the rights `rw-------` where the file system has
POSIX rights, and moves the file over the old one. The channel server refuses a file larger
than 65,536 bytes, a `url` that does not use `http`, a host that is not a loopback name
(`localhost`, `::1`, or an IPv4 address that starts with `127.`), and a token shorter than 16
characters. It drops unknown keys.

`GET /events` gives Server-Sent Events:

| Step | Rule |
|---|---|
| Checks | In this order: a path that is not exactly `/events` gives 404, a bad token gives 401, a method other than `GET` gives 405, and 16 open streams give 503. |
| Start | Status 200, `Content-Type: text/event-stream`, `Cache-Control: no-store`, then `: open\n\n` |
| Batch | `data: <batch JSON>\n\n`, one batch on one line |
| Keep-alive | `: keep-alive\n\n` after 20 seconds with no batch |
| Queue | 64 batches for each stream. A stream with a full queue loses each new batch and keeps the old ones. |
| Loss line | Before the next write: `: the bridge dropped <n> event for this session, because it read none\n\n`, with `events` when `<n>` is not 1 |
| Target | A send goes to the streams of one session key, or to every stream when it names no session |

`POST /resolve` reports the finished tasks:

| Step | Rule |
|---|---|
| Checks | In this order: a path that is not exactly `/resolve` gives 404, a bad token gives 401, and a method other than `POST` gives 405. |
| Body size | The server reads 1,000,001 bytes at most. A body of more than 1,000,000 bytes gives 413. A body that the server cannot read gives 400. |
| Body | A JSON object with the key `ids` and no other key. `ids` is an array of 1 to 200 strings, and each string is a known identifier (section 10). Any other body gives 400. |
| Duplicates | The server removes duplicate ids before it uses them. |
| Answer | 200 with the text `ok` when the editor recorded the report. 409 with the reason when the editor refused it. 500 with the reason when the editor failed. |
| Other paths | Any path outside `/events` and `/resolve` gives 404. |

| Status | Meaning |
|---|---|
| 200 | The stream is open, or the report is recorded |
| 400 | The body cannot be read or breaks the body rule |
| 401 | The token does not match |
| 404 | The path is not part of the bridge |
| 405 | The method is wrong for the path |
| 409 | The editor refused the report, for example for an unknown or ambiguous id |
| 413 | The body is larger than 1,000,000 bytes |
| 500 | The editor failed to write the resolution |
| 503 | 16 streams are open already |

A batch (`ReviewBatch`) has these fields, in this order. A field with no value is left out.

| Field | Type | Rule |
|---|---|---|
| `batchId` | string | 12 lowercase hex characters from 6 random bytes. The channel accepts 1 to 200 characters of `[A-Za-z0-9_-]`. |
| `branch` | string | The branch name with each control character removed, cut to 255 UTF-16 code units. An empty result becomes `HEAD`. |
| `commit` | string | The head commit. It must match `^[A-Za-z0-9._/-]{1,200}$`, or the send drops every task. |
| `comments` | array | 1 to 200 comments |
| `comments[].id` | string | The short handle. It must match `^[A-Za-z0-9_-]{1,200}$`. |
| `comments[].path` | string | 1 to 1024 UTF-16 code units, with no character from U+0000 to U+001F or from U+007F to U+009F |
| `comments[].startLine` | integer | Limited to 0 to 10,000,000 |
| `comments[].startColumn` | integer, optional | Limited to 0 to 10,000,000 |
| `comments[].endLine` | integer | Limited to 0 to 10,000,000 |
| `comments[].endColumn` | integer, optional | Limited to 0 to 10,000,000 |
| `comments[].revision` | string | It must match `^[A-Za-z0-9._/-]{1,200}$` |
| `comments[].side` | string, optional | `left` or `right` |
| `comments[].text` | string | The task text with the control characters of section 11 removed, trimmed, and cut to 20,000 UTF-16 code units. A cut never leaves a lone high surrogate at the end. |

The builder (`BatchBuilder.build`) leaves out a task with a bad identifier, a bad revision,
a bad path, or an empty text after the filter. It reports each such task in
`BatchPlan.dropped`. It puts 200 comments or fewer in one batch. It also keeps each event
at 4,000,000 characters or fewer, counted as the batch JSON with a 200-character `batchId`,
plus 8 characters of frame, plus the JSON of each comment and 1 character for each comment.

The channel server reads the batch with a strict schema: an unknown key, a bad type, or a
value outside a rule above drops the whole batch. The client connects again 1 second after a
stream ends. It waits 10 seconds at most for a connection and 60 seconds at most for a
`POST /resolve`. It follows no redirect, and it takes a status from 200 to 299 as success.

The client reads the stream as follows. It changes `\r\n` to `\n` and splits at each blank
line. In each block, it keeps the lines that start with `data:`, removes `data:` and one
space after it, and joins the lines with `\n`. An empty result is no event. A comment line
that starts with `:` is therefore never an event.

### 13.1 Routes of the VS Code bridge only

Source: `mcp/ReviewPayloads.kt` for the answer fields. The VS Code extension holds the
routes.

These four routes are on the VS Code bridge only. The IntelliJ bridge does not have them,
because the IntelliJ plugin gives the same four tools through the IDE MCP server. They use
the token header and the session header of section 13. Each answer is one JSON object.

| Route | Method | Body | Answer |
|---|---|---|---|
| `/comments?resolved=&analyses=&local=` | GET | none | `{ "comments": [CommentRow] }` |
| `/comments` | POST | `{ path, startLine, endLine, text }` | `{ id, path, revision, shared }` or `{ error }` |
| `/comments/resolve` | POST | `{ id }` | `{ id, resolved: true }` or `{ error }` |
| `/comments/open` | POST | `{ id }` | `{ id, opened, path, line, revision }` or `{ error }` |

A `CommentRow` has these fields, in this order: `id` (the short handle), `path`,
`startLine`, `startColumn` (optional), `endLine`, `endColumn` (optional), `revision`,
`author`, `text`, `shared`, `resolved`. In the answer of `/comments/open`, `opened` is a
string and `line` is an integer. Each `{ error }` answer holds one string field `error`.

## 14. Channel text

Source: channel server `Format.kt`, `BridgeClient.kt`, `ReviewChannel.kt`, `Schema.kt`, and
`bridge/BatchBuilder.kt` of the plugin.

The channel server is a stdio MCP server with the name `y-review`. It declares the
experimental capability `claude/channel`. It sends each batch as the notification
`notifications/claude/channel` with the params `content` and `meta`. It gives the tool
`review_resolve`, which posts to `/resolve`.

| Rule | Detail |
|---|---|
| Header line | `[<id>] <path>:<range> @<revision>`, then ` (left side of the diff)` when `side` is `left` |
| Range | `<startLine>:<startColumn>-<endLine>:<endColumn>` when one column is not 0, else `<startLine>-<endLine>`. An absent column counts as 0. |
| Revision | `HEAD` when the revision is `HEAD` or equal to the `commit` of the batch, else the first 7 characters of the revision |
| Quoted body | Each comment body line starts with `> ` (a blank line gets `>`). A body line therefore never looks like a comment header. Line breaks `\r\n`, `\r`, U+2028, U+2029 become `\n`. Control characters except `\n` and `\t`, and C1 controls U+0080 to U+009F, are removed. The body is trimmed. |
| Body place | The body follows the header after `\n`. An empty body gives the header alone. |
| Content | The comments of the batch, joined with `\n\n` |
| Meta | `branch`, `commit`, `count` (the number of comments as text), `batch_id`. Each value loses `"` and each character below U+0020 and U+007F. An empty value is left out. A key outside `^[A-Za-z0-9_]+$` is left out. |
| Empty batch | A batch with no comment sends no notification. |
| Event size | `MAX_EVENT_CHARS` is 4,000,000 in both copies. `BatchBuilder` splits the tasks into batches of 200 comments or fewer, with each SSE event (frame included) under that limit. |
| Dropped tasks | `BatchBuilder` leaves out a task with a bad identifier, revision, path or an empty filtered text, and reports it in `BatchPlan.dropped`. The send report never reports success when nothing was sent. |
| Lost events | The client skips an event over the limit to its end. An event that is not JSON or breaks the contract is dropped. Each loss goes to the log and to the agent as a channel notification with `meta.notice = "lost"` and the text `ReviewChannel.LOST_TEXT` plus the reason. |
| Lost text | `content` is `LOST_TEXT` + ` Reason: ` + the reason without its last periods + `.` |
| Instructions | The server instructions say that `>` lines are comment text and that a `notice` event carries a message from the channel. The text is in `ReviewChannel.kt` and the port copies it. |

The text of the instructions is `ReviewChannel.INSTRUCTIONS`, and the text of the tool
description is `ReviewChannel.RESOLVE_DESCRIPTION`. A port copies both word for word.

The tool `review_resolve` takes `ids`, an array of 1 to 200 strings of 1 to 200 characters.
Any other input gives the error text `ReviewChannel.BAD_INPUT`. The server keeps the ids of
the last 32 batches that it sent. Each given id finds its comment as follows:

1. When the server holds no open id, the given id goes to the editor unchanged.
2. An open id that is equal to the given id wins.
3. Else, exactly one open id that starts with the given id wins.
4. Else no open id gives "unknown", and more than one gives "ambiguous".

The server posts the distinct winners to `/resolve`. After a good post, it forgets those
ids. When no id wins, the server posts nothing and answers with an error.

## 15. Differences between the editors

The record identifier depends only on the record bytes. The TODO identifier depends only on
the repository part, the repository-relative path, the normal text and the order. The
handle depends only on the identifier. None of them depends on the editor. A comment
written in VS Code therefore shows the same handle in IntelliJ, and an agent that reports a
handle closes it in either editor. These differences stay:

| Difference | Effect |
|---|---|
| The TODO scan differs. IntelliJ reads the TODO index, which skips string literals. VS Code reads the text. | A TODO in a string literal has an identifier in VS Code and none in IntelliJ. If it has the same text as a later real TODO of the file, the order of that later item differs between the editors. |
| IntelliJ takes the TODO text from its index range, and joins the continuation lines of a multi-line TODO with `\n`. VS Code takes one line. | A one-line TODO that both editors find has one identifier when both extract the same text. A multi-line TODO gets two identifiers. |
| The repository part names the project folder. IntelliJ uses `project.basePath`, VS Code uses the workspace folder that holds the repository. | Equal when both editors open the same folder. A root outside the folder uses the full path, which differs between machines. |
| Kotlin `trim()` and JavaScript `trim()` remove different characters (U+001C to U+001F, U+FEFF). | The TypeScript port uses the Kotlin character set. Vectors in `todo-ids.json` cover each character. |

## 16. Vectors

| File | Content |
|---|---|
| `spec/vectors/records.json` | `[{ "name", "line", "canonical", "id" }]`. Record lines with their canonical encoding and identifier (sections 3 and 4). A line that the Kotlin decoder refuses has `canonical` and `id` set to `null`. |
| `spec/vectors/todo-ids.json` | `repositoryOf` cases, `normal` text cases (each Kotlin trim and split edge), `forTodo` cases `{ repository, path, text, order, id }`, `assign` cases (texts in source order to identifiers), and `legacy` cases `{ path, line, id }` (section 9). |
| `spec/vectors/handles.json` | `of` cases `{ id, handle }` and `keyOf` cases `{ text, key }`, with the key edge values 0 and 0xffffffff, a TODO order of 0, 1 and 9999999, and handles that decode to nothing (section 10). |
| `spec/vectors/match.json` | `TaskHandles.match` cases: one, none, many (section 10). |
| `spec/vectors/notes.json` | Raw note texts (blank lines, CRLF, a trailing newline, a broken line) and the records that a reader keeps (section 2). |
| `spec/vectors/names.json` | Discovery file names and window folder names for given paths, Windows and POSIX (section 12). |
| `spec/vectors/redact.json` | `{ name, input, homes, projects, repositories, output }` for `Redact.text(value, homes, projects, repositories)`. The rule removes every project path, every repository root and every home folder (longest first, case-insensitive, both slash forms, WSL spelling), then remotes, mail addresses and secrets. A caller with a length cap cuts after the redaction. |
| `spec/vectors/agents.json` | The agent table of `AgentCatalog.ALL`: id, label, commands, push kind, MCP route, naming. |

The Gradle test `SpecVectorsTest` and the npm test `vscode/test/unit/vectors.test.ts` read
the same files. A change to a vector file changes both test runs in the same pull request.
