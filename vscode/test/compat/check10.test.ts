import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { setTimeout as wait } from 'node:timers/promises'

import * as vscode from 'vscode'

import { api } from '../integration/previewKit'
import { until } from '../integration/window'

describe('check 10', () => {
  it('The log export holds the Yreview log', async () => {
    await api()
    const target = vscode.Uri.file(path.join(tmpdir(), `yreview-export-${Date.now()}.log`))
    const exported = Promise.resolve(
      vscode.commands.executeCommand('workbench.action.exportLogs', {
        outputPath: target,
        outputChannelIds: ['*'],
      }),
    )
    const done = await Promise.race([exported.then(() => true), wait(20_000).then(() => false)])
    if (!done) {
      await vscode.commands.executeCommand('workbench.action.closeQuickOpen')
      assert.fail('Developer: Export Logs asks for a pick, so it takes no target in this editor')
    }
    assert.ok(
      await until(() => existsSync(target.fsPath)),
      'Developer: Export Logs wrote no file on the host of Yreview',
    )
    assert.match(readFileSync(target.fsPath, 'utf8'), /Yreview started\./)
  })
})
