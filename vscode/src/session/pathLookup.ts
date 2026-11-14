import path from 'node:path'

import { kotlinTrim } from '../core/kotlinText'

/** The extensions that Windows runs when PATHEXT holds nothing. */
export const DEFAULT_EXTENSIONS: readonly string[] = ['.COM', '.EXE', '.BAT', '.CMD']

export interface SearchEnv {
  readonly path: string | undefined
  readonly pathExt: string | undefined
  readonly windows: boolean
  readonly separator: string
}

export type Runnable = (file: string) => Promise<boolean>

/** The folders of one PATH value, in order. An empty entry names the working folder, so it drops out. */
export const pathEntries = (value: string | undefined, separator: string): readonly string[] =>
  (value ?? '')
    .split(separator)
    .map(kotlinTrim)
    .filter((entry) => entry !== '')

export const pathExtensions = (pathExt: string | undefined): readonly string[] => {
  const found = (pathExt ?? '')
    .split(';')
    .map(kotlinTrim)
    .filter((entry) => entry !== '')
    .map((entry) => (entry.startsWith('.') ? entry : `.${entry}`))
  return found.length > 0 ? found : DEFAULT_EXTENSIONS
}

/** Windows starts a file through its extension, so the bare name stays out of that list. */
export const commandNames = (
  command: string,
  windows: boolean,
  pathExt: string | undefined,
): readonly string[] =>
  windows ? pathExtensions(pathExt).map((extension) => `${command}${extension}`) : [command]

/** Undefined for a folder or a name that no path can carry. */
export const joinFile = (windows: boolean, folder: string, name: string): string | undefined =>
  folder.includes('\0') || name.includes('\0')
    ? undefined
    : (windows ? path.win32 : path.posix).join(folder, name)

/** The first file of the list that the test accepts. The order of the list decides. */
export const firstRunnable = async (
  files: readonly string[],
  runnable: Runnable,
): Promise<string | undefined> => files[(await Promise.all(files.map(runnable))).indexOf(true)]

/** The file that a shell of the same machine starts: PATH order first, then PATHEXT order. */
export const findOnPath = (
  command: string,
  env: SearchEnv,
  runnable: Runnable,
): Promise<string | undefined> =>
  firstRunnable(
    pathEntries(env.path, env.separator).flatMap((folder) =>
      commandNames(command, env.windows, env.pathExt).flatMap(
        (name) => joinFile(env.windows, folder, name) ?? [],
      ),
    ),
    runnable,
  )
