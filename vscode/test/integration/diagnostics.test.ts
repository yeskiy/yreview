import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync, realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'

import * as vscode from 'vscode'

import type { YreviewApi } from '../../src/extension'

const workspace = (): string =>
  vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? assert.fail('no workspace')
const spelled = (folder: string): string => folder.replaceAll('\\', '/').toLowerCase()
const git = (...args: string[]): string =>
  execFileSync('git', args, { cwd: workspace(), encoding: 'utf8' })
const api = async (): Promise<YreviewApi> =>
  (
    vscode.extensions.getExtension<YreviewApi>('yeskiy.yreview') ?? assert.fail('no extension')
  ).activate()
// The command gives the report back, so a probe does not depend on the clipboard of the machine.
const report = async (): Promise<string> => {
  const text = await vscode.commands.executeCommand<string | undefined>(
    'yreview.copyDiagnosticReport',
  )
  assert.ok(text?.startsWith('Yreview diagnostic report'), text)
  return text ?? ''
}

describe('diagnostics', () => {
  it('copies a report with the versions and no folder of the user', async () => {
    await vscode.commands.executeCommand('yreview.copyDiagnosticReport')
    const text = await vscode.env.clipboard.readText()
    assert.ok(text.startsWith('Yreview diagnostic report'), text)
    assert.match(text, /extension {6}1\.\d+\.\d+/)
    assert.match(text, /Records, newest first/)
    ;[workspace(), realpathSync.native(workspace()), homedir()].forEach((folder) =>
      assert.ok(!text.toLowerCase().includes(spelled(folder)), `the report names ${folder}`),
    )
  })

  it('gives back the report text with no folder of the user', async () => {
    const text = (await report()).toLowerCase()
    ;[workspace(), realpathSync.native(workspace()), homedir()].forEach((folder) =>
      assert.ok(!text.includes(spelled(folder)), `the report names ${folder}`),
    )
  })

  it('registers the hidden failure report', async () =>
    assert.ok((await vscode.commands.getCommands(true)).includes('yreview.reportFailure')))

  describe('with private values in the window', () => {
    const remote = 'https://github.com/probe-corp/probe-remote.git'
    const comment = 'Probe comment text 7f3q, keep it private.'
    const file = (): vscode.Uri => vscode.Uri.file(path.join(workspace(), 'src', 'a.txt'))
    const controller = vscode.comments.createCommentController('yreview-probe', 'Probe')

    before(async () => {
      git('remote', 'add', 'probe', remote)
      await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(file()))
      const draft = controller.createCommentThread(file(), new vscode.Range(0, 0, 0, 0), [])
      await vscode.commands.executeCommand('yreview.saveLocal', { thread: draft, text: comment })
    })

    after(async () => {
      git('remote', 'remove', 'probe')
      const comments = (await api()).comments ?? assert.fail('the comment features are off')
      await comments.reload(file())
      await comments
        .snapshot(file())
        .reduce<Promise<unknown>>(
          (done, shown) =>
            done.then(() => vscode.commands.executeCommand('yreview.resolve', shown.thread)),
          Promise.resolve(),
        )
      controller.dispose()
    })

    it('carries no bridge token, remote, mail address or comment text', async () => {
      const lookup = (await (await api()).bridge?.start()) ?? assert.fail('no bridge')
      if (lookup.kind !== 'available') return assert.fail(lookup.kind)
      const token = String(
        (JSON.parse(readFileSync(lookup.path, 'utf8')) as { token?: unknown }).token,
      )
      assert.match(token, /^[0-9a-f]{64}$/)
      assert.match(git('notes', '--ref', 'refs/notes/y-review/local', 'show', 'HEAD'), /7f3q/)
      assert.match(git('remote', 'get-url', 'probe'), /probe-remote/)
      const text = (await report()).toLowerCase()
      return [
        ['bridge token', token],
        ['bridge token part', token.slice(0, 16)],
        ['remote URL', remote],
        ['mail address', git('config', 'user.email').trim()],
        ['comment text', comment],
        ['comment text part', 'probe comment'],
      ].forEach(([name, value]) =>
        assert.ok(!text.includes((value ?? '').toLowerCase()), `the report carries the ${name}`),
      )
    })
  })
})
