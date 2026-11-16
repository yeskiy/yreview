// Drives the demo scenes inside the extension host under Xvfb, and records them with ffmpeg.
import assert from 'node:assert/strict'
import { type ChildProcess, execFileSync, spawn } from 'node:child_process'
import { once } from 'node:events'
import path from 'node:path'
import { setTimeout as wait } from 'node:timers/promises'

import * as vscode from 'vscode'

import type { YreviewApi } from '../../src/extension'
import { evaluate, workbench } from '../integration/keymap/devtools'
import { REVIEW_PAGE, inWebview, webviewOrigin } from '../integration/webviewFrames'

const out = process.env.DEMO_OUT ?? assert.fail('DEMO_OUT is not set')
const display = process.env.DISPLAY ?? assert.fail('DISPLAY is not set')
const width = Number(process.env.DEMO_WIDTH ?? '1120')
const height = Number(process.env.DEMO_HEIGHT ?? '700')

/** The height of the native window parts above the page, for example a menu bar. */
const page = { top: 0 }
const active: { video?: ChildProcess } = {}

const root = (): string =>
  vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? assert.fail('no workspace')
const fileOf = (name: string): vscode.Uri => vscode.Uri.file(path.join(root(), name))
// eslint-disable-next-line no-console
const say = (text: string): void => console.log(`[demo] ${text}`)

// --- X input ---

const xdo = (...args: string[]): string =>
  execFileSync('xdotool', args, { encoding: 'utf8', env: process.env }).trim()

interface Point {
  readonly x: number
  readonly y: number
}

const pointer = (): Point => {
  const found = /x:(\d+) y:(\d+)/u.exec(xdo('getmouselocation'))
  return { x: Number(found?.[1] ?? 0), y: Number(found?.[2] ?? 0) }
}

const ease = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)

/** Moves the pointer along an eased path, as a hand does. */
const glide = (to: Point, ms = 650): void => {
  const from = pointer()
  const steps = Math.max(8, Math.round(ms / 25))
  xdo(
    ...Array.from({ length: steps }, (_, index) => {
      const t = ease((index + 1) / steps)
      return [
        'mousemove',
        String(Math.round(from.x + (to.x - from.x) * t)),
        String(Math.round(from.y + (to.y - from.y) * t)),
        'sleep',
        String(ms / steps / 1000),
      ]
    }).flat(),
  )
}

const click = async (at: Point, ms = 650): Promise<void> => {
  glide(at, ms)
  await wait(180)
  xdo('click', '1')
}

const drag = async (from: Point, to: Point): Promise<void> => {
  glide(from)
  await wait(250)
  xdo('mousedown', '1')
  glide(to, 900)
  xdo('mouseup', '1')
}

const press = (keys: string): string => xdo('key', '--clearmodifiers', keys)
const typeText = (text: string): string => xdo('type', '--delay', '55', text)

// --- Recording ---

// The capture starts below the native menu bar, so the media show the workbench only.
const grabArgs = (): string[] => ['-f', 'x11grab', '-video_size', `${width}x${height - page.top}`]
const grabInput = (): string => `${display}+0,${page.top}`

const record = (name: string): ChildProcess => {
  say(`record ${name}`)
  active.video = spawn(
    'ffmpeg',
    [
      '-y',
      '-loglevel',
      'error',
      ...grabArgs(),
      '-framerate',
      '15',
      '-draw_mouse',
      '1',
      '-i',
      grabInput(),
      '-c:v',
      'libx264rgb',
      '-preset',
      'ultrafast',
      '-qp',
      '0',
      path.join(out, `${name}.mkv`),
    ],
    { stdio: ['pipe', 'ignore', 'inherit'] },
  )
  return active.video
}

const stop = async (ffmpeg: ChildProcess): Promise<void> => {
  active.video = undefined
  ffmpeg.stdin?.end('q')
  await once(ffmpeg, 'exit')
}

const still = (name: string): void => {
  say(`still ${name}`)
  execFileSync('ffmpeg', [
    '-y',
    '-loglevel',
    'error',
    ...grabArgs(),
    '-draw_mouse',
    '0',
    '-i',
    grabInput(),
    '-frames:v',
    '1',
    path.join(out, `${name}.png`),
  ])
}

// --- Workbench page ---

interface Box {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
}

const center = (box: Box): Point => ({
  x: Math.round(box.x + box.w / 2),
  y: Math.round(box.y + box.h / 2),
})

