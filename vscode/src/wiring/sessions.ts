import { stat } from 'node:fs/promises'

import * as vscode from 'vscode'

import { listSessions } from '../bridge/openCodeClient'
import { pickTitle } from '../bridge/openCodeTitle'
import type { Log } from '../log'
import { needsFile } from '../session/agentMcp'
import { bridgeExtras } from '../session/bridgePlan'
import type { AgentSpec } from '../session/catalog'
import { channelLaunch, writeChannelConfig } from '../session/channelConfig'
import { type LocalServer, openLocalServer } from '../session/localServer'
import { SHORT_MS, startAgain } from '../session/portRetry'
import { deleteSecret, secretFilePath, writeSecret } from '../session/secretFile'
import { NO_EXTRAS, type SessionExtras, type SessionPreparer } from '../session/sessionPlan'
import type { ReviewSession, ReviewSessions } from '../session/terminals'
import type { BridgeWiring } from './bridge'

/** The wait between two reads of the OpenCode session titles, as NAME_DELAY_SECONDS states. */
export const NAME_DELAY_MS = 3_000

export interface SessionLink {
  readonly prepare: SessionPreparer
  attach(wiring: BridgeWiring, sessions: ReviewSessions): void
}

interface Linked {
  readonly wiring: BridgeWiring
  readonly sessions: ReviewSessions
}

/** Reads the title that OpenCode gives its session until the release stops it. */
const titlePoll = (sessions: ReviewSessions, sessionKey: string, server: LocalServer) => {
  const directory = vscode.workspace.workspaceFolders?.find(
    (folder) => folder.uri.scheme === 'file',
  )?.uri.fsPath
  const poll: { stopped: boolean; timer?: NodeJS.Timeout } = { stopped: false }
  const read = async (): Promise<void> => {
    const rows = await listSessions(server.port, server.password)
    const name =
      rows === undefined || directory === undefined ? undefined : pickTitle(rows, directory)
    if (!poll.stopped && name !== undefined) sessions.nameFromAgent(sessionKey, name)
  }
  const next = (): void => {
    if (poll.stopped) return
    poll.timer = setTimeout(() => {
      read().finally(next)
    }, NAME_DELAY_MS)
  }
  next()
  return () => {
    poll.stopped = true
    clearTimeout(poll.timer)
  }
}

/** The preparer exists before the bridge. Until attach, a session starts without the bridge. */
export const sessionLink = (log: Log): SessionLink => {
  const linked: { current?: Linked } = {}
  const watched = new Set<string>()
  const started = new Map<string, ReviewSession>()
  const retry = { count: 0 }

  /** A session that ended by itself soon after its start lost its port, so it starts once more. */
  const restart = (sessionKey: string, agent: AgentSpec): void => {
    const session = started.get(sessionKey)
    started.delete(sessionKey)
    if (session === undefined || session.terminal.exitStatus === undefined) return
    const lived = Date.now() - session.startedAt
    if (lived >= SHORT_MS) retry.count = 0
    if (!startAgain(agent.push, lived, retry.count)) return
    retry.count += 1
    linked.current?.sessions
      .start(agent)
      .catch((error: unknown) => log.error('The review session did not start again.', error))
  }

  const prepared = async (
    { wiring, sessions }: Linked,
    agent: AgentSpec,
    sessionKey: string,
  ): Promise<SessionExtras> => {
    const bridge = await wiring.host.start()
    const channelMissing = !(await stat(wiring.script).then(
      (found) => found.isFile(),
      () => false,
    ))
    const launch = channelLaunch(wiring.script)
    const configFile =
      needsFile(agent) && bridge.kind === 'available' && !channelMissing
        ? await writeChannelConfig(agent.id, launch).catch((error: unknown) => {
            log.error('The MCP file of the session was not written.', error)
            return undefined
          })
        : undefined
    const secret = secretFilePath(sessionKey)
    const server = await openLocalServer(agent.push, (password) =>
      writeSecret(secret, password).then(
        () => secret,
        (error: unknown) => {
          log.error('The password file of the session was not written.', error)
          return undefined
        },
      ),
    )
    const stopPoll =
      server === undefined ? () => undefined : titlePoll(sessions, sessionKey, server)
    if (server !== undefined) watched.add(sessionKey)
    return {
      ...bridgeExtras({ agent, bridge, sessionKey, launch, configFile, server, channelMissing }),
      release: () => {
        stopPoll()
        watched.delete(sessionKey)
        if (server === undefined) return
        deleteSecret(secret).catch((error: unknown) =>
          log.error('The password file of the session was not deleted.', error),
        )
        restart(sessionKey, agent)
      },
    }
  }

  return {
    prepare: async (agent, sessionKey) => {
      const { current } = linked
      if (current === undefined) return NO_EXTRAS(agent, sessionKey)
      return prepared(current, agent, sessionKey).catch(async (error: unknown) => {
        log.error('The review session starts without the bridge.', error)
        await deleteSecret(secretFilePath(sessionKey)).catch((failure: unknown) =>
          log.error('The password file of the session was not deleted.', failure),
        )
        return NO_EXTRAS(agent, sessionKey)
      })
    },
    attach: (wiring, sessions) => {
      linked.current = { wiring, sessions }
      sessions.onDidChange(() =>
        sessions
          .list()
          .filter((session) => watched.has(session.key))
          .forEach((session) => started.set(session.key, session)),
      )
    },
  }
}
