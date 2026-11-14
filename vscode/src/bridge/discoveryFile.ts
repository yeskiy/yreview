import { rm } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'

import { readIfFile, writeAtomic } from '../core/atomicWrite'
import { isKotlinBlank } from '../core/kotlinText'
import { discoveryFileName } from '../core/paths'

export const FILE_VARIABLE = 'Y_REVIEW_BRIDGE_FILE'

export interface BridgeEntry {
  readonly url: string
  readonly token: string
  readonly projectPath: string
  readonly pid: number
}

/** USERPROFILE when it is set and not blank. With no argument, it reads USERPROFILE and the home folder. */
export const homeDirectory = (...given: readonly [profile?: string, fallback?: string]): string => {
  const [profile, fallback = homedir()] = given.length === 0 ? [process.env.USERPROFILE] : given
  return profile !== undefined && !isKotlinBlank(profile) ? profile : fallback
}

/** The VS Code file stands in a folder of its own, so it never replaces the file of an IDE. */
export const bridgeFilePath = (projectPath: string, home: string = homeDirectory()): string =>
  path.join(home, '.y-review', 'bridge', 'vscode', discoveryFileName(projectPath))

export const writeBridgeFile = (file: string, entry: BridgeEntry): Promise<void> =>
  writeAtomic(
    file,
    JSON.stringify({
      url: entry.url,
      token: entry.token,
      projectPath: entry.projectPath,
      pid: entry.pid,
    }),
    0o600,
  )

export const deleteBridgeFile = (file: string): Promise<void> => rm(file, { force: true })

/** The token in the file, or undefined when the file is missing or does not parse. */
export const readBridgeToken = async (file: string): Promise<string | undefined> => {
  const text = await readIfFile(file)
  const token = (() => {
    try {
      return text === undefined ? undefined : (JSON.parse(text) as { token?: unknown }).token
    } catch {
      return undefined
    }
  })()
  return typeof token === 'string' ? token : undefined
}
