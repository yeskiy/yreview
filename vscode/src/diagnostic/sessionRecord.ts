export const NONE = 'none'
export const UNKNOWN = 'unknown'
/** The width of the name column. It keeps the values of every record in one column. */
export const WIDTH = 14

export type Fact = readonly [name: string, value: string]

/** One thing the extension did. It holds versions, switches, counts, routes and states only. */
export interface SessionRecord {
  readonly at: string
  readonly label: string
  readonly facts: readonly Fact[]
}

export interface ChannelServerState {
  readonly kind: 'found' | 'missing'
  readonly path: string
}

/** The facts of one session start. No field holds the bridge token. */
export interface SessionStart {
  readonly command: string
  readonly directory: string
  readonly bridgeReady: boolean
  readonly bridgeUrl: string
  readonly status: string
  readonly channelServer?: ChannelServerState
  readonly runtime?: string
  readonly configFile?: string
  readonly terminalStarted: boolean
  readonly processId?: number
}

/** The facts of one press of Send. It counts the tasks, because a task holds comment text. */
export interface SendFacts {
  readonly route: string
  readonly store: 'git' | 'folder'
  readonly readers: number
  readonly tasks: number
  readonly batches: number
  readonly dropped: number
  readonly problem?: string
}

const two = (value: number): string => String(value).padStart(2, '0')

/** The local time to the second, as `yyyy-MM-dd HH:mm:ss`. */
export const clock = (date: Date): string =>
  `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())} ${two(date.getHours())}:${two(date.getMinutes())}:${two(date.getSeconds())}`

export const factLine = (name: string, value: string): string => `  ${name.padEnd(WIDTH)} ${value}`

export const recordText = (record: SessionRecord): string =>
  [
    `[${record.at}] ${record.label}`,
    ...record.facts.map(([name, value]) => factLine(name, value)),
  ].join('\n')

export const sessionRecord = (start: SessionStart, now: Date = new Date()): SessionRecord => ({
  at: clock(now),
  label: 'session start',
  facts: [
    ['command', start.command],
    ['directory', start.directory],
    ['bridge', `${start.bridgeReady ? 'ready' : 'not ready'} ${start.bridgeUrl}`.trim()],
    ['status', start.status],
    [
      'channel server',
      start.channelServer === undefined
        ? UNKNOWN
        : `${start.channelServer.kind} at ${start.channelServer.path}`,
    ],
    ['node runtime', start.runtime ?? NONE],
    ['config file', start.configFile ?? NONE],
    ['terminal', start.terminalStarted ? 'started' : 'not started'],
    ['process', start.processId === undefined ? UNKNOWN : String(start.processId)],
  ],
})

export const sendRecord = (send: SendFacts, now: Date = new Date()): SessionRecord => ({
  at: clock(now),
  label: 'send',
  facts: [
    ['route', send.route.toLowerCase()],
    ['store', send.store],
    ['readers', String(send.readers)],
    ['tasks', String(send.tasks)],
    ['batches', String(send.batches)],
    ['dropped', String(send.dropped)],
    ['problem', send.problem ?? NONE],
  ],
})

/** The first stack frame that names a file under the folder of the extension. */
export const originOf = (stack: string | undefined, ownRoot: string): string =>
  (stack ?? '')
    .split('\n')
    .map((line) => line.trim())
    .find(
      (line) =>
        ownRoot !== '' &&
        line.startsWith('at ') &&
        line
          .replaceAll('\\', '/')
          .toLowerCase()
          .includes(ownRoot.replaceAll('\\', '/').toLowerCase()),
    ) ?? UNKNOWN

export const failureRecord = (
  work: string,
  failure: unknown,
  ownRoot: string,
  now: Date = new Date(),
): SessionRecord => ({
  at: clock(now),
  label: 'failure',
  facts: [
    ['work', work],
    ['type', failure instanceof Error ? failure.name : typeof failure],
    ['message', (failure instanceof Error ? failure.message : String(failure)) || NONE],
    ['origin', originOf(failure instanceof Error ? failure.stack : undefined, ownRoot)],
  ],
})
