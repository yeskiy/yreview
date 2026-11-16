import assert from 'node:assert/strict'
import { homedir } from 'node:os'

import * as vscode from 'vscode'

import { workspace } from '../integration/previewKit'
import { config } from './kit'

const spelled = (folder: string): string => folder.replaceAll('\\', '/').toLowerCase()

describe('check 8', () => {
  it('The diagnostic report holds no remote path', async () => {
    const text =
      (await vscode.commands.executeCommand<string | undefined>('yreview.copyDiagnosticReport')) ??
      assert.fail('the command gave no report')
    assert.ok(text.startsWith('Yreview diagnostic report'), text)
    assert.match(text, new RegExp(`host +${config().expectedHost}\\b`))
    const lower = text.toLowerCase().replaceAll('\\', '/')
    ;[workspace(), config().second, homedir(), __dirname].forEach((folder) =>
      assert.ok(!lower.includes(spelled(folder)), `the report names the folder ${folder}`),
    )
  })
})
