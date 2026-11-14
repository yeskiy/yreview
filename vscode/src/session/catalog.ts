import { kotlinTrim } from '../core/kotlinText'

export type AgentId =
  | 'claude'
  | 'opencode'
  | 'codex'
  | 'antigravity'
  | 'gemini'
  | 'copilot'
  | 'cursor'
  | 'aider'
  | 'amp'
  | 'custom'
  | 'none'

/** How text reaches a running session: the channel server, the HTTP server of the agent, or the clipboard. */
export type PushKind = 'channel' | 'local_http' | 'none'

/** How one agent gets the review server. Only the first three need no file that the user owns. */
export type McpRoute =
  | { readonly kind: 'flag'; readonly flag: string; readonly prefix: string }
  | { readonly kind: 'variable'; readonly name: string }
  | { readonly kind: 'keys' }
  | { readonly kind: 'addCommand' }
  | { readonly kind: 'userFile'; readonly path: string }
  | { readonly kind: 'none' }

export type Naming =
  { readonly kind: 'agent'; readonly command: string } | { readonly kind: 'user' }

export interface DesktopApp {
  readonly label: string
  readonly sharesConfig: boolean
  readonly note: string
}

export interface AgentSpec {
  readonly id: AgentId
  readonly label: string
  readonly short: string
  readonly commands: readonly string[]
  readonly push: PushKind
  readonly mcp: McpRoute
  readonly naming: Naming
  readonly hint: string
  readonly desktop: DesktopApp | null
}

export const DEFAULT_AGENT: AgentId = 'claude'

const RENAME: Naming = { kind: 'agent', command: '/rename' }
const USER: Naming = { kind: 'user' }
const NO_ROUTE: McpRoute = { kind: 'none' }

