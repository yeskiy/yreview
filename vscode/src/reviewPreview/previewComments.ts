import * as vscode from 'vscode'

import type { ReviewComments } from '../comments/controller'
import type { Log } from '../log'
import { watchNotes } from '../noteWatch'
import { fitted } from '../preview/previewLines'
import type { ReviewService } from '../store/reviewService'
import { gitApi, watchHeads } from '../views/repositories'
import { marksOf } from './marks'
import type { ReviewPreview } from './previewPanel'
import type { ReviewPreviews } from './reviewPreviews'

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

/** Sends the open comments of the file of one preview. A load that a newer one replaces sends nothing. */
const sendMarks = async (
  preview: ReviewPreview,
  service: ReviewService,
  turn: () => number,
): Promise<void> => {
  const mine = turn()
  const found = await service.anchorOf(preview.uri.fsPath)
  const marks = found.kind === 'found' ? marksOf(await service.placedAt(found.anchor)) : []
  if (mine === turn()) await preview.post({ type: 'marks', marks })
}

/** The comment part of the review previews: saves, resolves, deletes, reveals and marks. */
export const commentHooks = (
  previews: ReviewPreviews,
  service: ReviewService,
  comments: ReviewComments,
  log: Log,
): vscode.Disposable => {
  const turns = { count: 0 }
  const send = (preview: ReviewPreview): void => {
    sendMarks(preview, service, () => turns.count).catch((error: unknown) =>
      log.error('The review preview marks failed.', error),
    )
  }
  const refresh = (): void => {
    turns.count += 1
    previews.all().forEach(send)
  }
  previews.setHooks({
    onReady: send,
    onMessage: async (preview, message) => {
      if (message.type === 'save') {
        const document = await vscode.workspace.openTextDocument(preview.uri)
        const lines = fitted(
          message.lines,
          document.lineCount,
          (line) => document.lineAt(line).isEmptyOrWhitespace,
        )
        try {
          if (lines === undefined) throw new Error('The selected lines are not in the file.')
          await comments.addAt(preview.uri, lines, message.text, message.shared)
          await preview.post({ type: 'saved' })
          refresh()
        } catch (error) {
          await preview.post({ type: 'failed', message: messageOf(error) })
        }
        return true
      }
      if (message.type === 'resolve' || message.type === 'delete') {
        try {
          if (message.type === 'resolve') await comments.resolveId(preview.uri, message.id)
          else await comments.deleteId(preview.uri, message.id)
          refresh()
        } catch (error) {
          vscode.window.showErrorMessage(messageOf(error)).then(undefined, () => undefined)
        }
        return true
      }
      if (message.type === 'reveal') {
        await preview.showSource()
        await comments.reveal(preview.uri, message.id)
        return true
      }
      if (message.type === 'noLines') {
        vscode.window
          .showInformationMessage('Select text in the review preview, then add the comment.')
          .then(undefined, () => undefined)
        return true
      }
      return false
    },
  })
  const heads = gitApi().then((api) => watchHeads(api, refresh))
  const disposables = [
    { dispose: service.onDidChange(refresh) },
    ...watchNotes(refresh, 300),
    vscode.workspace.onDidSaveTextDocument((document) => {
      if (previews.all().some((preview) => preview.uri.toString() === document.uri.toString()))
        refresh()
    }),
  ]
  return {
    dispose: () => {
      disposables.forEach((disposable) => disposable.dispose())
      heads.then(
        (watch) => watch.dispose(),
        () => undefined,
      )
    },
  }
}
