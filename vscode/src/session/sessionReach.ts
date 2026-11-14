import type { AgentSpec } from './catalog'

export type SessionReach =
  | { readonly kind: 'channel' }
  | { readonly kind: 'localHttp'; readonly port: number; readonly password: string }
  | { readonly kind: 'none' }

export const CHANNEL: SessionReach = { kind: 'channel' }
export const NO_REACH: SessionReach = { kind: 'none' }

/** A channel session takes a send only while its stream is open. A port of its own needs no stream. */
export const takesSend = (reach: SessionReach, streamOpen: boolean): boolean =>
  reach.kind === 'channel' ? streamOpen : reach.kind === 'localHttp'

export const reachOf = (agent: AgentSpec, port?: number, password?: string): SessionReach => {
  if (agent.push === 'channel') return CHANNEL
  return agent.push === 'local_http' && port !== undefined && password !== undefined
    ? { kind: 'localHttp', port, password }
    : NO_REACH
}

/** The text of a reach for a log line. The password never shows. */
export const describeReach = (reach: SessionReach): string => {
  if (reach.kind === 'localHttp') return `LocalHttp(port=${reach.port})`
  return reach.kind === 'channel' ? 'Channel' : 'None'
}
