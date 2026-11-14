import { countOf } from '../tasks/taskLabels'

export type SendRoute = 'channel' | 'noSession' | 'channelOff' | 'noRepository'

export const CLIPBOARD_REASONS: Readonly<Record<SendRoute, string | undefined>> = {
  channel: undefined,
  noSession: 'No session reads this project',
  channelOff: 'The review channel is off in the settings',
  noRepository: 'The review channel carries the tasks of a git repository only',
}

/** A folder store beats every answer, then the switch, then the count of receivers on any transport. */
export const sendRouteOf = (
  channel: boolean,
  receivers: number,
  gitRepository: boolean,
): SendRoute => {
  if (!gitRepository) return 'noRepository'
  if (!channel) return 'channelOff'
  return receivers > 0 ? 'channel' : 'noSession'
}

export interface SendReport {
  readonly tasks: number
  readonly batches: number
  readonly streams: number
  readonly problem?: string
  readonly dropped?: number
  readonly dropReason?: string
  readonly route?: SendRoute
  readonly folder?: string
  readonly targetName?: string
  readonly agentReason?: string
  readonly copied?: boolean
}

export interface Notice {
  readonly text: string
  readonly warning: boolean
}

export const SENDER = 'Yreview'

/** A send that reached nobody must not look like a send that worked. */
export const sendNotice = (report: SendReport): Notice => {
  const dropped = report.dropped ?? 0
  const route = report.route ?? 'channel'
  const lost =
    dropped === 0
      ? ''
      : ` ${countOf(dropped, 'task')} ${dropped === 1 ? 'was' : 'were'} dropped, because ${report.dropReason}.`
  const copied =
    report.copied === true
      ? ` ${SENDER} copied the prompt to the clipboard, so you can paste it.`
      : ''
  const reason =
    route === 'noSession' && report.agentReason !== undefined
      ? report.agentReason
      : CLIPBOARD_REASONS[route]
  if (report.problem !== undefined) return { text: `${report.problem}${copied}`, warning: true }
  if (report.tasks === 0 && dropped === 0) {
    return { text: 'This repository has no open task.', warning: false }
  }
  if (report.tasks === 0) return { text: `${SENDER} sent nothing.${lost}`, warning: true }
  if (reason !== undefined) {
    return {
      text: `${reason}, so ${SENDER} wrote ${countOf(report.tasks, 'task')} to ${report.folder} and copied the prompt to the clipboard.${lost}`,
      warning: false,
    }
  }
  if (report.streams === 0 && report.targetName !== undefined) {
    return {
      text: `${report.targetName} no longer reads this project, so ${SENDER} sent nothing.`,
      warning: true,
    }
  }
  if (report.streams === 0) {
    return {
      text: `No session reads this project. Start a session with the review channel, then send the tasks again.${lost}`,
      warning: true,
    }
  }
  const target = report.targetName ?? countOf(report.streams, 'session')
  return {
    text: `${SENDER} sent ${countOf(report.tasks, 'task')} to ${target}.${lost}`,
    warning: dropped > 0,
  }
}
