# What this changes

Say what the code does now that it did not do before. Write two or three sentences.

# Why

Say what was wrong before this change. Link the issue it closes, for example `Closes #12`.

# How a reviewer sees it

Name the place in the user interface, or the test, where the change shows. Say which
command a reviewer runs to see it.

# Before you ask for a review

- [ ] `./gradlew test :channel-server:test` passes with zero failures.
- [ ] `./gradlew verifyPlugin` passes.
- [ ] `CHANGELOG.md` carries an entry under `## [Unreleased]`, for a change a user can see.
- [ ] The commit messages follow Conventional Commits, and they carry no attribution line.
- [ ] Every new comment and every new string follows Simplified Technical English.
