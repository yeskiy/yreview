import path from 'node:path'

import { readIfFile, writeAtomic } from '../core/atomicWrite'
import { needsWrite } from './configFile'

export const launcherPath = (
  home: string,
  windows: boolean = process.platform === 'win32',
): string =>
  path.join(
    home,
    '.y-review',
    'vscode',
    'bin',
    windows ? 'y-review-channel.cmd' : 'y-review-channel',
  )

const posixQuote = (value: string): string => `'${value.replaceAll("'", "'\\''")}'`
const cmdQuote = (value: string): string => `"${value.replaceAll('%', '%%')}"`

/** The launcher holds no secret. It runs the current runtime with the current script. */
export const launcherText = (
  execPath: string,
  script: string,
  windows: boolean = process.platform === 'win32',
): string =>
  windows
    ? [
        '@echo off',
        'set ELECTRON_RUN_AS_NODE=1',
        `${cmdQuote(execPath)} ${cmdQuote(script)} %*`,
        '',
      ].join('\r\n')
    : [
        '#!/bin/sh',
        '# Yreview writes this file again when VS Code moves its runtime.',
        `ELECTRON_RUN_AS_NODE=1 exec ${posixQuote(execPath)} ${posixQuote(script)} "$@"`,
        '',
      ].join('\n')

/** Writes the launcher when its text differs, and gives its path. */
export const ensureLauncher = async (
  home: string,
  execPath: string,
  script: string,
  windows: boolean = process.platform === 'win32',
): Promise<string> => {
  const target = launcherPath(home, windows)
  const wanted = launcherText(execPath, script, windows)
  if (needsWrite(await readIfFile(target), wanted))
    await writeAtomic(target, wanted, windows ? 0o600 : 0o700)
  return target
}
