import { type AgentAnswer, installOf } from './agentScan'
import { type AgentSpec, isProduct, isRunnable } from './catalog'

export const CHOOSE = 'Choose the command line agent of the review sessions.'
export const SEARCHING = 'The extension looks for the installed agents.'
export const NOTHING_FOUND =
  'The extension found no agent on the search path of this editor. Choose Another agent and type the full path of your agent, or choose No agent.'
export const UNKNOWN_CHOICE =
  'This version does not know the agent that was chosen before, so please choose again.'
export const NO_AGENT =
  'No agent runs in this window. Run Copy Review Tasks, and paste the tasks where your agent runs.'

/** One line of the agent list. It never says that an agent is not installed. */
export const row = (spec: AgentSpec, found: boolean): string => {
  if (!isProduct(spec)) return `${spec.label}. ${spec.hint}`
  const place = found ? 'found on this machine' : 'not found on the search path of this editor'
  const send =
    spec.push === 'none'
      ? 'Copy only, because it takes no message into a running session.'
      : 'Send and Copy both work.'
  return [`${spec.label}, ${place}.`, send, found ? undefined : spec.desktop?.note]
    .filter((part) => part !== undefined)
    .join(' ')
}

/** Why no message reaches a running session of this choice. A clause, so the caller adds the point. */
export const noPush = (spec: AgentSpec): string => {
  if (!isRunnable(spec)) return 'The review session runs nothing'
  if (!isProduct(spec)) return 'The extension puts no message into a command of your own'
  return `${spec.label} does not accept a message into a running session`
}

export const sendReason = (spec: AgentSpec): string =>
  spec.push === 'none' ? noPush(spec) : `No ${spec.label} session reads this project`

/** The line under the command field. A menu entry carries its hint alone. */
export const place = (spec: AgentSpec, answer: AgentAnswer): string => {
  if (!isProduct(spec)) return spec.hint
  if (!answer.scanned) return SEARCHING
  const found = installOf(answer, spec.id).path
  return found === undefined
    ? `The extension did not find ${spec.label} on the search path of this editor. ${spec.hint}`
    : `This machine holds ${spec.label} at ${found}.`
}
