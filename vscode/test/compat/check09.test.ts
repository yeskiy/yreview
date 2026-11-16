import assert from 'node:assert/strict'

import * as vscode from 'vscode'

import { api } from '../integration/previewKit'
import { until } from '../integration/window'
import { clickElement } from './kit'

/** The window.ts guard of the test bundles keeps each openExternal target here. */
const opened = (): string[] => (globalThis as { yreviewExternal?: string[] }).yreviewExternal ?? []

describe('check 9', () => {
  it('The Report button opens the issue form', async () => {
    await api()
    // A resolve with no thread fails, so the error message shows its Report button.
    const failing = Promise.resolve(vscode.commands.executeCommand('yreview.resolve', {}))
    await clickElement('.notification-toast .monaco-button', 'Report')
    await clickElement('.monaco-dialog-box .monaco-button', 'Open Form')
    await failing
    assert.ok(await until(() => opened().length > 0), 'the Report button opened nothing')
    const targets = opened().splice(0)
    assert.equal(targets.length, 1, JSON.stringify(targets))
    assert.match(targets[0] ?? '', /^https:\/\/github\.com\/yeskiy\/yreview\/issues\/new\?title=/)
  })
})
