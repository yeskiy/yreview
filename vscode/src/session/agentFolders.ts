import path from 'node:path'

import { isKotlinBlank } from '../core/kotlinText'

export type Platform = 'windows' | 'mac' | 'linux'

export interface Places {
  readonly home: string | undefined
  readonly appData: string | undefined
  readonly localAppData: string | undefined
  readonly programData: string | undefined
  readonly dataHome: string | undefined
}

/** Takes the Java os.name text or the Node.js process.platform value. */
export const platformOf = (name: string): Platform => {
  const lower = name.toLowerCase()
  if (lower.startsWith('windows') || lower === 'win32') return 'windows'
  return lower.startsWith('mac') || lower.startsWith('darwin') ? 'mac' : 'linux'
}

export const placesOf = (env: NodeJS.ProcessEnv, home: string): Places => ({
  home,
  appData: env.APPDATA,
  localAppData: env.LOCALAPPDATA,
  programData: env.ProgramData,
  dataHome: env.XDG_DATA_HOME,
})

/** Undefined when the first part names no folder. An empty first part would give a relative path. */
const under =
  (join: (...parts: string[]) => string) =>
  (first: string | undefined, ...more: string[]): readonly string[] =>
    first === undefined || isKotlinBlank(first) || first.includes('\0')
      ? []
      : [join(first, ...more)]

const windows = (places: Places): readonly string[] => {
  const at = under((...parts) => path.win32.join(...parts))
  return [
    ...at(places.home, '.local', 'bin'),
    ...at(places.appData, 'npm'),
    ...at(places.localAppData, 'Volta', 'bin'),
    ...at(places.home, 'scoop', 'shims'),
    ...at(places.programData, 'scoop', 'shims'),
    ...at(places.programData, 'chocolatey', 'bin'),
    ...at(places.localAppData, 'pnpm'),
    ...at(places.home, '.bun', 'bin'),
    ...at(places.localAppData, 'agy', 'bin'),
  ]
}

const mac = (places: Places): readonly string[] => {
  const at = under((...parts) => path.posix.join(...parts))
  return [
    '/opt/homebrew/bin',
    '/usr/local/bin',
    ...at(places.home, '.local', 'bin'),
    ...at(places.home, '.npm-global', 'bin'),
    ...at(places.home, '.volta', 'bin'),
    ...at(places.home, 'Library', 'pnpm'),
    ...at(places.home, '.bun', 'bin'),
  ]
}

const linux = (places: Places): readonly string[] => {
  const at = under((...parts) => path.posix.join(...parts))
  const pnpm = at(places.dataHome, 'pnpm')
  return [
    ...at(places.home, '.local', 'bin'),
    '/usr/local/bin',
    ...at(places.home, '.npm-global', 'bin'),
    '/home/linuxbrew/.linuxbrew/bin',
    ...at(places.home, '.volta', 'bin'),
    ...(pnpm.length > 0 ? pnpm : at(places.home, '.local', 'share', 'pnpm')),
    ...at(places.home, '.bun', 'bin'),
    '/snap/bin',
    '/var/lib/flatpak/exports/bin',
    ...at(places.home, '.local', 'share', 'flatpak', 'exports', 'bin'),
  ]
}

/** The folders that hold an agent besides the PATH, for an editor that started with a short PATH. */
export const agentFolders = (platform: Platform, places: Places): readonly string[] => [
  ...new Set({ windows, mac, linux }[platform](places)),
]
