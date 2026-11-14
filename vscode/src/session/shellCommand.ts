import { isKotlinBlank } from '../core/kotlinText'

/** A variable that the shell reads from a file and sets for the agent. The value never shows. */
export interface SecretVariable {
  readonly name: string
  readonly path: string
}

export const FALLBACK_SHELL = '/bin/sh'
export const NO_SECRET = 'The extension wrote no secret for this session, so the session stops.'

const WSL_PATH = /^\/mnt\/([a-zA-Z])(\/.*)?$/

/** A WSL path becomes a Windows path, and a trailing slash drops, except on a drive root. */
export const windowsPath = (raw: string): string => {
  const slashes = raw.replaceAll('\\', '/')
  const wsl = WSL_PATH.exec(slashes)
  const windows = wsl ? `${(wsl[1] ?? '').toUpperCase()}:${wsl[2] ?? '/'}` : slashes
  return windows.length > 3 && windows.endsWith('/') ? windows.slice(0, -1) : windows
}

export const onWindows = (): boolean => process.platform === 'win32'

export const workingDirectory = (raw: string, windows = onWindows()): string =>
  windows ? windowsPath(raw) : raw

// PowerShell ends a literal at a single quote, and two quotes stand for one.
export const powerShellQuote = (value: string): string => `'${value.replaceAll("'", "''")}'`
// A POSIX literal holds no escape, so the literal closes and opens again.
const posixQuote = (value: string): string => `'${value.replaceAll("'", "'\\''")}'`

/** Reads the file into the variable, removes the file, and stops the line when the value is empty. */
const secretPrefix = (secret: SecretVariable | undefined, windows: boolean): string => {
  if (secret === undefined) return ''
  return windows
    ? `$env:${secret.name} = (Get-Content -LiteralPath ${powerShellQuote(secret.path)}); ` +
        `Remove-Item -LiteralPath ${powerShellQuote(secret.path)} -Force; ` +
        `if ([string]::IsNullOrEmpty($env:${secret.name})) ` +
        `{ Write-Error ${powerShellQuote(NO_SECRET)}; exit 1 }; `
    : `${secret.name}="$(cat ${posixQuote(secret.path)} && rm -f ${posixQuote(secret.path)})"; ` +
        `if [ -z "$${secret.name}" ]; ` +
        `then echo ${posixQuote(NO_SECRET)} >&2; exit 1; fi; ` +
        `export ${secret.name}; `
}

/** One shell line. Every part is a literal, so a space or a leading `--` reaches the agent unchanged. */
export const shellLine = (
  parts: readonly string[],
  secret?: SecretVariable,
  windows = onWindows(),
): string =>
  windows
    ? `${secretPrefix(secret, true)}& ${parts.map(powerShellQuote).join(' ')}`
    : `${secretPrefix(secret, false)}${parts.map(posixQuote).join(' ')}`

export const loginShell = (env: NodeJS.ProcessEnv = process.env): string =>
  env.SHELL === undefined || isKotlinBlank(env.SHELL) ? FALLBACK_SHELL : env.SHELL

/** The terminal process. The profile of the user loads, and no flag keeps the shell after the agent. */
export const shellCommand = (
  parts: readonly string[],
  secret?: SecretVariable,
  windows = onWindows(),
  shell = loginShell(),
): readonly string[] =>
  windows
    ? ['powershell.exe', '-NoLogo', '-Command', shellLine(parts, secret, true)]
    : [shell, '-l', '-c', shellLine(parts, secret, false)]
