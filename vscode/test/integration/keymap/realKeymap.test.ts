import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { setTimeout as wait } from 'node:timers/promises'

import { parse } from 'jsonc-parser'
import * as vscode from 'vscode'

import type { YreviewApi } from '../../../src/extension'
import type { Log } from '../../../src/log'
import {
  installedExtensions,
  offerSaveKey,
  openUserKeybindings,
  type SaveKeyParts,
  saveKeyConflicts,
  saveKeyPlaceholder,
} from '../../../src/saveKey'
import { findSaveKeyConflicts, OWN_ID, SAVE_COMMAND, SAVE_WHEN } from '../../../src/saveKeyCore'

import { focusWindow, until } from '../window'
import { pressSaveKey } from './devtools'

const KEYMAP_ID = 'k--kato.intellij-idea-keybindings'
const SAVE_KEY = process.platform === 'darwin' ? 'cmd+enter' : 'ctrl+enter'
// The keymap gives Cmd+Enter to Smart Line Split on macOS, and Ctrl+Enter to Go to Declaration.
const KEYMAP_COMMAND =
  process.platform === 'darwin' ? 'lineBreakInsert' : 'editor.action.goToDeclaration'

const userData = (): string => process.env.YREVIEW_USER_DATA ?? assert.fail('no user data folder')
const workspace = (): string =>
  vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? assert.fail('no workspace')
const comments = async () =>
  (
    await (
      vscode.extensions.getExtension<YreviewApi>(OWN_ID) ?? assert.fail('no extension')
    ).activate()
  ).comments ?? assert.fail('the comment features are off')
const fileWith = (name: string, text: string): vscode.Uri => {
  const file = path.join(workspace(), 'keymap', name)
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, text)
  return vscode.Uri.file(file)
}
const userKeybindings = (): string => path.join(userData(), 'User', 'keybindings.json')

/** The resolution lines of the keybindings log, from the newest renderer log of the test window. */
const resolutions = (): string[] => {
  const logs = readdirSync(path.join(userData(), 'logs'), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name === 'renderer.log')
    .map((entry) => path.join(entry.parentPath, entry.name))
    .sort((one, two) => statSync(two).mtimeMs - statSync(one).mtimeMs)
  return readFileSync(logs[0] ?? assert.fail('no renderer log'), 'utf8')
    .split('\n')
    .filter((line) => line.includes('[KeybindingService]: \\ '))
}

/** Presses the save key and gives the command and the source that VS Code resolved for it. */
const pressAndResolve = async (): Promise<string> => {
  const before = resolutions().length
  await pressSaveKey()
  assert.ok(await until(() => resolutions().length > before), 'the key press left no log line')
  const line = resolutions()[before] ?? ''
  return (
    /matched (\S+), when: .*, source: (.+)\.$/u.exec(line.trim())?.slice(1).join(' from ') ?? line
  )
}

const log: Log = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: (message) => assert.fail(message),
  record: () => undefined,
}

const memory = (): vscode.Memento => {
  const values = new Map<string, unknown>()
  return {
    keys: () => [...values.keys()],
    get: <T>(key: string, fallback?: T) => (values.has(key) ? (values.get(key) as T) : fallback),
    update: (key: string, value: unknown) => {
      values.set(key, value)
      return Promise.resolve()
    },
  }
}

// Without the own manifest, the detection sees the keymap entry as the winner, as for a keymap
// with an entry above the own save entry.
const withoutOwn: SaveKeyParts = {
  platform: process.platform,
  installed: () => installedExtensions().filter((extension) => extension.id !== OWN_ID),
  ask: () => Promise.resolve('Add'),
  openKeybindings: openUserKeybindings,
}

/** Types into a new comment box on a file of its own, and gives the resolution of the save key. */
const saveInBox = async (name: string, text: string) => {
  const uri = fileWith(`${name}.md`, '# Box\n\nSome text.\n')
  const editor = await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(uri))
  await focusWindow()
  editor.selection = new vscode.Selection(2, 0, 2, 4)
  await vscode.commands.executeCommand('yreview.addComment')
  await wait(1500)
  await vscode.commands.executeCommand('type', { text })
  const resolved = await pressAndResolve()
  const box = await comments()
  const saved = await until(
    () =>
      box
        .snapshot(uri)
        .some((shown) => (shown.thread.comments[0]?.body as vscode.MarkdownString).value === text),
    12,
  )
  assert.equal(editor.document.isDirty, false, 'the text went into the file, not into the box')
  if (!saved) await vscode.commands.executeCommand('yreview.closeBox')
  return { resolved, saved }
}

/** Presses the save key in a text editor and gives its resolution. */
const pressInEditor = async (): Promise<string> => {
  const uri = fileWith('plain.txt', 'alpha beta\n')
  const editor = await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(uri))
  await focusWindow()
  editor.selection = new vscode.Selection(0, 2, 0, 2)
  const resolved = await pressAndResolve()
  await wait(500)
  if (editor.document.isDirty) await vscode.commands.executeCommand('workbench.action.files.revert')
  return resolved
}

