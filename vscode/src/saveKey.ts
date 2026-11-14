import path from 'node:path'

import * as vscode from 'vscode'

import type { Log } from './log'
import { findSaveKeyConflicts, type Installed, runSaveKeyOffer, saveKeyEdits } from './saveKeyCore'

const ANSWER = 'yreview.saveKeyAnswer'

export interface SaveKeyParts {
  readonly platform: string
  readonly installed: () => readonly Installed[]
  readonly ask: (message: string, ...items: string[]) => Promise<string | undefined>
  readonly openKeybindings: () => Promise<vscode.TextDocument>
}

export const installedExtensions = (): readonly Installed[] =>
  vscode.extensions.all.map((extension) => {
    const manifest = extension.packageJSON as {
      readonly displayName?: unknown
      readonly contributes?: { readonly keybindings?: unknown }
    }
    return {
      id: extension.id,
      name: typeof manifest.displayName === 'string' ? manifest.displayName : extension.id,
      bindings: manifest.contributes?.keybindings,
    }
  })

const openUserKeybindings = async (): Promise<vscode.TextDocument> => {
  await vscode.commands.executeCommand('workbench.action.openGlobalKeybindingsFile')
  const document = vscode.window.activeTextEditor?.document
  if (document === undefined || path.basename(document.uri.path) !== 'keybindings.json')
    throw new Error('VS Code did not open the user keybindings file.')
  return document
}

const DEFAULT_PARTS: SaveKeyParts = {
  platform: process.platform,
  installed: installedExtensions,
  ask: (message, ...items) =>
    Promise.resolve(vscode.window.showInformationMessage(message, ...items)),
  openKeybindings: openUserKeybindings,
}

const addEntry = async (parts: SaveKeyParts): Promise<void> => {
  const document = await parts.openKeybindings()
  const editor = vscode.workspace.getConfiguration('editor', document)
  const edits = saveKeyEdits(document.getText(), parts.platform, {
    insertSpaces: editor.get<boolean>('insertSpaces', true),
    tabSize: editor.get<number>('tabSize', 4),
    eol: document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n',
  })
  if (edits.length === 0) return
  const change = new vscode.WorkspaceEdit()
  edits.forEach((edit) =>
    change.replace(
      document.uri,
      new vscode.Range(
        document.positionAt(edit.offset),
        document.positionAt(edit.offset + edit.length),
      ),
      edit.content,
    ),
  )
  if (!(await vscode.workspace.applyEdit(change)))
    throw new Error('VS Code did not apply the edit.')
  if (!(await document.save())) throw new Error('VS Code did not save the keybindings file.')
}

/** Offers a user key binding when a keymap extension takes the save key of the comment box. */
export const offerSaveKey = (
  state: vscode.Memento,
  log: Log,
  parts: SaveKeyParts = DEFAULT_PARTS,
): Promise<void> =>
  runSaveKeyOffer({
    platform: parts.platform,
    answer: () => state.get<string>(ANSWER),
    saveAnswer: (value) => Promise.resolve(state.update(ANSWER, value)),
    conflicts: () => findSaveKeyConflicts(parts.installed(), parts.platform),
    ask: parts.ask,
    addEntry: () => addEntry(parts),
    showManual: async (line, failure) => {
      log.error('Yreview could not add the key binding.', failure)
      await parts.openKeybindings().catch((error: unknown) => {
        log.error('Yreview could not open the keybindings file.', error)
      })
      await vscode.window.showWarningMessage(
        `Yreview could not add the key binding. Add this line to keybindings.json: ${line}`,
      )
    },
  })
