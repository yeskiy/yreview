import { inspect } from 'node:util'

import { newToken } from '../bridge/token'
import { pickPort } from './freePort'

/** The port, the password and its file stand together. No text form holds the password. */
export class LocalServer {
  constructor(
    readonly port: number,
    readonly password: string,
    readonly passwordFile: string,
  ) {}

  toString(): string {
    return `LocalServer(port=${this.port})`
  }

  toJSON(): object {
    return { port: this.port }
  }

  [inspect.custom](): string {
    return this.toString()
  }
}

/** The password reaches the disk only after a port stands, so a failed start leaves no secret. */
export const openLocalServer = async (
  push: string,
  write: (password: string) => Promise<string | undefined>,
  pick: () => Promise<number | undefined> = pickPort,
  token: () => string = newToken,
): Promise<LocalServer | undefined> => {
  if (push !== 'local_http') return undefined
  const port = await pick()
  if (port === undefined) return undefined
  const password = token()
  const file = await write(password)
  return file === undefined ? undefined : new LocalServer(port, password, file)
}
