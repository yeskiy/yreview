import { isKotlinBlank } from '../core/kotlinText'
import { noPush } from './agentRows'
import type { AgentSpec } from './catalog'
import { NO_REACH, type SessionReach } from './sessionReach'
import {
  type SecretVariable,
  loginShell,
  onWindows,
  shellCommand,
  workingDirectory,
} from './shellCommand'

export const NO_COMMAND =
  'This agent has no command yet. Run Yreview: Set Agent Command to name one.'
export const WITHOUT_CHANNEL =
  'The session starts without the review channel. Run Copy Review Tasks, then paste the prompt in the session.'

/** What phase 5 adds to one start: the review server, the bridge, the secret, the reach. */
export interface SessionExtras {
  readonly args: readonly string[]
  readonly env: Readonly<Record<string, string>>
  readonly secret?: SecretVariable
  readonly status?: string
  readonly reach: SessionReach
  /** Removes what the preparer wrote. It runs when the session ends or never starts. */
  readonly release?: () => void
}

/** Never rejects. A failed part gives a session without that part. */
export type SessionPreparer = (agent: AgentSpec, sessionKey: string) => Promise<SessionExtras>

export const NO_EXTRAS: SessionPreparer = () =>
  Promise.resolve({ args: [], env: {}, reach: NO_REACH })

export interface SessionPlan {
  readonly shellPath: string
  readonly shellArgs: readonly string[]
  readonly workingDirectory: string
  readonly environment: Readonly<Record<string, string>>
  readonly status: string
}

export interface PlanInput {
  readonly projectPath: string
  readonly agent: AgentSpec
  readonly command: string
  readonly extras: SessionExtras
  readonly windows?: boolean
  readonly shell?: string
}

/** The agent decides first. An agent that takes no message never carries a channel. */
export const sessionStatus = (agent: AgentSpec, command: string, extras: SessionExtras): string => {
  if (isKotlinBlank(command)) return NO_COMMAND
  if (agent.push === 'none') {
    return `${noPush(agent)}. Run Copy Review Tasks, then paste the prompt in the session.`
  }
  return extras.status ?? WITHOUT_CHANNEL
}

export const planSession = (input: PlanInput): SessionPlan => {
  const windows = input.windows ?? onWindows()
  const [shellPath = '', ...shellArgs] = shellCommand(
    [input.command, ...input.extras.args],
    input.extras.secret,
    windows,
    input.shell ?? loginShell(),
  )
  return {
    shellPath,
    shellArgs,
    workingDirectory: workingDirectory(input.projectPath, windows),
    environment: input.extras.env,
    status: sessionStatus(input.agent, input.command, input.extras),
  }
}
