import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { setTimeout as wait } from 'node:timers/promises'

import * as vscode from 'vscode'

import { clickAt, emulateFocus, evaluate, pressKey, targets, workbench } from './keymap/devtools'

export const REVIEW_PAGE = 'body[data-yreview-preview]'

// Reads the foreground window and walks up from this process. It sends no input and moves no window.
const FOREGROUND_SCRIPT = `
Add-Type -Namespace Y -Name U -MemberDefinition '
[DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
[DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);'
$front = 0; $null = [Y.U]::GetWindowThreadProcessId([Y.U]::GetForegroundWindow(), [ref]$front)
$chain = @(1..12 | ForEach-Object -Begin { $id = ${process.pid} } -Process {
  if ($id) { $id; $id = (Get-CimInstance Win32_Process -Filter "ProcessId=$id").ParentProcessId } })
$chain -contains $front`

/** True when the test window has the OS foreground. The focus emulation hides it from the page. */
const inFront = (): boolean =>
  process.platform !== 'win32' ||
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', FOREGROUND_SCRIPT], {
    encoding: 'utf8',
  }).trim() === 'True'

/** Skips a test that sends real keys while another app has the OS focus. Chromium drops those keys. */
export const requireOsFocus = (test: Mocha.Context): void => {
  if (inFront()) return
  const current = test.test
  if (current !== undefined) current.title += ' (skipped: another app has the OS focus)'
  test.skip()
}

/** Gives the editor group the focus inside VS Code. The pages act as focused without the OS focus. */
export const focusWorkbench = async (): Promise<void> => {
  await emulateFocus()
  await vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup')
}

/** Runs a script in the content document `doc` of the webview whose page matches `marker`. */
export const inWebview = async (marker: string, body: string): Promise<unknown> => {
  const script = `(async () => {
    const doc = document.getElementById('active-frame')?.contentDocument
    if (!doc?.querySelector(${JSON.stringify(marker)})) return { missing: true }
    ${body}
  })()`
  await emulateFocus()
  const frames = (await targets()).filter((target) => target.type === 'iframe')
  // A frame that closes during the call is not the page. Any other error fails the test.
  const values = await Promise.all(
    frames.map((frame) =>
      evaluate(frame, script).catch(async (error: unknown) => {
        if ((await targets()).some((target) => target.id === frame.id)) throw error
        return { missing: true }
      }),
    ),
  )
  return values.find((value) => (value as { missing?: boolean } | null)?.missing !== true)
}

/** Waits until the script gives a truthy value in the page. */
export const untilInWebview = async (marker: string, body: string, tries = 40): Promise<boolean> =>
  Boolean(await inWebview(marker, body)) ||
  (tries > 0 && wait(250).then(() => untilInWebview(marker, body, tries - 1)))

/** The keys reach the page, or its element: the workbench, the webview host and the page focus the chain. */
export const keyboardIn = async (marker: string, selector?: string): Promise<boolean> =>
  (await evaluate(
    await workbench(),
    `document.activeElement?.matches('iframe.webview') === true`,
  )) === true &&
  (await inWebview(
    marker,
    `return document.activeElement === document.getElementById('active-frame') &&
      ${selector === undefined ? 'true' : `doc.activeElement === doc.querySelector(${JSON.stringify(selector)})`}`,
  )) === true

/** Waits until the keys reach the page, or its element. */
export const untilKeyboardIn = async (
  marker: string,
  selector?: string,
  tries = 40,
): Promise<boolean> =>
  (await keyboardIn(marker, selector)) ||
  (tries > 0 && wait(250).then(() => untilKeyboardIn(marker, selector, tries - 1)))

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
  // A new webview takes the focus late, and that closes a context menu that is already open.
  assert.ok(await untilKeyboardIn(marker), 'the page did not get the focus before the right-click')
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
  if (!(await shown(20)))
    assert.fail(
      `no menu item "${label}": ${JSON.stringify(
        await evaluate(
          page,
          `({ menus: document.querySelectorAll('.monaco-menu').length,
            focus: document.activeElement?.className ?? null })`,
        ),
      )}`,
    )
  const focus = async (tries: number): Promise<boolean> => {
    await pressKey(keyOf('ArrowUp', 38))
    return (await evaluate(page, focusedLabel)) === label || (tries > 0 && focus(tries - 1))
  }
  assert.ok(await focus(12), `the keys did not reach the menu item "${label}"`)
  await pressKey(keyOf('Enter', 13))
}
