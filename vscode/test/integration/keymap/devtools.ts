import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { request } from 'node:http'
import type { Duplex } from 'node:stream'
import path from 'node:path'
import { setTimeout as wait } from 'node:timers/promises'

/** The DevTools port of the test window. VS Code writes it when it starts with port 0. */
const devtoolsPort = (): string =>
  readFileSync(path.join(process.env.YREVIEW_USER_DATA ?? '', 'DevToolsActivePort'), 'utf8')
    .split('\n')[0]
    ?.trim() ?? ''

export interface Target {
  readonly id: string
  readonly type: string
  readonly url: string
  readonly webSocketDebuggerUrl: string
}

/** A script that throws in the page. A retry cannot change it, so it fails at once. */
class ScriptError extends Error {}

const LOOPBACK_TIMEOUT_MS = 5000
const CALL_TIMEOUT_MS = 15000

/** Runs a loopback call again after a failure, at most `tries` times. A loaded machine drops some. */
const retried = async <T>(call: () => Promise<T>, tries = 5): Promise<T> => {
  try {
    return await call()
  } catch (error) {
    if (tries <= 1 || error instanceof ScriptError) throw error
    await wait(500)
    return retried(call, tries - 1)
  }
}

/** The targets of the port. The port file and the server come late after the start of the host. */
export const targets = (): Promise<readonly Target[]> =>
  retried(
    async () =>
      (await (
        await fetch(`http://127.0.0.1:${devtoolsPort()}/json/list`, {
          signal: AbortSignal.timeout(LOOPBACK_TIMEOUT_MS),
        })
      ).json()) as Target[],
    20,
  )

/** Opens the WebSocket of one DevTools target with the handshake of RFC 6455. */
const connect = (url: string): Promise<Duplex> =>
  new Promise((resolve, reject) => {
    const asked = request(url.replace(/^ws:/u, 'http:'), {
      headers: {
        Connection: 'Upgrade',
        Upgrade: 'websocket',
        'Sec-WebSocket-Version': '13',
        'Sec-WebSocket-Key': randomBytes(16).toString('base64'),
      },
    })
    asked.setTimeout(LOOPBACK_TIMEOUT_MS, () =>
      asked.destroy(new Error(`The DevTools connect took over ${LOOPBACK_TIMEOUT_MS} ms.`)),
    )
    asked.on('upgrade', (_response, socket) => resolve(socket))
    asked.on('response', (response) => reject(new Error(`No upgrade: ${response.statusCode}`)))
    asked.on('error', reject)
    asked.end()
  })

/** One masked text frame from a client. A zero mask key leaves the payload as it is. */
const frame = (text: string): Buffer => {
  const body = Buffer.from(text)
  const head =
    body.length < 126
      ? Buffer.from([0x81, 0x80 + body.length])
      : Buffer.from([0x81, 0x80 + 126, Math.floor(body.length / 256), body.length % 256])
  return Buffer.concat([head, Buffer.alloc(4), body])
}

/** The offset and the length of the payload of the frame at the start of `data`. */
const payloadOf = (data: Buffer): [number, number] => {
  const short = (data[1] ?? 0) % 128
  if (short < 126) return [2, short]
  const start = short === 126 ? 4 : 10
  if (data.length < start) return [start, Infinity]
  return [start, short === 126 ? data.readUInt16BE(2) : Number(data.readBigUInt64BE(2))]
}

/** The complete unmasked frames at the start of `data`, and the bytes after them. */
const unframe = (data: Buffer, found: readonly string[] = []): [readonly string[], Buffer] => {
  if (data.length < 2) return [found, data]
  const [start, size] = payloadOf(data)
  return data.length < start + size
    ? [found, data]
    : unframe(data.subarray(start + size), [
        ...found,
        data.subarray(start, start + size).toString('utf8'),
      ])
}

