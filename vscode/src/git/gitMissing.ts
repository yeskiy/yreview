export const OPEN_GIT_SETTING = 'Open the git.path Setting'

/** A dismissed notice opens nothing. */
export const gitMissingNotice = async (
  problem: string,
  show: (message: string, button: string) => PromiseLike<string | undefined>,
  open: () => PromiseLike<unknown>,
): Promise<void> => {
  if ((await show(problem, OPEN_GIT_SETTING)) === OPEN_GIT_SETTING) await open()
}
