import { FILE_VARIABLE } from '../bridge/discoveryFile'
import type { BridgeLookup } from '../bridge/host'
import { PASSWORD_VARIABLE } from '../bridge/openCodeClient'
import { agentArguments, mcpVariables } from './agentMcp'
import type { AgentSpec } from './catalog'
import type { ServerLaunch } from './channelConfig'
import type { LocalServer } from './localServer'
import { SESSION_KEY_VARIABLE } from './sessionKey'
import { type SessionExtras, WITHOUT_CHANNEL } from './sessionPlan'
import { reachOf } from './sessionReach'

export interface BridgeInput {
  readonly agent: AgentSpec
  readonly bridge: BridgeLookup
  readonly sessionKey: string
  readonly launch?: ServerLaunch
  readonly configFile?: string
  readonly server?: LocalServer
  readonly channelMissing?: boolean
  /** The channel server script of the extension, for the session record. */
  readonly channelScript?: string
}

export interface BridgeExtras extends SessionExtras {
  readonly bridgeReady: boolean
  readonly bridgeUrl: string
  readonly configFile?: string
  readonly channelScript?: string
}

export const bridgeStatus = (input: BridgeInput): string => {
  if (input.bridge.kind === 'channelOff') {
    return `The review channel is off in the settings. ${WITHOUT_CHANNEL}`
  }
  if (input.bridge.kind === 'unavailable') {
    return `The review bridge is not available yet. ${input.bridge.reason} ${WITHOUT_CHANNEL}`
  }
  if (input.channelMissing === true) {
    return `The channel server of Yreview is missing from the extension folder. ${WITHOUT_CHANNEL}`
  }
  return `The review bridge is ready at ${input.bridge.url}.`
}

/** The token never enters the extras. The session gets the path of the bridge file and its own key. */
export const bridgeExtras = (input: BridgeInput): BridgeExtras => {
  const available = input.bridge.kind === 'available' ? input.bridge : undefined
  const registered =
    available !== undefined && input.launch !== undefined && input.channelMissing !== true
  const configFile = registered ? input.configFile : undefined
  return {
    args: agentArguments(input.agent, {
      configFile,
      launch: registered ? input.launch : undefined,
      port: input.server?.port,
    }),
    env: {
      ...(available === undefined
        ? {}
        : { [FILE_VARIABLE]: available.path, [SESSION_KEY_VARIABLE]: input.sessionKey }),
      ...mcpVariables(input.agent, configFile),
    },
    ...(input.server === undefined
      ? {}
      : { secret: { name: PASSWORD_VARIABLE, path: input.server.passwordFile } }),
    status: bridgeStatus(input),
    reach: reachOf(input.agent, input.server?.port, input.server?.password),
    bridgeReady: input.agent.push === 'channel' && registered,
    bridgeUrl: available?.url ?? '',
    configFile,
    channelScript: input.channelScript,
  }
}