/** The box of the node that the expression gives in the workbench page, or null. */
const boxIn = async (expression: string): Promise<Box | null> =>
  (await evaluate(
    await workbench(),
    `(() => {
      const node = ${expression}
      if (!node) return null
      const rect = node.getBoundingClientRect()
      return rect.width > 0 ? { x: rect.left, y: rect.top + ${page.top}, w: rect.width, h: rect.height } : null
    })()`,
  )) as Box | null

const untilValue = async <T>(
  check: () => Promise<T | null | undefined | false>,
  what: string,
  tries = 60,
): Promise<T> => {
  const value = await check()
  if (value !== null && value !== undefined && value !== false) return value
  if (tries === 0) return assert.fail(`no ${what}`)
  await wait(250)
  return untilValue(check, what, tries - 1)
}

const boxOf = (expression: string, what: string): Promise<Box> =>
  untilValue(() => boxIn(expression), what)

const visible = (selector: string, filter = 'true'): string =>
  `[...document.querySelectorAll(${JSON.stringify(selector)})].find((node) => node.getClientRects().length > 0 && (${filter}))`

const pageIs = async (expression: string, what: string): Promise<void> => {
  await untilValue(async () => (await evaluate(await workbench(), expression)) === true, what)
}

// --- Editor lines ---

/** The text start, the text end and the middle height of one line of the active text editor. */
const lineOf = (line: number): Promise<{ left: number; right: number; y: number }> =>
  untilValue(
    async () =>
      (await evaluate(
        await workbench(),
        `(() => {
          const editor = [...document.querySelectorAll('.editor-group-container.active .monaco-editor')]
            .find((node) => node.querySelector('.line-numbers') && node.getClientRects().length > 0 && !node.closest('.original-in-monaco-diff-editor'))
          const number = [...(editor?.querySelectorAll('.line-numbers') ?? [])].find((node) => node.textContent.trim() === '${line}')
          if (!number) return null
          const row = number.getBoundingClientRect()
          const text = [...editor.querySelectorAll('.view-line')].find((node) => Math.abs(node.getBoundingClientRect().top - row.top) < 2)
          const lines = editor.querySelector('.view-lines').getBoundingClientRect()
          const end = text?.firstElementChild?.getBoundingClientRect().right ?? lines.left
          return { left: lines.left, right: end, y: row.top + row.height / 2 + ${page.top} }
        })()`,
      )) as { left: number; right: number; y: number } | null,
    `line ${line}`,
  )

const selectLines = async (first: number, last: number): Promise<void> => {
  const start = await lineOf(first)
  const end = await lineOf(last)
  await drag({ x: start.left + 2, y: start.y }, { x: end.right + 4, y: end.y })
}

/** Clicks the comment glyph of a line, so its saved thread opens. */
const openThread = async (line: number, text: string, ms = 650): Promise<void> => {
  const { y } = await lineOf(line)
  const glyph = await boxOf(
    visible(
      '.editor-group-container.active .monaco-editor .margin [class*="comment-thread"]',
      `Math.abs(node.getBoundingClientRect().top + node.getBoundingClientRect().height / 2 + ${page.top} - ${y}) < 6`,
    ),
    `comment glyph of line ${line}`,
  )
  await click(center(glyph), ms)
  await pageIs(
    `[...document.querySelectorAll('.review-widget .comment-body')].some((node) => node.textContent.includes(${JSON.stringify(text)}))`,
    `open thread of line ${line}`,
  )
}

// --- Setup ---

const yreview = async (): Promise<YreviewApi> =>
  (
    vscode.extensions.getExtension<YreviewApi>('yeskiy.yreview') ?? assert.fail('no extension')
  ).activate()

const gitReady = async (): Promise<void> => {
  const git = await (
    vscode.extensions.getExtension<{
      getAPI(version: 1): { repositories: readonly unknown[] }
    }>('vscode.git') ?? assert.fail('no git extension')
  ).activate()
  await untilValue(async () => git.getAPI(1).repositories.length > 0, 'git repository', 120)
}

const placeWindow = async (): Promise<void> => {
  const id = await untilValue(
    async () =>
      xdo('search', '--onlyvisible', '--name', 'Visual Studio Code').split('\n').pop() ?? null,
    'VS Code window',
  )
  xdo('windowmove', id, '0', '0')
  xdo('windowsize', id, String(width), String(height))
  xdo('windowfocus', '--sync', id)
  await wait(1500)
  page.top = height - Number(await evaluate(await workbench(), 'window.innerHeight'))
  say(`page top ${page.top}`)
  say(`window ${id} ${xdo('getwindowgeometry', id).replaceAll('\n', ' ')}`)
}

