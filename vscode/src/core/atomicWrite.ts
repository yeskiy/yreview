import { randomBytes } from 'node:crypto'
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

const BUSY = new Set(['EPERM', 'EACCES', 'EBUSY'])

/** Windows refuses a rename while a scanner holds the target, so a busy target gets two more tries. */
const move = async (from: string, to: string, tries = 3): Promise<void> =>
  rename(from, to).catch(async (failure: NodeJS.ErrnoException) => {
    if (tries <= 1 || !BUSY.has(failure.code ?? '')) throw failure
    await new Promise((resolve) => {
      setTimeout(resolve, 50)
    })
    return move(from, to, tries - 1)
  })

/** Writes a new file with the mode, then renames it, so a reader never sees half a file. */
export const writeAtomic = async (target: string, text: string, mode = 0o600): Promise<void> => {
  await mkdir(path.dirname(target), { recursive: true })
  const temporary = `${target}.${randomBytes(6).toString('hex')}.tmp`
  await writeFile(temporary, text, { encoding: 'utf8', mode, flag: 'wx' })
  await move(temporary, target).catch(async (failure: unknown) => {
    await rm(temporary, { force: true })
    throw failure
  })
}

export const readIfFile = async (target: string): Promise<string | undefined> =>
  (await stat(target).catch(() => undefined))?.isFile() === true
    ? readFile(target, 'utf8').catch(() => undefined)
    : undefined
