# How to contribute

Thank you for reading this. This project takes bug reports, feature requests, and pull
requests through the GitHub issue tracker at
https://github.com/yeskiy/yreview/issues .

Read the [Code of Conduct](CODE_OF_CONDUCT.md) first. It applies to every space of this
project.

Do not report a security weakness in a public issue. The [security policy](SECURITY.md)
holds the private route.

## Before you write code

Open an issue first for anything larger than a small fix. A short agreement about the shape
of the change saves both sides a rewrite. A pull request that arrives with no issue is
still welcome, but it may need more rounds.

## What you need

| Item | Version | Note |
|---|---|---|
| A Java Development Kit | 25 | Gradle resolves the toolchain on its own through the Foojay resolver. A JDK 17 or newer starts the Gradle daemon. |
| Git | Any current version | The plugin runs the `git` program of the machine, and the tests start real repositories. |
| An IDE | Optional | IntelliJ IDEA 2026.2 or newer opens the Gradle project. |

You need no Node.js and no local IntelliJ installation. The Gradle build downloads the
IntelliJ IDEA distribution it compiles against, about 1.6 GB on the first run.

## Build

```bash
./gradlew buildPlugin
```

The archive lands in `build/distributions/y-review-<version>.zip`.

Use `gradlew.bat` in place of `./gradlew` on Windows outside a POSIX shell.

## Test

The project holds two test sets. The plugin tests run against the IntelliJ Platform. The
channel server tests run in a plain JVM.

```bash
./gradlew test :channel-server:test
```

Both sets must pass with zero failures. The JUnit reports land in
`build/test-results/test` and in `channel-server/build/test-results/test`.

Run one class while you work on it.

```bash
./gradlew test --tests "com.yeskiy.yreview.store.NotesSharingTest"
```

## Start a sandbox IDE

```bash
./gradlew runIde
```

The task starts a second IntelliJ IDEA with the plugin installed. That IDE keeps its own
settings under `.intellijPlatform/sandbox`, so it never touches your daily IDE. Open any
git repository in it and try the change by hand.

## Check the plugin before you open a pull request

```bash
./gradlew verifyPluginProjectConfiguration verifyPluginStructure verifyPlugin
```

`verifyPlugin` runs the JetBrains Plugin Verifier against the supported IDE. It fails on a
compatibility problem, on a call to an internal platform method, and on a call to an
override-only method. The JetBrains Marketplace review team runs the same tool, so a red
verifier blocks a release. The run takes about three minutes and needs about 2 GB of free
disk space.

The verifier reports a call to an experimental platform method as a warning and not as a
failure. This plugin makes 22 such calls, mostly to the component inlay API, and the plugin
cannot draw a comment card inside the editor without them.

## The tests come first

Write the failing test, then write the code that makes it pass. Every behavior in this
repository arrived that way, and the review asks for it.

- A pure function gets a plain unit test.
- Anything that touches git gets a test that starts a real repository in a temporary
  folder. See `src/test/kotlin/com/yeskiy/yreview/store/NotesSharingTest.kt`.
- A test must name no real person, no real machine, and no real path. Use
  `reviewer@example.com` and a path such as `E:/work/demo-repo`.

## Code style

The project carries no linter configuration. Match the code that is already there.

| Rule           | Value                                                                              |
|----------------|------------------------------------------------------------------------------------|
| Language       | Kotlin, with the Kotlin coding conventions                                         |
| Indent         | Four spaces                                                                        |
| Line width     | 120 characters. A few lines pass it, and none passes 140.                          |
| Trailing comma | Yes, in a multi-line argument list                                                 |
| Visibility     | The smallest one that works. A value is public only when another package reads it. |
| Files          | One idea per file. A file that holds two unrelated classes gets split.             |

Write a KDoc block over a class and over any function whose reason is not plain from its
name. Say why the code does what it does, not what the next line does. Do not write a
comment that explains an edit, for example "changed X because Y". That reasoning belongs in
the commit message.

## Prose style

Every word a person reads follows Simplified Technical English, the standard ASD-STE100.
This covers code comments, string literals, documentation, commit messages, and pull
request text. It does not cover code, identifiers, command syntax, or file paths.

| Rule        | Do                                                                    | Do not                                                                             |
|-------------|-----------------------------------------------------------------------|------------------------------------------------------------------------------------|
| Voice       | Active. "The plugin writes the file."                                 | Passive with a known actor. "The file is written."                                 |
| Tense       | Simple. "The task starts the server."                                 | "The task will have started the server."                                           |
| Sentence    | One instruction per sentence, 20 words at most                        | Two instructions joined by "and"                                                   |
| Words       | The short common word: use, help, make sure, before, about, get, show | utilize, facilitate, ensure, prior to, regarding, obtain, demonstrate              |
| Names       | One name for one thing, kept to the end                               | Two names for the same thing                                                       |
| Punctuation | A period. A comma.                                                    | A semicolon. An em dash. A curly quote.                                            |
| Forms       | The full form, "do not" and "it is"                                   | Any short form that drops a letter                                                 |
| Adjectives  | A measured fact                                                       | A marketing word, for example the ones that mean smooth, strong, or without effort |

Write no marketing sentence, and open no paragraph the way a chat reply opens. Text that a
reader cannot decode gets a definition or a plainer word.

## Commit messages

The project follows [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/).

```
<type>: <description>

<body>
```

| Type       | Use it for                                            |
|------------|-------------------------------------------------------|
| `feat`     | A new behavior a user can see                         |
| `fix`      | A defect that a user can hit                          |
| `docs`     | Documentation only                                    |
| `test`     | A test only                                           |
| `refactor` | A change that keeps every behavior                    |
| `chore`    | Build files, dependencies, repository files           |
| `ci`       | The GitHub workflows                                  |
| `merge`    | A merge of a feature branch back into the main branch |

Add `!` after the type for a breaking change, for example `refactor!:`. A breaking change
is one that drops a setting, a stored value, or a field of the note format.

Rules for the description line.

1. Write it in the imperative, and start it with a lower case letter.
2. Keep it under 72 characters.
3. Write no period at the end.
4. Say what the commit does, not what file it touches.

Rules for the body.

1. Wrap it at 72 characters.
2. Start with the reason. Say what was wrong before this commit.
3. List the parts of the change as a bullet list, when there is more than one.
4. Write no attribution line of any kind, and name no tool that helped you write the code.

An example from the history of this repository.

```
feat: add a switch that hides the editor beside a maximized window

A maximized tool window always left a strip of editor, because the IDE
holds a minimum size for the splitter that the editor shares with every
tool window.

- add an application level switch, off by default
- write the registry key only for the step that moves the switch
- write the earlier size again after the user clears the box
```

## Pull requests

1. Fork the repository and branch from `main`.
2. Name the branch after the work, for example `fix/gutter-icon-on-empty-file`.
3. Keep one purpose per pull request.
4. Run `./gradlew test :channel-server:test verifyPlugin` before you open it.
5. Fill the pull request template.
6. Add an entry under `## [Unreleased]` in `CHANGELOG.md` for any change a user can see.

The GitHub workflow builds, tests, and verifies every pull request. A red run blocks the
merge.

## The license of your contribution

This project uses the Apache License 2.0. When you open a pull request, you agree that your
contribution goes out under that license. See [LICENSE](LICENSE).
