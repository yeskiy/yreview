import path from 'node:path'

import * as vscode from 'vscode'

import type { Log } from './log'
import {
  type Conflict,
  findSaveKeyConflicts,
  hasUserEntry,
  type Installed,
  OWN_ID,
  ownSaveIndex,
  placeholderText,
  runSaveKeyOffer,
  saveKeyEdits,
} from './saveKeyCore'

const ANSWER = 'yreview.saveKeyAnswer'
const KEYBINDINGS = 'keybindings.json'

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

/** The conflicts that rank above the own save entry of the manifest. */
export const saveKeyConflicts = (parts: SaveKeyParts): readonly Conflict[] => {
  const installed = parts.installed()
  const own = installed.find((extension) => extension.id.toLowerCase() === OWN_ID)
  return findSaveKeyConflicts(
    installed,
    parts.platform,
    ownSaveIndex(own?.bindings, parts.platform),
  )
}

export const openUserKeybindings = async (): Promise<vscode.TextDocument> => {
  await vscode.commands.executeCommand('workbench.action.openGlobalKeybindingsFile')
  const document = vscode.window.activeTextEditor?.document
  if (document === undefined || path.basename(document.uri.path) !== KEYBINDINGS)
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

/** Adds the entry. False when the file has the entry already. */
const addEntry = async (parts: SaveKeyParts): Promise<boolean> => {
  const document = await parts.openKeybindings()
  const editor = vscode.workspace.getConfiguration('editor', document)
  const edits = saveKeyEdits(document.getText(), parts.platform, {
    insertSpaces: editor.get<boolean>('insertSpaces', true),
    tabSize: editor.get<number>('tabSize', 4),
    eol: document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n',
  })
  if (edits.length === 0) return false
  const draft = document.isDirty
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
  // An unsaved draft of the user stays unsaved, so the user saves it with the new entry.
  if (!draft && !(await document.save()))
    throw new Error('VS Code did not save the keybindings file.')
  return true
}

/** Offers a user key binding when a keymap extension takes the save key of the comment box. */
export const offerSaveKey = (
  state: vscode.Memento,
  log: Log,
  parts: SaveKeyParts = DEFAULT_PARTS,
  forced = false,
): Promise<void> =>
  runSaveKeyOffer(
    {
      platform: parts.platform,
      answer: () => state.get<string>(ANSWER),
      saveAnswer: (value) => Promise.resolve(state.update(ANSWER, value)),
      conflicts: () => saveKeyConflicts(parts),
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
      note: (message) => log.info(message),
    },
    forced,
  )

/** The user keybindings file of the profile, two folders above the global storage. */
export const userKeybindings = (context: vscode.ExtensionContext): vscode.Uri =>
  vscode.Uri.joinPath(context.globalStorageUri, '..', '..', KEYBINDINGS)

/** A hint while a conflict exists and the user file has no save entry, else the plain text. */
export const saveKeyPlaceholder = async (
  file: vscode.Uri,
  parts: SaveKeyParts = DEFAULT_PARTS,
): Promise<string> => {
  const conflict = saveKeyConflicts(parts)[0]
  if (conflict === undefined) return placeholderText(undefined, parts.platform)
  const source = await vscode.workspace.fs.readFile(file).then(
    (bytes) => new TextDecoder().decode(bytes),
    () => '',
  )
  return placeholderText(
    hasUserEntry(source, parts.platform) ? undefined : conflict,
    parts.platform,
  )
}

/** Starts the one-time offer and the command, and keeps the hint of the comment box current. */
export const registerSaveKey = (
  context: vscode.ExtensionContext,
  log: Log,
  setPlaceholder: (text: string) => void,
): vscode.Disposable[] => {
  const file = userKeybindings(context)
  const refresh = (): void => {
    saveKeyPlaceholder(file)
      .then(setPlaceholder)
      .catch((error: unknown) => log.error('The save key hint failed.', error))
  }
  const offer = (forced: boolean): Promise<void> =>
    offerSaveKey(context.globalState, log, DEFAULT_PARTS, forced)
      .catch((error: unknown) => log.error('The save key offer failed.', error))
      .finally(refresh)
  const noConflict = async (): Promise<void> => {
    log.info('Save key: no extension takes the save key in the comment box.')
    await vscode.window.showInformationMessage(
      'No other extension takes Ctrl+Enter in the comment box, so Ctrl+Enter saves comments.',
    )
  }
  offer(false)
  return [
    vscode.commands.registerCommand('yreview.useSaveKey', () =>
      saveKeyConflicts(DEFAULT_PARTS).length > 0 ? offer(true) : noConflict(),
    ),
    vscode.extensions.onDidChange(refresh),
    vscode.workspace.onDidSaveTextDocument((document) => {
      if (path.basename(document.uri.path) === KEYBINDINGS) refresh()
    }),
  ]
}
