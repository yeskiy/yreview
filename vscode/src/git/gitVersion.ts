import type { GitResult } from './runner'

/** The runner puts --end-of-options before refs, and git knows it since 2.24. */
export const MIN_GIT: readonly [number, number] = [2, 24]

export const GIT_TOO_OLD = `Yreview needs git ${MIN_GIT.join('.')} or later. Install a newer git, or set the path to it in the setting git.path, then reload the window.`

/** The major, minor and patch numbers of `git --version`, for example "git version 2.55.0.windows.3". */
export const parseGitVersion = (text: string): readonly [number, number, number] | undefined => {
  const match = /^git version (\d+)\.(\d+)(?:\.(\d+))?/u.exec(text.trim())
  return match === null ? undefined : [Number(match[1]), Number(match[2]), Number(match[3] ?? '0')]
}

export const isSupportedGit = (version: readonly [number, number, number]): boolean =>
  version[0] > MIN_GIT[0] || (version[0] === MIN_GIT[0] && version[1] >= MIN_GIT[1])

/** Undefined for a git that Yreview can use, else the message for the user. */
export const gitProblem = (result: GitResult): string | undefined => {
  if (result.exitCode !== 0) {
    return `Yreview could not run git. ${result.stderr.trim() || GIT_TOO_OLD}`
  }
  const version = parseGitVersion(result.stdout)
  if (version === undefined) return `Yreview could not read the git version. ${GIT_TOO_OLD}`
  return isSupportedGit(version) ? undefined : `Git ${version.join('.')} is too old. ${GIT_TOO_OLD}`
}
