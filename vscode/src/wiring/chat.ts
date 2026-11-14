import * as vscode from 'vscode'

import { FILE_VARIABLE } from '../bridge/discoveryFile'
import type { AvailableLookup } from '../bridge/host'
import {
  ADD_TOOL,
  BAD_TOOL_INPUT,
  LIST_TOOL,
  OPEN_TOOL,
  RESOLVE_COMMENT_TOOL,
} from '../channel/reviewTools'
import type { Log } from '../log'
import { type Payload, errorPayload } from '../mcp/payloads'
import { SERVER_NAME, channelLaunch } from '../session/channelConfig'
import type { BridgeWiring } from './bridge'

type Input = Readonly<Record<string, unknown>>

interface CursorServer {
  readonly name: string
  readonly server: {
    readonly command: string
    readonly args: readonly string[]
    readonly env: Readonly<Record<string, string>>
  }
}

export interface CursorMcp {
  registerServer(config: CursorServer): void
  unregisterServer(name: string): void
}

const isFlag = (value: unknown): boolean => value === undefined || typeof value === 'boolean'
const isText = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= max

/** The checks of the channel server, because another extension can call a tool with any input. */
const calls = (
  tools: BridgeWiring['tools'],
): Readonly<Record<string, (input: Input) => Promise<Payload>>> => ({
  [LIST_TOOL]: async (input) =>
    isFlag(input.resolved) && isFlag(input.includeAnalyses) && isFlag(input.includeLocal)
      ? tools.list(
          input.resolved === true,
          input.includeAnalyses === true,
          input.includeLocal !== false,
        )
      : errorPayload(BAD_TOOL_INPUT),
  [RESOLVE_COMMENT_TOOL]: async (input) =>
    isText(input.id, 200) ? tools.resolveComment(input.id) : errorPayload(BAD_TOOL_INPUT),
  [ADD_TOOL]: async (input) =>
    isText(input.path, 1024) &&
    Number.isInteger(input.startLine) &&
    Number.isInteger(input.endLine) &&
    isText(input.text, 20_000)
      ? tools.addComment(input.path, Number(input.startLine), Number(input.endLine), input.text)
      : errorPayload(BAD_TOOL_INPUT),
  [OPEN_TOOL]: async (input) =>
    isText(input.id, 200) ? tools.openComment(input.id) : errorPayload(BAD_TOOL_INPUT),
})

/** Each open of the bridge registers the server again, so Cursor gets the launch data of that open. */
const registerInCursor = (
  context: vscode.ExtensionContext,
  cursor: CursorMcp,
  wiring: BridgeWiring,
  log: Log,
): void => {
  const state = { registered: false }
  const unregister = (): void => {
    if (state.registered) cursor.unregisterServer(SERVER_NAME)
    state.registered = false
  }
  const register = (lookup: AvailableLookup): void => {
    try {
      unregister()
      const launch = channelLaunch(wiring.script)
      cursor.registerServer({
        name: SERVER_NAME,
        server: { ...launch, env: { ...launch.env, [FILE_VARIABLE]: lookup.path } },
      })
      state.registered = true
    } catch (error) {
      log.error('The review server did not register in Cursor.', error)
    }
  }
  context.subscriptions.push(wiring.host.onOpen(register), { dispose: unregister })
  wiring.host
    .start()
    .then((lookup) => {
      if (lookup.kind === 'available') {
        if (!state.registered) register(lookup)
        return
      }
      log.warn(
        'The review tools did not register in Cursor, because the bridge is not open. The next bridge start tries again.',
      )
    })
    .catch((error: unknown) => log.error('The review server did not register in Cursor.', error))
}

const cursorOfHost = (): CursorMcp | undefined =>
  (vscode as unknown as { readonly cursor?: { readonly mcp?: CursorMcp } }).cursor?.mcp

/** Cursor reads no language model tool, so it gets the stdio server instead. Only one route registers, so no tool shows twice. */
export const registerChatTools = (
  context: vscode.ExtensionContext,
  wiring: BridgeWiring,
  log: Log,
  cursor: CursorMcp | undefined = cursorOfHost(),
): void => {
  if (cursor !== undefined) {
    registerInCursor(context, cursor, wiring, log)
    return
  }
  context.subscriptions.push(
    ...Object.entries(calls(wiring.tools)).map(([name, call]) =>
      vscode.lm.registerTool<unknown>(name, {
        invoke: async (options) =>
          new vscode.LanguageModelToolResult([
            new vscode.LanguageModelTextPart(
              JSON.stringify(
                await call(
                  typeof options.input === 'object' && options.input !== null
                    ? (options.input as Input)
                    : {},
                ),
              ),
            ),
          ]),
      }),
    ),
  )
}