const quiet = async (): Promise<void> => {
  await vscode.commands.executeCommand('notifications.clearAll')
  await vscode.commands.executeCommand('workbench.action.closeAuxiliaryBar')
}

const openFile = async (name: string, line = 0): Promise<vscode.TextEditor> => {
  const editor = await vscode.window.showTextDocument(fileOf(name), { preview: false })
  editor.selection = new vscode.Selection(line, 0, line, 0)
  editor.revealRange(new vscode.Range(line, 0, line, 0), vscode.TextEditorRevealType.AtTop)
  return editor
}

const resetLayout = async (): Promise<void> => {
  await vscode.commands.executeCommand('workbench.action.closeAllEditors')
  await vscode.commands.executeCommand('workbench.action.closePanel')
  await vscode.commands.executeCommand('workbench.view.explorer')
  await quiet()
}

const rest = (): void => glide({ x: width - 160, y: height - 120 }, 300)

// --- Scenes ---

const COMMENT = 'Return early when `orders` is empty. Now `average` is `NaN` for an empty list.'

const commentScene = async (): Promise<void> => {
  await resetLayout()
  await openFile('src/orders.ts', 13)
  await wait(1500)
  rest()
  const video = record('comment')
  await wait(1500)
  await selectLines(36, 41)
  await wait(500)
  press('ctrl+alt+g')
  await pageIs(
    `document.activeElement?.closest('.review-widget') !== null && document.activeElement?.closest('.review-widget') !== undefined`,
    'focused comment box',
  )
  await wait(700)
  typeText(COMMENT)
  await wait(700)
  await click(
    center(
      await boxOf(
        visible('.review-widget .monaco-button', `node.textContent.trim() === 'Save Local'`),
        'Save Local button',
      ),
    ),
  )
  await wait(1000)
  const blank = await lineOf(43)
  await click({ x: blank.left + 220, y: blank.y })
  await wait(600)
  await openThread(36, 'is empty')
  await wait(400)
  rest()
  await wait(2600)
  await stop(video)
  still('thread')
}

const PREVIEW_TEXT = 'After 30 minutes without errors, it deploys to production.'
const PREVIEW_COMMENT = 'Name the dashboard that shows these errors, and who watches it.'

const pageOrigin = async (): Promise<Point> => {
  const origin = await webviewOrigin()
  return { x: origin.x, y: origin.y + page.top }
}

/** The page points of the start and the end of a text in the review preview. */
const textEnds = async (text: string): Promise<{ from: Point; to: Point }> => {
  const inner = await untilValue(
    async () =>
      (await inWebview(
        REVIEW_PAGE,
        `const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT)
        const find = (node) => node === null ? null : node.data.includes(${JSON.stringify(text)}) ? node : find(walker.nextNode())
        const node = find(walker.nextNode())
        if (!node) return null
        const range = doc.createRange()
        const at = node.data.indexOf(${JSON.stringify(text)})
        range.setStart(node, at)
        range.setEnd(node, at + ${text.length})
        const rects = [...range.getClientRects()]
        const first = rects[0]
        const last = rects[rects.length - 1]
        return { from: { x: first.left + 1, y: first.top + first.height / 2 }, to: { x: last.right - 1, y: last.top + last.height / 2 } }`,
      )) as { from: Point; to: Point } | null,
    'preview text',
  )
  const origin = await pageOrigin()
  const shift = (point: Point): Point => ({
    x: Math.round(origin.x + point.x),
    y: Math.round(origin.y + point.y),
  })
  return { from: shift(inner.from), to: shift(inner.to) }
}

