import { homeDirectory } from '../bridge/discoveryFile'
import { readIfFile, writeAtomic } from '../core/atomicWrite'
import { configFilePath, needsWrite } from './configFile'

export const SERVER_NAME = 'y-review'

export interface ServerLaunch {
  readonly command: string
  readonly args: readonly string[]
  readonly env: Readonly<Record<string, string>>
}

/** The runtime of VS Code runs as Node.js only with this variable. Plain Node.js ignores it. */
export const channelLaunch = (
  script: string,
  execPath: string = process.execPath,
): ServerLaunch => ({
  command: execPath,
  args: [script],
  env: { ELECTRON_RUN_AS_NODE: '1' },
})

/** A Node.js agent does not start a .cmd file without a shell on Windows, so cmd starts it. */
export const launcherLaunch = (
  launcher: string,
  windows: boolean = process.platform === 'win32',
  comSpec: string = process.env.ComSpec ?? 'cmd.exe',
): ServerLaunch =>
  windows
    ? { command: comSpec, args: ['/d', '/c', launcher], env: {} }
    : { command: launcher, args: [], env: {} }

const withEnv = (env: Readonly<Record<string, string>>, key: string): Record<string, unknown> =>
  Object.keys(env).length === 0 ? {} : { [key]: env }

/** OpenCode reads `mcp` with one command array. Every other agent reads `mcpServers`. */
export const configText = (agentId: string, launch: ServerLaunch): string =>
  JSON.stringify(
    agentId === 'opencode'
      ? {
          mcp: {
            [SERVER_NAME]: {
              type: 'local',
              command: [launch.command, ...launch.args],
              enabled: true,
              ...withEnv(launch.env, 'environment'),
            },
          },
        }
      : {
          mcpServers: {
            [SERVER_NAME]: {
              type: 'stdio',
              command: launch.command,
              args: launch.args,
              ...withEnv(launch.env, 'env'),
            },
          },
        },
    null,
    4,
  )

/** The path of the file. A file that holds this text already is not written again. */
export const writeChannelConfig = async (
  agentId: string,
  launch: ServerLaunch,
  home: string = homeDirectory(),
): Promise<string> => {
  const target = configFilePath(home, agentId)
  const wanted = configText(agentId, launch)
  if (needsWrite(await readIfFile(target), wanted)) await writeAtomic(target, wanted, 0o600)
  return target
}
