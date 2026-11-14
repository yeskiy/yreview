import { strict as assert } from 'node:assert'

import type { ReviewBatch } from '../../../src/bridge/batch'
import { bridgeFilePath, writeBridgeFile } from '../../../src/bridge/discoveryFile'
import { BridgeServer } from '../../../src/bridge/server'
import { removeDir, scratchDir } from '../../fixtures/scratch'
import { waitFor } from '../channel/fakeBridge'
import {
  type ChannelCommand,
  type ChannelRun,
  channelCommands,
  startChannel,
} from './channelProcess'

const PROJECT = 'E:/work/demo-repo'
const FIRST_KEY = 'aaaaaaaa11111111'
const SECOND_KEY = 'bbbbbbbb22222222'
const CHANNEL_NOTIFICATION = 'notifications/claude/channel'
const SILENCE_MS = 3000
const commit = '4f2c8b1c9d0e1f2a3b4c5d6e7f8091a2b3c4d5e6'
const fullId = 'c3f9a12aabbccddeeff00112233445566778899a'
const text = 'This branch never runs when the input is empty. Add the guard before the loop.'

const batch: ReviewBatch = {
  batchId: 'b7f2a91',
  branch: 'feat/bridge',
  commit,
  comments: [
    {
      id: fullId,
      path: 'src/main/kotlin/Parser.kt',
      startLine: 88,
      endLine: 94,
      revision: commit,
      text,
    },
  ],
}

const partBatch: ReviewBatch = {
  ...batch,
  batchId: 'b7f2a92',
  comments: batch.comments.map((comment) => ({ ...comment, startColumn: 4, endColumn: 9 })),
}

const ROWS: readonly { name: ChannelCommand['name']; title: string }[] = [
  { name: 'node', title: 'node (dist/channel.js)' },
  { name: 'kotlin', title: 'kotlin (skips without YREVIEW_CHANNEL_JAR and JAVA_HOME)' },
]

const channelNotes = (run: ChannelRun): ChannelRun['notes'] =>
  run.notes.filter((note) => note.method === CHANNEL_NOTIFICATION)

ROWS.forEach((row) => {
  describe(`channel contract, TypeScript bridge, ${row.title}`, () => {
    const state: {
      command?: ChannelCommand
      server: BridgeServer
      home: string
      file: string
      reported: (readonly string[])[]
      runs: ChannelRun[]
    } = {
      server: new BridgeServer(async () => undefined),
      home: '',
      file: '',
      reported: [],
      runs: [],
    }

    before(async function findCommand() {
      this.timeout(120_000)
      state.command = (await channelCommands()).find((command) => command.name === row.name)
      if (state.command === undefined) this.skip()
    })

    beforeEach(async () => {
      state.reported = []
      state.runs = []
      state.server = new BridgeServer(async (ids) => {
        state.reported.push([...ids])
        return undefined
      })
      const address = await state.server.start()
      state.home = scratchDir()
      state.file = bridgeFilePath(PROJECT, state.home)
      await writeBridgeFile(state.file, {
        url: address.url,
        token: address.token,
        projectPath: PROJECT,
        pid: process.pid,
      })
    })

    afterEach(async () => {
      await Promise.all(state.runs.map((run) => run.close()))
      await state.server.stop()
      removeDir(state.home)
    })

    const open = async (key?: string): Promise<ChannelRun> => {
      const run = await startChannel(state.command as ChannelCommand, state.file, key)
      state.runs.push(run)
      return run
    }

    const awaitStreams = (count: number): Promise<void> =>
      waitFor('the event stream', () => state.server.streamCount() >= count)

    const firstContent = async (run: ChannelRun): Promise<Record<string, unknown>> => {
      await waitFor('the channel notification', () => channelNotes(run).length > 0)
      return channelNotes(run)[0]?.params ?? {}
    }

    it('the channel turns a batch of the bridge into one channel notification', async () => {
      const run = await open()
      await awaitStreams(1)
      assert.equal(state.server.send(batch), 1)
      const params = await firstContent(run)
      assert.equal(params.content, `[${fullId}] src/main/kotlin/Parser.kt:88-94 @HEAD\n> ${text}`)
      assert.deepEqual(params.meta, {
        branch: 'feat/bridge',
        commit,
        count: '1',
        batch_id: 'b7f2a91',
      })
    })

    it('the channel names the characters of a part of a line', async () => {
      const run = await open()
      await awaitStreams(1)
      assert.equal(state.server.send(partBatch), 1)
      const params = await firstContent(run)
      assert.equal(
        params.content,
        `[${fullId}] src/main/kotlin/Parser.kt:88:4-94:9 @HEAD\n> ${text}`,
      )
    })

    it('the channel reports the full id to the bridge when the model resolves the short id', async () => {
      const run = await open()
      await awaitStreams(1)
      state.server.send(batch)
      await firstContent(run)
      const result = await run.client.callTool({
        name: 'review_resolve',
        arguments: { ids: ['c3f9a12'] },
      })
      assert.equal(result.isError, undefined, JSON.stringify(result))
      assert.deepEqual(state.reported, [[fullId]])
    })

    it('a targeted batch reaches one real session and not the other', async () => {
      const first = await open(FIRST_KEY)
      const second = await open(SECOND_KEY)
      await awaitStreams(2)
      assert.deepEqual([...state.server.openKeys()].sort(), [FIRST_KEY, SECOND_KEY])
      assert.equal(state.server.send(batch, FIRST_KEY), 1)
      const params = await firstContent(first)
      assert.ok(String(params.content).includes('c3f9a12'), JSON.stringify(params))
      await new Promise((resolve) => {
        setTimeout(resolve, SILENCE_MS)
      })
      assert.deepEqual(channelNotes(second), [])
    })

    it('a session without a key still reads a broadcast', async () => {
      const run = await open()
      await awaitStreams(1)
      assert.deepEqual(state.server.openKeys(), [])
      assert.equal(state.server.send(batch), 1)
      await firstContent(run)
    })
  })
})
