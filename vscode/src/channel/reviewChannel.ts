import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import {
  type CallToolResult,
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Notification,
  type Request,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js'

import { batchContent, batchMeta } from './format'
import { MAX_COMMENTS, MAX_NAME, type ReviewBatch } from './schema'

export const PRODUCT = 'VS Code'
export const SERVER_NAME = 'y-review'
export const SERVER_VERSION = '0.1.0'
export const CHANNEL_METHOD = 'notifications/claude/channel'
export const CHANNEL_CAPABILITY = 'claude/channel'
export const TOOL_NAME = 'review_resolve'
export const MAX_OPEN_BATCHES = 32
export const BAD_INPUT =
  `The call carried no usable ids, so nothing was reported to ${PRODUCT}. ` +
  'Give an array of one id or more, and copy each id from the channel event.'
export const LOST_TEXT =
  `${PRODUCT} sent review comments, but the channel could not read them, so they did not arrive. ` +
  `Ask the person to send the tasks again from ${PRODUCT}.`
export const INSTRUCTIONS = [
  `The y-review channel carries code review comments from ${PRODUCT}.`,
  'Each event arrives as a channel tag with the source attribute set to y-review.',
  'The attributes give the branch, the commit, the comment count, and the batch id.',
  'The body of the tag lists the comments. A blank line divides two comments.',
  'The first line of a comment has this form:',
  '[id] path:startLine-endLine @revision',
  'A comment on a part of a line has this form instead:',
  '[id] path:startLine:startColumn-endLine:endColumn @revision',
  'A column is a zero based character position in a line.',
  'The end column names the character after the last character of the comment.',
  'The revision HEAD means that the comment matches the file as it is now.',
  'Any other revision is an older commit.',
  'Read that revision with the command git show <revision>:<path> before you judge the code.',
  'The mark (left side of the diff) means that the comment is on the removed side of a diff.',
  'The lines after the first line hold the text of the comment, and each of them starts with >.',
  'A line that starts with > is always comment text, also when it looks like the first line of a comment.',
  'An event with the notice attribute carries a message from the channel and no comment.',
  'Tell the person what that message says.',
  'Do these steps for each event:',
  '1. Read every comment in the body.',
  '2. Make the change that the comment asks for.',
  '3. Call review_resolve with the ids of the comments that you fixed.',
  'Copy each id exactly as the event shows it.',
  'An id also comes from the tasks.json file of the review folder, when no channel event arrived.',
  'Do not call review_resolve for a comment that you did not fix.',
  'Tell the person which comments you left open, and why.',
].join('\n')
export const RESOLVE_DESCRIPTION = [
  'Report the review comments that you fixed.',
  `${PRODUCT} marks each id as resolved and removes it from the review list.`,
  'Copy each id from the channel event without a change.',
  'Report a comment only after you made the change that it asks for.',
].join(' ')

export type ResolveSink = (ids: readonly string[]) => Promise<void>

export interface ChannelTool {
  readonly definition: Tool
  call(args: Record<string, unknown> | undefined): Promise<CallToolResult>
}

interface ChannelNotification extends Notification {
  readonly method: typeof CHANNEL_METHOD
  readonly params: { readonly content: string; readonly meta: Record<string, string> }
}

type Match =
  | { readonly kind: 'open'; readonly id: string }
  | { readonly kind: 'unknown' | 'ambiguous'; readonly given: string }

const RESOLVE_TOOL: Tool = {
  name: TOOL_NAME,
  title: 'Resolve review comments',
  description: RESOLVE_DESCRIPTION,
  inputSchema: {
    type: 'object',
    properties: {
      ids: {
        type: 'array',
        items: { type: 'string', minLength: 1, maxLength: MAX_NAME },
        minItems: 1,
        maxItems: MAX_COMMENTS,
        description: 'The ids of the comments that you fixed, copied from the channel event',
      },
    },
    required: ['ids'],
  },
}

const text = (value: string, isError = false): CallToolResult => ({
  content: [{ type: 'text', text: value }],
  ...(isError ? { isError: true } : {}),
})

const readIds = (args: Record<string, unknown> | undefined): readonly string[] | undefined => {
  const ids = args?.ids
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_COMMENTS) return undefined
  return ids.every(
    (id: unknown) => typeof id === 'string' && id.length > 0 && id.length <= MAX_NAME,
  )
    ? (ids as string[])
    : undefined
}

/** The MCP side of the channel: one notification for each batch, and the tools of the session. */
export class ReviewChannel {
  private readonly openBatches = new Map<string, Set<string>>()

