# Yreview

Yreview keeps review comments in git notes, in the git-appraise format. The comments stay
out of your files and out of your commits. The Yreview plugin for JetBrains IDEs reads and
writes the same notes, so one team can use both editors.

## Requirements

- git on the PATH, or the path in the setting `git.path`.
- A trusted workspace. Yreview runs git, and git reads the repository configuration.
