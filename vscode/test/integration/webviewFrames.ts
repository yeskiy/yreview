import assert from 'node:assert/strict'
import { setTimeout as wait } from 'node:timers/promises'

import { clickAt, evaluate, pressKey, targets, workbench } from './keymap/devtools'

export const REVIEW_PAGE = 'body[data-yreview-preview]'

/** Runs a script in the content document `doc` of the webview whose page matches `marker`. */
export const inWebview = async (marker: string, body: string): Promise<unknown> => {
  const script = `(async () => {
    const doc = document.getElementById('active-frame')?.contentDocument
    if (!doc?.querySelector(${JSON.stringify(marker)})) return { missing: true }
    ${body}
  })()`
  const frames = (await targets()).filter((target) => target.type === 'iframe')
  const values = await Promise.all(
    frames.map((frame) => evaluate(frame, script).catch(() => ({ missing: true }))),
  )
  return values.find((value) => (value as { missing?: boolean } | null)?.missing !== true)
}

/** Waits until the script gives a truthy value in the page. */
export const untilInWebview = async (marker: string, body: string, tries = 40): Promise<boolean> =>
  Boolean(await inWebview(marker, body)) ||
  (tries > 0 && wait(250).then(() => untilInWebview(marker, body, tries - 1)))

/** The top left point of the visible webview in the workbench page. */
export const webviewOrigin = async (): Promise<{ x: number; y: number }> =>
  ((await evaluate(
    await workbench(),
    `(() => {
      const rect = [...document.querySelectorAll('iframe.webview')]
        .map((node) => node.getBoundingClientRect())
        .find((box) => box.width > 0)
      return rect === undefined ? null : { x: rect.left, y: rect.top }
    })()`,
  )) as { x: number; y: number } | null) ?? assert.fail('no visible webview')

/** Presses the real add key: Ctrl+Alt+G, or Cmd+Alt+G on macOS. */
export const pressAddKey = (): Promise<void> =>
  pressKey({
    key: 'g',
    code: 'KeyG',
    windowsVirtualKeyCode: 71,
    nativeVirtualKeyCode: 71,
    // The DevTools modifier bits are 1 for Alt, 2 for Ctrl, and 4 for Meta.
    modifiers: process.platform === 'darwin' ? 5 : 3,
  })

/** Right-clicks the first element of the page that matches `selector`, with a real mouse. */
export const rightClickAt = async (marker: string, selector: string): Promise<void> => {
  const inner = (await inWebview(
    marker,
    `const rect = doc.querySelector(${JSON.stringify(selector)}).getBoundingClientRect()
     return { x: rect.left + 5, y: rect.top + rect.height / 2 }`,
  )) as { x: number; y: number }
  const { x, y } = await webviewOrigin()
  await clickAt(x + inner.x, y + inner.y, 'right')
}

const keyOf = (key: string, code: number) => ({
  key,
  code: key,
  windowsVirtualKeyCode: code,
  nativeVirtualKeyCode: code,
})

/** Selects the item of the open context menu that has this label, with the arrow keys and Enter. */
export const chooseMenuItem = async (label: string): Promise<void> => {
  // A mouse click on a menu item leaves a press in the page that takes the focus of later tests.
  const labels = `[...document.querySelectorAll('.monaco-menu .action-label')].map((n) => n.textContent)`
  const focusedLabel = `document.querySelector('.monaco-menu .action-item.focused .action-label')?.textContent ?? null`
  const page = await workbench()
  const shown = async (tries: number): Promise<boolean> =>
    ((await evaluate(page, labels)) as string[]).includes(label) ||
    (tries > 0 && wait(250).then(() => shown(tries - 1)))
  assert.ok(await shown(20), `no menu item "${label}"`)
  const focus = async (tries: number): Promise<boolean> => {
    await pressKey(keyOf('ArrowUp', 38))
    return (await evaluate(page, focusedLabel)) === label || (tries > 0 && focus(tries - 1))
  }
  assert.ok(await focus(12), `the keys did not reach the menu item "${label}"`)
  await pressKey(keyOf('Enter', 13))
}
