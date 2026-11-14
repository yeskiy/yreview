import type { AgentId, AgentSpec } from './catalog'
import {
  type Runnable,
  type SearchEnv,
  commandNames,
  findOnPath,
  firstRunnable,
  joinFile,
} from './pathLookup'

export interface AgentInstall {
  readonly path?: string
  readonly source: 'path' | 'folder' | 'none'
}

export const NOTHING: AgentInstall = { source: 'none' }

/** The PATH first, then the known folders. Both ways use one file test. */
export const searchAgent = async (
  spec: AgentSpec,
  env: SearchEnv,
  folders: readonly string[],
  runnable: Runnable,
): Promise<AgentInstall> => {
  if (spec.commands.length === 0) return NOTHING
  const onPath = (
    await Promise.all(spec.commands.map((command) => findOnPath(command, env, runnable)))
  ).find((found) => found !== undefined)
  if (onPath !== undefined) return { path: onPath, source: 'path' }
  const inFolder = await firstRunnable(
    folders.flatMap((folder) =>
      spec.commands.flatMap((command) =>
        commandNames(command, env.windows, env.pathExt).flatMap(
          (name) => joinFile(env.windows, folder, name) ?? [],
        ),
      ),
    ),
    runnable,
  )
  return inFolder === undefined ? NOTHING : { path: inFolder, source: 'folder' }
}

export const searchAgents = async (
  specs: readonly AgentSpec[],
  env: SearchEnv,
  folders: readonly string[],
  runnable: Runnable,
): Promise<ReadonlyMap<AgentId, AgentInstall>> =>
  new Map(
    await Promise.all(
      specs.map(
        async (spec) => [spec.id, await searchAgent(spec, env, folders, runnable)] as const,
      ),
    ),
  )
