import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { request } from 'node:http'
import type { Duplex } from 'node:stream'
import path from 'node:path'

/** The DevTools port of the test window. VS Code writes it when it starts with port 0. */
const devtoolsPort = (): string =>
  readFileSync(path.join(process.env.YREVIEW_USER_DATA ?? '', 'DevToolsActivePort'), 'utf8')
    .split('\n')[0]
    ?.trim() ?? ''

interface Target {
  readonly type: string
  readonly webSocketDebuggerUrl: string
}

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

/** Sends a real Ctrl+Enter, or Cmd+Enter on macOS, to the focused element of the workbench. */
export const pressSaveKey = async (): Promise<void> => {
  const targets = (await (
    await fetch(`http://127.0.0.1:${devtoolsPort()}/json/list`)
  ).json()) as Target[]
  const page = targets.find((target) => target.type === 'page')
  if (page === undefined) throw new Error('The DevTools port shows no workbench page.')
  const socket = await connect(page.webSocketDebuggerUrl)
  // The DevTools modifier bits are 2 for Ctrl and 4 for Meta.
  const event = {
    key: 'Enter',
    code: 'Enter',
    windowsVirtualKeyCode: 13,
    nativeVirtualKeyCode: 13,
    modifiers: process.platform === 'darwin' ? 4 : 2,
  }
  const send = (id: number, type: string): Promise<void> =>
    new Promise((resolve) => {
      const reply = (data: Buffer): void => {
        if (!data.toString('utf8').includes(`"id":${id}`)) return
        socket.off('data', reply)
        resolve()
      }
      socket.on('data', reply)
      socket.write(
        frame(JSON.stringify({ id, method: 'Input.dispatchKeyEvent', params: { type, ...event } })),
      )
    })
  await send(1, 'rawKeyDown')
  await send(2, 'keyUp')
  socket.destroy()
}
