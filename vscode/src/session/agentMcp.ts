import type { AgentSpec } from './catalog'
import { SERVER_NAME, type ServerLaunch, configText } from './channelConfig'

/** The fields of a catalog agent that the MCP routes read. */
export type McpAgent = Pick<AgentSpec, 'id' | 'label' | 'commands' | 'push' | 'mcp'>

export const CHANNEL_FLAG = '--dangerously-load-development-channels'
export const CHANNEL_VALUE = `server:${SERVER_NAME}`
export const HOST_FLAG = '--hostname'
export const PORT_FLAG = '--port'
export const LOOPBACK = '127.0.0.1'
export const NO_ARGUMENTS = 'Yreview appends no argument for this agent.'
export const RUNTIME_PLACE = '<the runtime of VS Code>'
export const SERVER_PLACE = '<the channel server of Yreview>'
export const FILE_PLACE = '<the configuration file of the agent>'
const KEY = `mcp_servers.${SERVER_NAME}`
const FILES =
  'Every send writes AGENT.md and tasks.json in the review folder. ' +
  'The agent appends a finished identifier to done.txt, and Yreview closes the task. ' +
  'That route needs no server at all.'

const firstCommand = (agent: McpAgent): string => agent.commands[0] ?? ''

/** A TOML multi-line literal string keeps every backslash raw, so a Windows path reaches Codex unchanged. */
const toml = (value: string): string => `'''${value}'''`

const codexKeys = (launch: ServerLaunch): readonly string[] => [
  '-c',
  `${KEY}.command=${toml(launch.command)}`,
  '-c',
  `${KEY}.args=[${launch.args.map(toml).join(',')}]`,
  ...Object.entries(launch.env).flatMap(([name, value]) => [
    '-c',
    `${KEY}.env.${name}=${toml(value)}`,
  ]),
]

export const needsFile = (agent: McpAgent): boolean =>
  agent.mcp.kind === 'flag' || agent.mcp.kind === 'variable'

export const mcpArguments = (
  agent: McpAgent,
  launch: ServerLaunch | undefined,
  configFile: string | undefined,
): readonly string[] => {
  const route = agent.mcp
  if (route.kind === 'flag')
    return configFile === undefined ? [] : [route.flag, `${route.prefix}${configFile}`]
  if (route.kind === 'keys') return launch === undefined ? [] : codexKeys(launch)
  return []
}

export const mcpVariables = (
  agent: McpAgent,
  configFile: string | undefined,
): Readonly<Record<string, string>> =>
  agent.mcp.kind === 'variable' && configFile !== undefined ? { [agent.mcp.name]: configFile } : {}

/** Only Claude Code takes the channel flag, and only OpenCode takes a port. */
interface Place {
  readonly configFile?: string
  readonly launch?: ServerLaunch
  readonly port?: number
}

/** The arguments after the command. The session plan appends them to the command. */
export const agentArguments = (agent: McpAgent, place: Place): readonly string[] => [
  ...mcpArguments(agent, place.launch, place.configFile),
  ...(agent.id === 'claude' && place.configFile !== undefined ? [CHANNEL_FLAG, CHANNEL_VALUE] : []),
  ...(agent.id === 'opencode' && place.port !== undefined
    ? [HOST_FLAG, LOOPBACK, PORT_FLAG, String(place.port)]
    : []),
]

export const launchArguments = (
  agent: McpAgent,
  command: string,
  place: Place,
): readonly string[] => [command, ...agentArguments(agent, place)]

/** The command that a press on Add runs, with no shell. */
export const addCommand = (
  agent: McpAgent,
  launch: ServerLaunch,
  program: string,
): readonly string[] | undefined =>
  agent.mcp.kind === 'addCommand'
    ? [program, 'mcp', 'add', SERVER_NAME, '--', launch.command, ...launch.args]
    : undefined

/** A command the user typed wins. Then the found path, because a bare name may start nothing. */
export const programFor = (agent: McpAgent, typed: string, found: string | undefined): string => {
  const text = typed.trim()
  return text !== '' && text !== firstCommand(agent) ? text : (found ?? firstCommand(agent))
}

export const userFileText = (agent: McpAgent, launch: ServerLaunch): string | undefined =>
  agent.mcp.kind === 'userFile' ? configText(agent.id, launch) : undefined

export const mcpHelp = (agent: McpAgent): string => {
  const route = agent.mcp
  if (route.kind === 'flag' || route.kind === 'variable' || route.kind === 'keys') {
    return 'Yreview registers its review server for this agent on every session. It writes nothing that you own, and it asks nothing.'
  }
  if (route.kind === 'addCommand') {
    return `This agent keeps its servers in a file of its own. Run Add, and Yreview runs the command above once. ${FILES}`
  }
  if (route.kind === 'userFile') {
    return `This agent keeps its servers in ${route.path} inside the project. Run Add, and Yreview writes the document above. ${FILES}`
  }
  return `Yreview registers no server for this agent, because no route was proved. ${FILES}`
}

const PLACEHOLDER_LAUNCH: ServerLaunch = {
  command: RUNTIME_PLACE,
  args: [SERVER_PLACE],
  env: { ELECTRON_RUN_AS_NODE: '1' },
}

/** The text that the agent quick pick shows. Placeholders stand where a path is not known yet. */
export const appendedText = (
  agent: McpAgent,
  program?: string,
  launch: ServerLaunch = PLACEHOLDER_LAUNCH,
): string =>
  addCommand(agent, launch, program ?? firstCommand(agent))?.join(' ') ??
  userFileText(agent, launch) ??
  ([
    ...mcpArguments(agent, launch, FILE_PLACE),
    ...(agent.id === 'claude' ? [CHANNEL_FLAG, CHANNEL_VALUE] : []),
  ].join(' ') ||
    NO_ARGUMENTS)
