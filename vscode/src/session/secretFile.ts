import { rm } from 'node:fs/promises'
import path from 'node:path'

import { homeDirectory } from '../bridge/discoveryFile'
import { writeAtomic } from '../core/atomicWrite'

export const SECRET_FOLDER = 'secret'

/** Each character that is not a letter or a digit becomes a hyphen, so the name stays in the folder. */
export const secretFileName = (sessionKey: string): string =>
  `${sessionKey.replace(/[^A-Za-z0-9]/g, '-')}.txt`

export const secretFilePath = (sessionKey: string, home: string = homeDirectory()): string =>
  path.join(home, '.y-review', SECRET_FOLDER, secretFileName(sessionKey))

export const writeSecret = (file: string, value: string): Promise<void> =>
  writeAtomic(file, value, 0o600)

export const deleteSecret = (file: string): Promise<void> => rm(file, { force: true })
