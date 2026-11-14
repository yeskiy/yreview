import type { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js'

import type { Answer } from './bridgeClient'
import type { ChannelTool } from './reviewChannel'

export const LIST_TOOL = 'review_list_comments'
export const RESOLVE_COMMENT_TOOL = 'review_resolve_comment'
export const ADD_TOOL = 'review_add_comment'
export const OPEN_TOOL = 'review_open_comment'
export const BAD_TOOL_INPUT =
  'The call carried an argument of the wrong type or size, so VS Code did nothing.'

export const LIST_DESCRIPTION = [
  'Lists the review comments of this project.',
  'A person writes these comments in VS Code to ask for a change in the code.',
  'Read them first, then do what each comment asks.',
  'The answer is a JSON object with one "comments" array. Each item holds these fields:',
  '- "id", the value the other review tools need',
  '- "path", the file inside its git repository or inside its folder store',
  '- "startLine" and "endLine", one based line numbers. 0 means the whole file',
  '- "startColumn" and "endColumn", zero based character positions in a line. A comment',
  '  holds them only when it covers a part of a line. "endColumn" names the character',
  '  after the last character of the comment',
  '- "revision", the git commit that the comment belongs to, or "worktree" for a comment',
  '  of a folder that no git repository holds',
  '- "author", "text", "shared" and "resolved"',
].join('\n')
export const RESOLVE_COMMENT_DESCRIPTION = [
  'Marks one review comment as resolved.',
  'Call this after you made the change the comment asks for.',
  'The comment stays in the store as history. The answer is a JSON object with the id',
  'and "resolved": true, or an "error" field when the id is unknown.',
].join('\n')
export const ADD_DESCRIPTION = [
  'Writes a new review comment on a range of lines, so a person reads it later.',
  'Use this to record a finding you do not want to fix yourself.',
  'Yreview anchors the comment to the current commit of the file. A file that no git',
  'repository holds keeps its comments in a folder store, and there the revision is "worktree".',
  'The answer is a JSON object with the new "id", or an "error" field.',
].join('\n')
export const OPEN_DESCRIPTION = [
  'Shows one review comment to the person at VS Code.',
  'VS Code opens the file at that line. When the comment belongs to an older commit,',
  'VS Code opens the diff between that commit and the working tree instead.',
  'Call this when you want the person to look at the code you discuss.',
  'The answer names what VS Code opened, "file" or "diff", or holds an "error" field.',
].join('\n')

export interface BridgeCalls {
  request(method: 'GET' | 'POST', path: string, body?: unknown): Promise<Answer>
}

const ID_INPUT = {
  type: 'string',
  minLength: 1,
  maxLength: 200,
  description: 'The id of the comment. Use a value from review_list_comments.',
}

const definitions: readonly Tool[] = [
  {
    name: LIST_TOOL,
    description: LIST_DESCRIPTION,
    annotations: { readOnlyHint: true, openWorldHint: false },
    inputSchema: {
      type: 'object',
      properties: {
        resolved: {
          type: 'boolean',
          description:
            'Pass true to list the comments a person marked as resolved. The default lists the open comments.',
        },
        includeAnalyses: {
          type: 'boolean',
          description: 'Pass true to also list the comments a machine wrote.',
        },
        includeLocal: {
          type: 'boolean',
          description: 'Pass false to leave out the private comments that stay on this computer.',
        },
      },
    },
  },
  {
    name: RESOLVE_COMMENT_TOOL,
    description: RESOLVE_COMMENT_DESCRIPTION,
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    inputSchema: { type: 'object', properties: { id: ID_INPUT }, required: ['id'] },
  },
  {
    name: ADD_TOOL,
    description: ADD_DESCRIPTION,
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          minLength: 1,
          maxLength: 1024,
          description:
            'Path of the file, relative to the root of the project. The tool refuses a path outside the project.',
        },
        startLine: {
          type: 'integer',
          description: 'First line of the comment. Line numbers start at 1.',
        },
        endLine: {
          type: 'integer',
          description: 'Last line of the comment. Pass the same value as startLine for one line.',
        },
        text: {
          type: 'string',
          minLength: 1,
          maxLength: 20_000,
          description: 'The comment text a person reads.',
        },
      },
      required: ['path', 'startLine', 'endLine', 'text'],
    },
  },
  {
    name: OPEN_TOOL,
    description: OPEN_DESCRIPTION,
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    inputSchema: { type: 'object', properties: { id: ID_INPUT }, required: ['id'] },
  },
]

const failed = (value: string): CallToolResult => ({
  content: [{ type: 'text', text: value }],
  isError: true,
})
const isBool = (value: unknown): boolean => value === undefined || typeof value === 'boolean'
const isText = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= max

/** The text of a route answer. A refusal, a bad body, or a status outside 2xx is an error result. */
const forward = async (call: Promise<Answer>): Promise<CallToolResult> =>
  call.then(
    (answer) => ({
      content: [{ type: 'text' as const, text: answer.text }],
      ...(answer.status < 200 || answer.status > 299 || answer.text.includes('"error":')
        ? { isError: true }
        : {}),
    }),
    (failure: unknown) =>
      failed(
        JSON.stringify({
          error: `The review bridge did not answer: ${failure instanceof Error ? failure.message : String(failure)}`,
        }),
      ),
  )

export const reviewTools = (bridge: BridgeCalls): readonly ChannelTool[] => {
  const calls: Readonly<
    Record<string, (args: Record<string, unknown>) => Promise<CallToolResult>>
  > = {
    [LIST_TOOL]: async (args) =>
      isBool(args.resolved) && isBool(args.includeAnalyses) && isBool(args.includeLocal)
        ? forward(
            bridge.request(
              'GET',
              `/comments?resolved=${args.resolved === true}&analyses=${args.includeAnalyses === true}&local=${args.includeLocal !== false}`,
            ),
          )
        : failed(BAD_TOOL_INPUT),
    [RESOLVE_COMMENT_TOOL]: async (args) =>
      isText(args.id, 200)
        ? forward(bridge.request('POST', '/comments/resolve', { id: args.id }))
        : failed(BAD_TOOL_INPUT),
    [OPEN_TOOL]: async (args) =>
      isText(args.id, 200)
        ? forward(bridge.request('POST', '/comments/open', { id: args.id }))
        : failed(BAD_TOOL_INPUT),
    [ADD_TOOL]: async (args) =>
      isText(args.path, 1024) &&
      Number.isInteger(args.startLine) &&
      Number.isInteger(args.endLine) &&
      isText(args.text, 20_000)
        ? forward(
            bridge.request('POST', '/comments', {
              path: args.path,
              startLine: args.startLine,
              endLine: args.endLine,
              text: args.text,
            }),
          )
        : failed(BAD_TOOL_INPUT),
  }
  return definitions.map((definition) => ({
    definition,
    call: (args) => (calls[definition.name] ?? (async () => failed(BAD_TOOL_INPUT)))(args ?? {}),
  }))
}
