import assert from 'node:assert/strict'

import * as vscode from 'vscode'

import { api } from '../integration/previewKit'
import { until } from '../integration/window'
import { clickElement, eventually, pointOf } from './kit'

/** The window.ts guard of the test bundles keeps each openExternal target here. */
const opened = (): string[] => (globalThis as { yreviewExternal?: string[] }).yreviewExternal ?? []

describe('check 9', () => {
  it('The Report button opens the issue form', async function run() {
    await api()
    // A test host refuses every modal dialog, so the privacy question gets its answer here.
    const original = vscode.window.showInformationMessage
    const asked: string[] = []
    Object.defineProperty(vscode.window, 'showInformationMessage', {
      configurable: true,
      value: async (message: string, ...rest: unknown[]) => {
        asked.push(message)
        return rest.includes('Open Form') ? 'Open Form' : undefined
      },
    })
    try {
      // A resolve with no thread fails, so the error message shows its Report button.
      const failing = Promise.resolve(vscode.commands.executeCommand('yreview.resolve', {}))
      // An editor can hide the toast, and the notification center still holds the message.
      const toast = await eventually(
        async () => (await pointOf('.notification-toast .monaco-button', 'Report')) !== null,
        20,
      )
      if (toast) await clickElement('.notification-toast .monaco-button', 'Report')
      else {
        await vscode.commands.executeCommand('notifications.showList')
        await clickElement('.notifications-center .monaco-button', 'Report')
        const test = this.test ?? assert.fail()
        test.title += ' (note: the error shows in the notification center, not as a toast)'
      }
      await failing
      assert.ok(await until(() => opened().length > 0), `nothing opened: ${JSON.stringify(asked)}`)
    } finally {
      Object.defineProperty(vscode.window, 'showInformationMessage', { value: original })
    }
    assert.match(asked[0] ?? '', /opens a new issue form/)
    const targets = opened().splice(0)
    assert.equal(targets.length, 1, JSON.stringify(targets))
    assert.match(targets[0] ?? '', /^https:\/\/github\.com\/yeskiy\/yreview\/issues\/new\?title=/)
  })
})