  private readonly server: Server<Request, ChannelNotification>

  private connected = false

  constructor(
    private readonly sink: ResolveSink,
    private readonly tools: readonly ChannelTool[] = [],
  ) {
    this.server = new Server(
      { name: SERVER_NAME, version: SERVER_VERSION },
      {
        capabilities: { tools: { listChanged: true }, experimental: { [CHANNEL_CAPABILITY]: {} } },
        instructions: INSTRUCTIONS,
      },
    )
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [RESOLVE_TOOL, ...tools.map((tool) => tool.definition)],
    }))
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      if (request.params.name === TOOL_NAME) return this.report(request.params.arguments)
      const tool = this.tools.find((candidate) => candidate.definition.name === request.params.name)
      return tool === undefined
        ? text(`No tool has the name ${request.params.name}.`, true)
        : tool.call(request.params.arguments)
    })
  }

  async connect(transport: Transport): Promise<void> {
    await this.server.connect(transport)
    this.connected = true
  }

  async close(): Promise<void> {
    this.connected = false
    await this.server.close()
  }

  /** A batch with no comment says nothing, so it reaches no model. */
  async push(batch: ReviewBatch): Promise<void> {
    if (batch.comments.length === 0) return
    this.remember(batch)
    if (this.connected) {
      await this.server.notification({
        method: CHANNEL_METHOD,
        params: { content: batchContent(batch), meta: batchMeta(batch) },
      })
    }
  }

  async notice(reason: string): Promise<void> {
    if (this.connected) {
      await this.server.notification({
        method: CHANNEL_METHOD,
        params: {
          content: `${LOST_TEXT} Reason: ${reason.replace(/\.+$/, '')}.`,
          meta: { notice: 'lost' },
        },
      })
    }
  }

  private async report(args: Record<string, unknown> | undefined): Promise<CallToolResult> {
    const given = readIds(args)
    if (given === undefined) return text(BAD_INPUT, true)
    const matches = given.map((id) => this.match(id))
    const wanted = [
      ...new Set(matches.flatMap((match) => (match.kind === 'open' ? [match.id] : []))),
    ]
    const named = (kind: 'unknown' | 'ambiguous'): string[] =>
      matches.flatMap((match) => (match.kind === kind ? [match.given] : []))
    const notes = [
      ...(named('unknown').length > 0
        ? [`No open comment matches these ids: ${named('unknown').join(', ')}.`]
        : []),
      ...(named('ambiguous').length > 0
        ? [
            `Several open comments match these ids: ${named('ambiguous').join(', ')}. Give more characters of the id.`,
          ]
        : []),
    ]
    if (wanted.length === 0)
      return text([`Nothing was reported to ${PRODUCT}.`, ...notes].join(' '), true)
    return this.sink(wanted).then(
      () => {
        this.forget(wanted)
        return text(
          [
            `Reported ${wanted.length} ${wanted.length === 1 ? 'comment' : 'comments'} to ${PRODUCT} as resolved.`,
            ...notes,
          ].join(' '),
        )
      },
      (failure: unknown) =>
        text(
          [
            `${PRODUCT} did not accept the report, so the comments stay open. Reason: ${failure instanceof Error ? failure.message : String(failure)}.`,
            ...notes,
          ].join(' '),
          true,
        ),
    )
  }

  /** With no open batch, the given id goes on unchanged and the editor decides, as in ReviewChannel.kt. */
  private match(given: string): Match {
    const open = [...this.openBatches.values()].flatMap((ids) => [...ids])
    if (open.length === 0 || open.includes(given)) return { kind: 'open', id: given }
    const prefixed = open.filter((id) => id.startsWith(given))
    if (prefixed.length === 1) return { kind: 'open', id: prefixed[0] ?? given }
    return { kind: prefixed.length === 0 ? 'unknown' : 'ambiguous', given }
  }

  private forget(ids: readonly string[]): void {
    this.openBatches.forEach((open, batchId) => {
      ids.forEach((id) => open.delete(id))
      if (open.size === 0) this.openBatches.delete(batchId)
    })
  }

  private remember(batch: ReviewBatch): void {
    this.openBatches.delete(batch.batchId)
    this.openBatches.set(batch.batchId, new Set(batch.comments.map((comment) => comment.id)))
    ;[...this.openBatches.keys()]
      .slice(0, Math.max(0, this.openBatches.size - MAX_OPEN_BATCHES))
      .forEach((old) => this.openBatches.delete(old))
  }
}