const previewScene = async (): Promise<void> => {
  await resetLayout()
  await openFile('docs/release-process.md')
  await wait(1500)
  rest()
  const video = record('preview')
  await wait(1500)
  press('ctrl+shift+p')
  await wait(500)
  typeText('Yreview: Open Review Preview')
  await wait(700)
  press('Return')
  const previews = (await yreview()).reviewPreviews ?? assert.fail('no review previews')
  await untilValue(async () => previews.all()[0] ?? null, 'review preview')
  await previews.all()[0]?.whenReady()
  await wait(1500)
  const ends = await textEnds(PREVIEW_TEXT)
  await drag(ends.from, ends.to)
  await wait(500)
  press('ctrl+alt+g')
  await untilValue(
    async () =>
      (await inWebview(
        REVIEW_PAGE,
        `return doc.activeElement === doc.querySelector('.yreview-box textarea')`,
      )) === true,
    'focused preview box',
  )
  await wait(600)
  typeText(PREVIEW_COMMENT)
  await wait(700)
  const save = (await inWebview(
    REVIEW_PAGE,
    `const rect = doc.querySelector('.yreview-save-local').getBoundingClientRect()
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }`,
  )) as Point
  const origin = await pageOrigin()
  await click({ x: Math.round(origin.x + save.x), y: Math.round(origin.y + save.y) })
  await untilValue(
    async () =>
      (await inWebview(
        REVIEW_PAGE,
        `return doc.querySelector('.yreview-box') === null && doc.querySelector('.yreview-mark') !== null`,
      )) === true,
    'preview mark',
  )
  await wait(400)
  rest()
  await wait(2600)
  await stop(video)
  still('preview')
}

const DIFF_COMMENT = 'Use a seeded random source here, so a test can predict the delay.'

const diffScene = async (): Promise<void> => {
  await resetLayout()
  await vscode.commands.executeCommand('git.openChange', fileOf('src/retry.ts'))
  await vscode.commands.executeCommand('workbench.action.closeSidebar')
  await wait(2000)
  const editor = vscode.window.activeTextEditor ?? assert.fail('no diff editor')
  say(`diff side ${editor.document.uri.toString()}`)
  editor.selection = new vscode.Selection(16, 0, 17, 60)
  await wait(500)
  press('ctrl+alt+g')
  await pageIs(
    `document.activeElement?.closest('.review-widget') !== null && document.activeElement?.closest('.review-widget') !== undefined`,
    'focused diff comment box',
  )
  xdo('type', '--delay', '5', DIFF_COMMENT)
  await click(
    center(
      await boxOf(
        visible('.review-widget .monaco-button', `node.textContent.trim() === 'Save Local'`),
        'Save Local button',
      ),
    ),
    200,
  )
  await wait(800)
  editor.selection = new vscode.Selection(20, 0, 20, 0)
  await openThread(17, 'seeded', 200)
  rest()
  await quiet()
  await wait(1200)
  still('diff')
}

const rowOf = (text: string): string =>
  visible(
    '.monaco-list-row',
    `(node.getAttribute('aria-label') ?? '').includes(${JSON.stringify(text)})`,
  )

const tasksScene = async (): Promise<void> => {
  const { comments } = await yreview()
  await comments?.addAt(
    fileOf('src/orders.ts'),
    { start: 31, end: 33 },
    '`orderTotal(largest)` runs again for each order. Keep the largest value in a variable.',
    false,
  )
  await resetLayout()
  await openFile('src/orders.ts', 19)
  await vscode.commands.executeCommand('yreview.startSession')
  await wait(1500)
  await vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup')
  await quiet()
  await wait(1500)
  rest()
  const video = record('tasks')
  await wait(1500)
  await click(
    center(
      await boxOf(
        visible('.part.activitybar .action-item [aria-label^="Yreview"]'),
        'Yreview icon',
      ),
    ),
  )
  await boxOf(rowOf('Cap the delay'), 'TODO row')
  await wait(1800)
  await click(center(await boxOf(rowOf('Cap the delay'), 'TODO row')))
  await wait(2000)
  await click(
    center(
      await boxOf(
        `(${rowOf('orders-service')})?.querySelector('.custom-view-tree-node-item-checkbox, [role="checkbox"]')`,
        'folder checkbox',
      ),
    ),
  )
  await wait(1000)
  await click(
    center(
      await boxOf(
        visible('.pane-header .action-label[aria-label^="Send Review Tasks to the Agent"]'),
        'Send button',
      ),
    ),
  )
  await wait(400)
  rest()
  await wait(4000)
  await stop(video)
  await quiet()
  await wait(500)
  still('task-views')
}

const scenes = async (): Promise<void> => {
  await yreview()
  await gitReady()
  await placeWindow()
  await quiet()
  await wait(2000)
  await commentScene()
  await previewScene()
  await diffScene()
  await tasksScene()
  say('done')
}

/** A failed scene keeps its video and a still of the screen, so the run shows what went wrong. */
export const run = (): Promise<void> =>
  scenes().catch(async (error: unknown) => {
    if (active.video !== undefined) await stop(active.video)
    still('failure')
    throw error
  })
