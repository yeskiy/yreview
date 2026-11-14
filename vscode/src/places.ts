import { realpathSync } from 'node:fs'

/** The real path of a folder, or undefined when the folder does not resolve. */
const realOf = (folder: string, resolve: (path: string) => string): string | undefined => {
  try {
    return resolve(folder)
  } catch {
    // A folder that does not exist has no second spelling to remove.
    return undefined
  }
}

/** Each folder and the long form of its real path, so that the redaction removes both spellings. */
export const withLongForms = (
  folders: readonly string[],
  resolve: (path: string) => string = realpathSync.native,
): readonly string[] => [
  ...new Set(folders.flatMap((folder) => [folder, realOf(folder, resolve) ?? folder])),
]