// The table of spec/vectors/agents.json and AgentCatalog.kt. agentVectors.test.ts compares them.
export const AGENTS: readonly AgentSpec[] = [
  {
    id: 'claude',
    label: 'Claude Code',
    short: 'Claude',
    commands: ['claude'],
    push: 'channel',
    mcp: { kind: 'flag', flag: '--mcp-config', prefix: '' },
    naming: RENAME,
    hint: 'The official installer writes it to the PATH.',
    desktop: {
      label: 'Claude Desktop',
      sharesConfig: false,
      note: 'Claude Desktop is a different product with a configuration file of its own, and a terminal cannot run it.',
    },
  },
  {
    id: 'opencode',
    label: 'OpenCode',
    short: 'OpenCode',
    commands: ['opencode'],
    push: 'local_http',
    mcp: { kind: 'variable', name: 'OPENCODE_CONFIG' },
    naming: RENAME,
    hint: 'It installs through npm, Homebrew, or Scoop.',
    desktop: null,
  },
  {
    id: 'codex',
    label: 'OpenAI Codex CLI',
    short: 'Codex',
    commands: ['codex'],
    push: 'none',
    mcp: { kind: 'keys' },
    naming: USER,
    hint: 'It installs through npm or Homebrew.',
    desktop: {
      label: 'the ChatGPT desktop application',
      sharesConfig: true,
      note: 'The ChatGPT desktop application reads the same .codex/config.toml file, so a server registered here reaches it too. A terminal cannot run it.',
    },
  },
  {
    id: 'antigravity',
    label: 'Antigravity CLI',
    short: 'Antigravity',
    commands: ['agy'],
    push: 'none',
    mcp: { kind: 'addCommand' },
    naming: RENAME,
    hint: 'Google ships it as the follower of Gemini CLI.',
    desktop: {
      label: 'the Antigravity editor',
      sharesConfig: true,
      note: 'The Antigravity editor reads the same mcp_config.json file, so a server registered here reaches it too. A terminal cannot run it.',
    },
  },
  {
    id: 'gemini',
    label: 'Gemini CLI',
    short: 'Gemini',
    commands: ['gemini'],
    push: 'none',
    mcp: { kind: 'variable', name: 'GEMINI_CLI_SYSTEM_DEFAULTS_PATH' },
    naming: USER,
    hint: 'It installs through npm. Google ended the consumer tiers on 2026-06-18.',
    desktop: null,
  },
  {
    id: 'copilot',
    label: 'GitHub Copilot CLI',
    short: 'Copilot',
    commands: ['copilot'],
    push: 'none',
    mcp: { kind: 'flag', flag: '--additional-mcp-config', prefix: '@' },
    naming: RENAME,
    hint: 'It installs through npm or winget, and it needs a Copilot subscription.',
    desktop: null,
  },
  {
    id: 'cursor',
    label: 'Cursor CLI',
    short: 'Cursor',
    commands: ['cursor-agent', 'agent'],
    push: 'none',
    mcp: { kind: 'userFile', path: '.cursor/mcp.json' },
    naming: RENAME,
    hint: 'The Cursor installer writes both names to the PATH.',
    desktop: {
      label: 'the Cursor editor',
      sharesConfig: true,
      note: 'The Cursor editor reads the same mcp.json file, so a server registered here reaches it too. A terminal cannot run it.',
    },
  },
  {
    id: 'aider',
    label: 'Aider',
    short: 'Aider',
    commands: ['aider'],
    push: 'none',
    mcp: NO_ROUTE,
    naming: USER,
    hint: 'It installs through pip or pipx. It reads no Model Context Protocol server.',
    desktop: null,
  },
  {
    id: 'amp',
    label: 'Amp',
    short: 'Amp',
    commands: ['amp'],
    push: 'none',
    mcp: NO_ROUTE,
    naming: USER,
    hint: 'Sourcegraph ships it, and it needs a paid plan.',
    desktop: {
      label: 'Amp for macOS',
      sharesConfig: false,
      note: 'Amp for macOS is a separate application, and a terminal cannot run it.',
    },
  },
  {
    id: 'custom',
    label: 'Another agent',
    short: 'Agent',
    commands: [],
    push: 'none',
    mcp: NO_ROUTE,
    naming: USER,
    hint: 'Name the command yourself. A shell function works, because a shell runs the command.',
    desktop: null,
  },
  {
    id: 'none',
    label: 'No agent',
    short: 'Session',
    commands: [],
    push: 'none',
    mcp: NO_ROUTE,
    naming: USER,
    hint: 'The window starts nothing. Copy the tasks and paste them where your agent runs.',
    desktop: null,
  },
]

const BY_ID: ReadonlyMap<string, AgentSpec> = new Map(AGENTS.map((spec) => [spec.id, spec]))

export const agentOf = (id: AgentId): AgentSpec =>
  BY_ID.get(id) ??
  ((): never => {
    throw new Error(`The catalog holds no agent ${id}.`)
  })()

/** The command of a fresh choice. Another agent and No agent give an empty text. */
export const defaultCommand = (spec: AgentSpec): string => spec.commands[0] ?? ''

/** True for a product that a user can install. A menu entry is no product. */
export const isProduct = (spec: AgentSpec): boolean => spec.commands.length > 0

export const isRunnable = (spec: AgentSpec): boolean => spec.id !== 'none'

export const isRenamable = (spec: AgentSpec): boolean => spec.naming.kind === 'user'

/** Undefined when nobody chose, and undefined for a stored name that this build does not know. */
export const parseAgent = (raw: string | undefined): AgentId | undefined =>
  BY_ID.get(kotlinTrim(raw ?? ''))?.id

/** The found agents first, in catalog order, then the rest. No agent is always last. */
export const orderedAgents = (found: ReadonlySet<AgentId>): readonly AgentSpec[] => {
  const rest = AGENTS.filter((spec) => spec.id !== 'none')
  return [
    ...rest.filter((spec) => found.has(spec.id)),
    ...rest.filter((spec) => !found.has(spec.id)),
    agentOf('none'),
  ]
}
