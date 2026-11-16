import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { setTimeout as wait } from 'node:timers/promises'

import * as vscode from 'vscode'

import { clickAt, evaluate, workbench } from '../integration/keymap/devtools'
import { REVIEW_PAGE, untilInWebview } from '../integration/webviewFrames'
import { api, workspace } from '../integration/previewKit'
import { until } from '../integration/window'

/** The file config.json beside the bundle. The launcher writes it for each run. */
export interface CompatConfig {
  readonly setup: string
  readonly files: readonly string[]
  readonly results: string
  readonly userData: string
  readonly expectedHost: string
  readonly second: string
  readonly bridgeRecord: string
  readonly version: string
}

export const config = (): CompatConfig =>
  JSON.parse(readFileSync(path.join(__dirname, 'config.json'), 'utf8')) as CompatConfig

export const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()

export const fileOf = (name: string): vscode.Uri => vscode.Uri.file(path.join(workspace(), name))

/** Polls an async check, four times a second. */
export const eventually = async (check: () => Promise<boolean>, tries = 60): Promise<boolean> =>
  (await check().catch(() => false)) ||
  (tries > 0 && wait(250).then(() => eventually(check, tries - 1)))

/** The center of the first visible element of the workbench that matches the selector and the text. */
export const pointOf = async (
  selector: string,
  text = '',
): Promise<{ x: number; y: number } | null> =>
  (await evaluate(
    await workbench(),
    `(() => {
      const box = [...document.querySelectorAll(${JSON.stringify(selector)})]
        .filter((node) => (node.textContent ?? '').includes(${JSON.stringify(text)}) ||
          (node.getAttribute('aria-label') ?? '').includes(${JSON.stringify(text)}))
        .map((node) => node.getBoundingClientRect())
        .find((rect) => rect.width > 0 && rect.height > 0)
      return box === undefined ? null : { x: box.left + box.width / 2, y: box.top + box.height / 2 }
    })()`,
  )) as { x: number; y: number } | null

/** Clicks the element with a real mouse, after it shows. */
export const clickElement = async (selector: string, text = ''): Promise<void> => {
  const found = async (tries: number): Promise<{ x: number; y: number }> =>
    (await pointOf(selector, text)) ??
    (tries > 0
      ? wait(250).then(() => found(tries - 1))
      : assert.fail(`no visible element ${selector} with "${text}"`))
  const { x, y } = await found(60)
  await clickAt(x, y)
}

export const reviewFile = (): vscode.Uri => fileOf(path.join('src', 'review.md'))

/** Opens the review preview of review.md beside the source, and waits for its content. */
export const openReviewPreview = async (): Promise<void> => {
  const editor = await vscode.window.showTextDocument(reviewFile(), {
    viewColumn: vscode.ViewColumn.One,
    preview: false,
  })
  editor.revealRange(new vscode.Range(0, 0, 0, 0), vscode.TextEditorRevealType.AtTop)
  await vscode.commands.executeCommand('yreview.openReviewPreview')
  const previews = (await api()).reviewPreviews ?? assert.fail('no review previews')
  assert.ok(
    await until(() => previews.all().some((one) => one.uri.fsPath === reviewFile().fsPath)),
    'no review preview',
  )
  await (
    previews.all().find((one) => one.uri.fsPath === reviewFile().fsPath) ?? assert.fail()
  ).whenReady()
  assert.ok(
    await untilInWebview(
      REVIEW_PAGE,
      `return doc.querySelector('[data-line-end]') !== null && doc.body.textContent.includes('First line of a paragraph.')`,
    ),
    'the review preview shows no content',
  )
}

/** The open comments of review.md, read from the notes, with 0-based lines. */
export const savedInReview = async (): Promise<
  readonly { text: string; lines: number[]; id: string }[]
> => {
  const service = (await api()).service ?? assert.fail('no service')
  const found = await service.anchorOf(reviewFile().fsPath)
  if (found.kind !== 'found') return []
  return (await service.placedAt(found.anchor)).flatMap(({ stored, carry }) =>
    (carry.kind === 'same' || carry.kind === 'outdated') && carry.range !== undefined
      ? [
          {
            text: stored.record.description ?? '',
            lines: [carry.range.startLine - 1, carry.range.endLine - 1],
            id: stored.id,
          },
        ]
      : [],
  )
}

/** Deletes the open comments of review.md. The delete question gets the answer Delete. */
export const deleteReviewComments = async (): Promise<void> => {
  const comments = (await api()).comments ?? assert.fail('no comments')
  const original = vscode.window.showWarningMessage
  Object.defineProperty(vscode.window, 'showWarningMessage', {
    configurable: true,
    value: async () => 'Delete',
  })
  try {
    await (
      await savedInReview()
    ).reduce<Promise<unknown>>(
      (done, one) => done.then(() => comments.deleteId(reviewFile(), one.id)),
      Promise.resolve(),
    )
  } finally {
    Object.defineProperty(vscode.window, 'showWarningMessage', { value: original })
  }
}