/** A DevTools session on one target. Each call resolves with the result of the protocol method. */
export const attach = async (target: Target) => {
  const socket = await retried(() => connect(target.webSocketDebuggerUrl))
  const waiting = new Map<number, (reply: { result?: unknown; error?: unknown }) => void>()
  const state: { rest: Buffer; next: number } = { rest: Buffer.alloc(0), next: 1 }
  const fail = (error: Error): void =>
    [...waiting.values()].forEach((settle) => settle({ error: error.message }))
  socket.on('error', fail)
  socket.on('close', () => fail(new Error('The DevTools socket closed.')))
  socket.on('data', (data: Buffer) => {
    const [texts, rest] = unframe(Buffer.concat([state.rest, data]))
    state.rest = rest
    texts.forEach((text) => {
      const reply = JSON.parse(text) as { id?: number; result?: unknown; error?: unknown }
      if (reply.id !== undefined) waiting.get(reply.id)?.(reply)
    })
  })
  return {
    call: (method: string, params: object = {}): Promise<unknown> =>
      new Promise((resolve, reject) => {
        const id = state.next
        state.next += 1
        const timer = setTimeout(
          () => waiting.get(id)?.({ error: `no reply in ${CALL_TIMEOUT_MS} ms` }),
          CALL_TIMEOUT_MS,
        )
        waiting.set(id, (reply) => {
          clearTimeout(timer)
          waiting.delete(id)
          if (reply.error === undefined) resolve(reply.result)
          else reject(new Error(`${method}: ${JSON.stringify(reply.error)}`))
        })
        socket.write(frame(JSON.stringify({ id, method, params })))
      }),
    close: () => socket.destroy(),
  }
}

/** Runs a script expression in a target, and gives its value. A promise resolves first. */
export const evaluate = (target: Target, expression: string): Promise<unknown> =>
  retried(async () => {
    const session = await attach(target)
    try {
      const reply = (await session.call('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true,
      })) as { result?: { value?: unknown }; exceptionDetails?: unknown }
      if (reply.exceptionDetails !== undefined)
        throw new ScriptError(`The script failed: ${JSON.stringify(reply.exceptionDetails)}`)
      return reply.result?.value
    } finally {
      session.close()
    }
  }, 3)

/** The workbench page of the test window. The port lists it late after the start of the host. */
export const workbench = (): Promise<Target> =>
  retried(
    async () =>
      (await targets()).find((target) => target.type === 'page') ??
      Promise.reject(new Error('The DevTools port shows no workbench page.')),
    20,
  )

type Session = Awaited<ReturnType<typeof attach>>

/** The sessions that keep the focus emulation on. Chromium ends the emulation with its session. */
const emulating = new Map<string, Promise<Session>>()

/** Makes each page and frame act as focused, so the focus works while another app has the OS focus. */
export const emulateFocus = async (): Promise<void> => {
  const listed = (await targets()).filter(
    (target) => target.type === 'page' || target.type === 'iframe',
  )
  const ids = new Set(listed.map((target) => target.id))
  ;[...emulating]
    .filter(([id]) => !ids.has(id))
    .forEach(([id, session]) => {
      emulating.delete(id)
      session.then((open) => open.close()).catch(() => undefined)
    })
  listed
    .filter((target) => !emulating.has(target.id))
    .forEach((target) =>
      emulating.set(
        target.id,
        attach(target).then(async (session) => {
          await session.call('Emulation.setFocusEmulationEnabled', { enabled: true })
          return session
        }),
      ),
    )
  await Promise.all(emulating.values())
}

/** Sends a real key press to the focused element of the workbench. Modifier bits: 2 Ctrl, 4 Meta. */
export const pressKey = async (event: object): Promise<void> => {
  const session = await attach(await workbench())
  try {
    await session.call('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...event })
    await session.call('Input.dispatchKeyEvent', { type: 'keyUp', ...event })
  } finally {
    session.close()
  }
}

/** Sends a real click to a point of the workbench page. */
export const clickAt = async (x: number, y: number, button = 'left'): Promise<void> => {
  const session = await attach(await workbench())
  const mouse = (type: string) =>
    session.call('Input.dispatchMouseEvent', { type, x, y, button, clickCount: 1 })
  try {
    // A menu item takes a click only after the pointer rests on it for a moment.
    await session.call('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
    await wait(300)
    await mouse('mousePressed')
    await mouse('mouseReleased')
  } finally {
    session.close()
  }
}

/** Sends a real Ctrl+Enter, or Cmd+Enter on macOS, to the focused element of the workbench. */
export const pressSaveKey = (): Promise<void> =>
  pressKey({
    key: 'Enter',
    code: 'Enter',
    windowsVirtualKeyCode: 13,
    nativeVirtualKeyCode: 13,
    modifiers: process.platform === 'darwin' ? 4 : 2,
  })