describe('save key with the real IntelliJ IDEA Keybindings extension', () => {
  before(async function installKeymap() {
    this.timeout(300000)
    if (vscode.extensions.getExtension(KEYMAP_ID) === undefined)
      await vscode.commands.executeCommand('workbench.extensions.installExtension', KEYMAP_ID)
    assert.ok(
      await until(() => vscode.extensions.getExtension(KEYMAP_ID) !== undefined, 240),
      'the keymap extension did not install in the test profile',
    )
    // The keybindings log writes each key resolution into the renderer log.
    await vscode.commands.executeCommand('workbench.action.toggleKeybindingsLog')
  })

  it('finds the Ctrl+Enter binding of the keymap on each platform', () => {
    ;['win32', 'linux', 'darwin'].forEach((platform) => {
      const found = findSaveKeyConflicts(installedExtensions(), platform)
      assert.ok(
        found.some((conflict) => conflict.extension === 'IntelliJ IDEA Keybindings'),
        `${platform}: ${JSON.stringify(found)}`,
      )
    })
  })

  it('the own save entry ranks above the keymap, so no offer and no hint show', async () => {
    const parts = { ...withoutOwn, installed: installedExtensions }
    ;['win32', 'linux', 'darwin'].forEach((platform) =>
      assert.deepEqual(saveKeyConflicts({ ...parts, platform }), []),
    )
    assert.doesNotMatch(
      await saveKeyPlaceholder(vscode.Uri.file(userKeybindings()), parts),
      /Use Ctrl\+Enter/u,
    )
  })

  it('the save key saves in the comment box and keeps the keymap command in an editor', async () => {
    assert.deepEqual(await saveInBox('own', 'Saved by the own entry.'), {
      resolved: `${SAVE_COMMAND} from user extension ${OWN_ID}`,
      saved: true,
    })
    assert.equal(await pressInEditor(), `${KEYMAP_COMMAND} from user extension ${KEYMAP_ID}`)
  })

  it('the save key saves the draft editor of a commented line and keeps the keymap command in an editor', async () => {
    const uri = fileWith('draft.md', '# Draft\n\nSome text.\n')
    const controller = vscode.comments.createCommentController('yreview-keymap-test', 'Test')
    await vscode.commands.executeCommand('yreview.saveLocal', {
      thread: controller.createCommentThread(uri, new vscode.Range(2, 0, 2, 0), []),
      text: 'The first comment.',
    })
    controller.dispose()
    const box = await comments()
    assert.ok(await until(() => box.snapshot(uri).length === 1), 'the first comment did not save')
    const editor = await vscode.window.showTextDocument(
      await vscode.workspace.openTextDocument(uri),
    )
    await focusWindow()
    editor.selection = new vscode.Selection(2, 0, 2, 4)
    await vscode.commands.executeCommand('yreview.addComment')
    assert.ok(
      await until(() => vscode.window.activeTextEditor?.document.uri.scheme === 'yreview-draft'),
      'no draft editor opened',
    )
    const text = 'Saved from the draft editor.'
    await vscode.commands.executeCommand('type', { text })
    assert.equal(await pressAndResolve(), `yreview.draft.save from user extension ${OWN_ID}`)
    assert.ok(
      await until(() =>
        box
          .snapshot(uri)
          .some(
            (shown) => (shown.thread.comments[0]?.body as vscode.MarkdownString).value === text,
          ),
      ),
      'the draft did not save',
    )
    assert.ok(
      await until(() => vscode.window.activeTextEditor?.document.uri.toString() === uri.toString()),
      'the focus did not go back to the source',
    )
    assert.equal(await pressInEditor(), `${KEYMAP_COMMAND} from user extension ${KEYMAP_ID}`)
  })

  it('without the own entry the keymap wins, and the user entry of Add wins back', async () => {
    // A user removal takes away each default save entry, the own entry of the manifest too.
    writeFileSync(userKeybindings(), `[{ "key": "${SAVE_KEY}", "command": "-${SAVE_COMMAND}" }]\n`)
    await wait(2000)
    const lost = await saveInBox('removed', 'Not saved.')
    assert.deepEqual(lost, {
      resolved: `${KEYMAP_COMMAND} from user extension ${KEYMAP_ID}`,
      saved: false,
    })
    const file = vscode.Uri.file(userKeybindings())
    assert.match(await saveKeyPlaceholder(file, withoutOwn), /Use Ctrl\+Enter/u)

    await offerSaveKey(memory(), log, withoutOwn)
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor')
    assert.deepEqual((parse(readFileSync(userKeybindings(), 'utf8')) as unknown[]).slice(-1), [
      { key: SAVE_KEY, command: SAVE_COMMAND, when: SAVE_WHEN },
    ])
    assert.doesNotMatch(await saveKeyPlaceholder(file, withoutOwn), /Use Ctrl\+Enter/u)
    await wait(2000)
    assert.deepEqual(await saveInBox('user', 'Saved by the user entry.'), {
      resolved: `${SAVE_COMMAND} from user`,
      saved: true,
    })
    assert.equal(await pressInEditor(), `${KEYMAP_COMMAND} from user extension ${KEYMAP_ID}`)
  })
})
