import { existsSync, statSync } from 'node:fs'
import path from 'node:path'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import {
  StdioClientTransport,
  getDefaultEnvironment,
} from '@modelcontextprotocol/sdk/client/stdio.js'
import { build } from 'esbuild'

import { scratchDir } from '../../fixtures/scratch'

export interface ChannelRun {
  readonly notes: { method: string; params?: Record<string, unknown> }[]
  readonly client: Client
  close(): Promise<void>
}

export interface ChannelCommand {
  readonly name: 'node' | 'kotlin'
  readonly command: string
  readonly args: readonly string[]
}

const KOTLIN_MAIN = 'com.yeskiy.yreview.channel.MainKt'

const isFile = (file: string | undefined): file is string =>
  file !== undefined && file !== '' && existsSync(file) && statSync(file).isFile()

const javaOf = (home: string | undefined): string | undefined =>
  home === undefined || home === ''
    ? undefined
    : ['java', 'java.exe'].map((name) => path.join(home, 'bin', name)).find(isFile)

/** One bundle for the whole run, so the unit run needs no `npm run build` first. */
const held: { bundle?: Promise<string> } = {}
const bundle = (): Promise<string> => {
  held.bundle ??= (async () => {
    const outfile = path.join(scratchDir(), 'channel.js')
    await build({
      entryPoints: ['src/channel/main.ts'],
      bundle: true,
      platform: 'node',
      target: 'node22',
      format: 'cjs',
      mainFields: ['module', 'main'],
      logLevel: 'silent',
      outfile,
    })
    return outfile
  })()
  return held.bundle
}

/** The `node` row always. The `kotlin` row when YREVIEW_CHANNEL_JAR and JAVA_HOME name files. */
export const channelCommands = async (): Promise<readonly ChannelCommand[]> => {
  const jar = process.env.YREVIEW_CHANNEL_JAR
  const java = javaOf(process.env.JAVA_HOME)
  return [
    { name: 'node', command: process.execPath, args: [await bundle()] },
    ...(isFile(jar) && java !== undefined
      ? [{ name: 'kotlin' as const, command: java, args: ['-cp', jar, KOTLIN_MAIN] }]
      : []),
  ]
}

export const startChannel = async (
  command: ChannelCommand,
  bridgeFile: string,
  key?: string,
): Promise<ChannelRun> => {
  const transport = new StdioClientTransport({
    command: command.command,
    args: [...command.args],
    env: {
      ...getDefaultEnvironment(),
      Y_REVIEW_BRIDGE_FILE: bridgeFile,
      ...(key === undefined ? {} : { Y_REVIEW_SESSION_KEY: key }),
    },
    stderr: 'ignore',
  })
  const client = new Client({ name: 'contract-test', version: '0.0.0' })
  const notes: ChannelRun['notes'] = []
  client.fallbackNotificationHandler = async (notification) => {
    notes.push(notification)
  }
  await client.connect(transport)
  return { notes, client, close: () => client.close() }
}
