# Security policy

Yreview reads a git repository, writes git notes into it, opens a port on the loopback
interface, and starts an agent process. A weakness in this plugin therefore reaches the
source code of a user. Please report one in private, and please report one even when you
are not sure that it is real.

## How to report a weakness

Do not open a public issue for a weakness. Use the private form instead.

1. Open https://github.com/yeskiy/yreview/security/advisories/new .
2. Describe what an attacker can do, and describe the steps that show it.
3. Add the plugin version, the IDE build number, and the operating system.

GitHub keeps the report private. Only the maintainer of the repository reads it. This
project publishes no email address, so this form is the only private route.

If GitHub itself refuses the form, open a public issue that carries one sentence, "I need a
private channel for a security report", and nothing else. The maintainer then opens the
private thread.

## What a reporter can expect

| Step | Time |
|---|---|
| The maintainer confirms that the report arrived | 7 days |
| The maintainer says whether the report is accepted, and names the severity | 30 days |
| A fix reaches the JetBrains Marketplace, for an accepted report | 90 days |

This project has one maintainer and no company behind it. The times above are targets, not
a contract. The maintainer writes in the thread when a step needs longer.

The maintainer credits every reporter in the release notes, under the name the reporter
chooses. Say in the report if you want no credit.

Please give the maintainer 90 days before you make the report public. If the 90 days pass
with no fix and no answer, publish. A user needs the warning more than the project needs
the silence.

## Which versions get a fix

The plugin has one supported version, the newest one on the JetBrains Marketplace. A fix
goes into a new patch release. No older version gets a backport.

## What the plugin touches

Read this before you look for a weakness. Every item is a place where a defect matters.

| Surface | What it is | The guard today |
|---|---|---|
| The bridge server | An HTTP server on `127.0.0.1`, on a port the operating system picks. It holds two paths, `GET /events` and `POST /resolve`. | The server binds the loopback address only. Every request carries a bearer token of 32 random bytes from `SecureRandom`. The check compares SHA-256 digests with `MessageDigest.isEqual`, so the time it takes tells a caller nothing. A body over the limit gets status 413. |
| The discovery file | `~/.y-review/bridge/<mangled project path>.json`. It holds the bridge address and the bridge token. | The plugin writes the file under the user profile and never inside a repository. On a POSIX file system the plugin asks for the rights `rw-------`. On Windows the user profile folder keeps the file private. |
| The channel server | A separate Java process that the agent starts. It talks to the bridge over HTTP and to the agent over standard input and standard output. | The server reads the bridge address and the bridge token from the environment, never from a file and never from a command line. It refuses a URL whose scheme is not `http` and whose host is not a loopback address. The logging provider drops every record, so no log file can hold the token. |
| The agent command | The settings hold one command line. A shell runs it, and the shell loads the profile of the user. | The command is a value the user typed. The plugin quotes every argument as a literal string, so a path with a space reaches the agent unchanged. A user who can change this setting can already run a program on that machine. |
| The git notes | The plugin writes `refs/notes/y-review/local` and `refs/notes/devtools/discuss` in the repository of the user, and it pushes the shared ref to a git remote. | The plugin runs git through the Git4Idea runner, with an argument list and never with a shell string. |
| The git configuration | The plugin adds one fetch refspec to `remote.<name>.fetch` the first time you share a comment. | The plugin adds the line once, and it writes no other git setting. |
| The IDE Model Context Protocol tools | The plugin exposes the open comments to an agent that runs inside the IDE. | The tools read and resolve comments of the open project only. |
| The IDE registry | The maximize switch writes the key `ide.mainSplitter.min.size`. | The switch stands off by default. The plugin writes the earlier value again when the user clears the box. |

## What the plugin never does

- It sends no data to a server of the author. It has no such server.
- It opens no connection outside the loopback interface. The one exception is the git push
  of a shared comment, and that push goes to the remote of the user.
- It writes no token, no key, and no password into a repository, a log file, or a command
  line.

## What is out of scope

- A finding that needs the attacker to already run code as the user. Such an attacker owns
  the IDE, the git repository, and the discovery file already.
- A weakness in Claude Code, in git, or in the IntelliJ Platform. Report those to their own
  maintainers. Tell this project as well when the plugin makes the weakness worse.
- A finding against a fork or against a modified build.
