import { constants } from 'node:fs'
import { access, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'

import { agentFolders, placesOf, platformOf } from './agentFolders'
import { type AgentInstall, NOTHING, searchAgents } from './agentSearch'
import { AGENTS, type AgentId } from './catalog'
import type { Runnable } from './pathLookup'

export interface AgentAnswer {
  readonly installs: ReadonlyMap<AgentId, AgentInstall>
  readonly scanned: boolean
}

export const NOT_YET: AgentAnswer = { installs: new Map(), scanned: false }

export const installOf = (answer: AgentAnswer, id: AgentId): AgentInstall =>
  answer.installs.get(id) ?? NOTHING

export const anyFound = (answer: AgentAnswer): boolean =>
  [...answer.installs.values()].some((install) => install.path !== undefined)

/** A regular file that the operating system can start. */
export const isRunnableFile: Runnable = (file) =>
  stat(file).then(
    (info) =>
      info.isFile() &&
      access(file, constants.R_OK)
        .then(() => access(file, constants.X_OK))
        .then(
          () => true,
          () => false,
        ),
    () => false,
  )

/** One search of this machine. The extension host PATH is the PATH of the remote host in a remote window. */
export const searchMachine = async (): Promise<AgentAnswer> => ({
  installs: await searchAgents(
    AGENTS,
    {
      path: process.env.PATH,
      pathExt: process.env.PATHEXT,
      windows: process.platform === 'win32',
      separator: path.delimiter,
    },
    agentFolders(platformOf(process.platform), placesOf(process.env, homedir())),
    isRunnableFile,
  ),
  scanned: true,
})

/** One search serves the whole window. A call during a search starts no second search. */
export class AgentScan {
  private answer: AgentAnswer = NOT_YET

  private running: Promise<AgentAnswer> | undefined

  constructor(private readonly search: () => Promise<AgentAnswer> = searchMachine) {}

  latest(): AgentAnswer {
    return this.answer
  }

  refresh(): Promise<AgentAnswer> {
    this.running ??= this.search()
      .catch((): AgentAnswer => ({ installs: new Map(), scanned: true }))
      .then((found) => {
        this.answer = found
        this.running = undefined
        return found
      })
    return this.running
  }
}
