import assert from 'node:assert/strict'
import path from 'node:path'
import { setTimeout as wait } from 'node:timers/promises'

import * as vscode from 'vscode'

import type { YreviewApi } from '../../../src/extension'
import type { ReviewPreviews } from '../../../src/reviewPreview/reviewPreviews'

import { REVIEW_PAGE, inWebview, focusWorkbench, untilInWebview } from '../webviewFrames'
import { until } from '../window'

const workspace = (): string =>
  vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? assert.fail('no workspace')
const review = (): vscode.Uri => vscode.Uri.file(path.join(workspace(), 'src', 'review.md'))
const notes = (): vscode.Uri => vscode.Uri.file(path.join(workspace(), 'src', 'notes.md'))
const previews = async (): Promise<ReviewPreviews> =>
  (
    await (
      vscode.extensions.getExtension<YreviewApi>('yeskiy.yreview') ?? assert.fail('no extension')
    ).activate()
  ).reviewPreviews ?? assert.fail('the review preview is off')
const reviewTabs = () =>
  vscode.window.tabGroups.all
    .flatMap((group) => group.tabs)
    .filter(
      (tab) =>
        tab.input instanceof vscode.TabInputWebview &&
        tab.input.viewType.endsWith('yreview.preview'),
    )
const openReview = async (): Promise<void> => {
  const editor = await vscode.window.showTextDocument(review(), {
    viewColumn: vscode.ViewColumn.One,
    preview: false,
  })
  // The editor keeps the scroll of an earlier test, and the page follows it.
  editor.revealRange(new vscode.Range(0, 0, 0, 0), vscode.TextEditorRevealType.AtTop)
  await vscode.commands.executeCommand('yreview.openReviewPreview')
  assert.ok(await until(() => reviewTabs().length === 1), 'no review preview tab')
  // The page shows its first HTML before its script listens, and it drops a message before that.
  await (
    (await previews()).all().find((one) => one.uri.fsPath === review().fsPath) ??
    assert.fail('no preview')
  ).whenReady()
  assert.ok(
    await untilInWebview(REVIEW_PAGE, `return doc.querySelector('[data-line-end]') !== null`),
    'no content',
  )
}
const setting = async (section: string, key: string, value: unknown): Promise<void> =>
  vscode.workspace.getConfiguration(section).update(key, value, vscode.ConfigurationTarget.Global)

// These tests read the webview page through the DevTools port, so they run in a profile of their own.
describe('the review preview', () => {
  beforeEach(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors')
    await focusWorkbench()
  })
  afterEach(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors')
    const document = await vscode.workspace.openTextDocument(review())
    if (document.isDirty) {
      await vscode.window.showTextDocument(document)
      await vscode.commands.executeCommand('workbench.action.files.revert')
      await vscode.commands.executeCommand('workbench.action.closeAllEditors')
    }
  })

  it('opens beside the source with the styles and the fonts of the built-in preview', async () => {
    await openReview()
    assert.equal(vscode.window.tabGroups.all.length, 2)
    assert.deepEqual(
      await inWebview(
        REVIEW_PAGE,
        `return {
        markdownCss: [...doc.querySelectorAll('link')].some((link) => link.href.endsWith('/media/markdown.css')),
        highlightCss: [...doc.querySelectorAll('link')].some((link) => link.href.endsWith('/media/highlight.css')),
        size: doc.documentElement.style.getPropertyValue('--markdown-font-size'),
        body: doc.body.classList.contains('vscode-body'),
        math: doc.querySelector('.katex') !== null,
        fence: doc.querySelector('code[data-line-text="10"]') !== null,
      }`,
      ),
      { markdownCss: true, highlightCss: true, size: '14px', body: true, math: true, fence: true },
    )
  })

  it('loads the preview styles and scripts of the other Markdown extensions', async () => {
    await openReview()
    const mermaid = vscode.extensions.getExtension('vscode.mermaid-markdown-features') !== undefined
    assert.deepEqual(
      await inWebview(
        REVIEW_PAGE,
        `const scripts = [...doc.querySelectorAll('script')].map((script) => script.src)
        return {
          math: [...doc.querySelectorAll('link')].some((link) => /markdown-math/.test(link.href)),
          mermaid: scripts.some((src) => /mermaid-markdown-features/.test(src)),
          builtIn: scripts.some((src) => /markdown-language-features/.test(src)),
          own: scripts.filter((src) => /previewSelection/.test(src)).length,
        }`,
      ),
      { math: true, mermaid, builtIn: false, own: 0 },
    )
  })

  it('shows one preview for each file', async () => {
    await openReview()
    await vscode.commands.executeCommand('yreview.openReviewPreview', review())
    assert.equal(reviewTabs().length, 1)
    await vscode.commands.executeCommand('yreview.openReviewPreview', notes())
    assert.ok(await until(() => reviewTabs().length === 2))
  })

  it('follows an edit before a save', async () => {
    await openReview()
    const edit = new vscode.WorkspaceEdit()
    edit.insert(review(), new vscode.Position(1, 0), '\nLive text.\n')
    await vscode.workspace.applyEdit(edit)
    assert.ok(
      await untilInWebview(REVIEW_PAGE, `return doc.body.textContent.includes('Live text.')`),
    )
  })

  it('follows the scroll of the source editor', async () => {
    await openReview()
    const editor =
      vscode.window.visibleTextEditors.find(
        (shown) => shown.document.uri.fsPath === review().fsPath,
      ) ?? assert.fail('no source')
    editor.revealRange(new vscode.Range(100, 0, 100, 0), vscode.TextEditorRevealType.AtTop)
    if (!(await untilInWebview(REVIEW_PAGE, `return doc.defaultView.scrollY > 200`)))
      assert.fail(
        `the page did not scroll: ${JSON.stringify({
          source: editor.visibleRanges[0]?.start.line,
          page: await inWebview(
            REVIEW_PAGE,
            `return { y: doc.defaultView.scrollY, height: doc.documentElement.scrollHeight,
              view: doc.defaultView.innerHeight, blocks: doc.querySelectorAll('[data-line]').length }`,
          ),
        })}`,
      )
  })

  it('runs no script of the document', async () => {
    await openReview()
    await wait(1000)
    assert.equal(
      await inWebview(REVIEW_PAGE, `return doc.defaultView.yreviewInjected === undefined`),
      true,
    )
  })

  it('opens a relative link in an editor and a web link outside', async () => {
    const calls: string[] = []
    const shown = await previews()
    shown.setOpener(async (target) => {
      calls.push(target.toString())
      return false
    })
    try {
      await openReview()
      // The webview host opens a link whose click reaches the window. VS Code 1.101 also opens a script click.
      const click = (href: string): Promise<unknown> =>
        inWebview(
          REVIEW_PAGE,
          `const view = doc.defaultView
          if (view.yreviewLeaks === undefined) {
            view.yreviewLeaks = 0
            view.addEventListener('click', () => { view.yreviewLeaks += 1 })
          }
          doc.querySelector(${JSON.stringify(`a[href="${href}"]`)}).click()
          return true`,
        )
      await click('https://example.com/')
      assert.ok(await until(() => calls.length === 1))
      assert.deepEqual(calls, ['https://example.com/'])
      await click('notes.md')
      assert.ok(
        await until(() => vscode.window.activeTextEditor?.document.uri.fsPath === notes().fsPath),
      )
      assert.equal(
        await inWebview(REVIEW_PAGE, `return doc.defaultView.yreviewLeaks`),
        0,
        'a link click reached the window of the page',
      )
    } finally {
      shown.setOpener((target) => vscode.env.openExternal(target))
    }
  })

  it('follows the Markdown settings and the theme', async () => {
    await openReview()
    try {
      await setting('markdown.preview', 'fontSize', 20)
      await setting('markdown.preview', 'breaks', true)
      // The panel builds the page again on each change, so the check waits for the last build and its load.
      assert.ok(
        await until(
          () =>
            vscode.workspace.getConfiguration('markdown.preview', review()).get('breaks') === true,
        ),
        'the extension host did not get the breaks setting',
      )
      const shown =
        (await previews()).all().find((one) => one.uri.fsPath === review().fsPath) ??
        assert.fail('no preview')
      await shown.settled()
      await shown.whenReady()
      assert.ok(
        await untilInWebview(
          REVIEW_PAGE,
          `return doc.documentElement.style.getPropertyValue('--markdown-font-size') === '20px'`,
        ),
      )
      const rendered = await vscode.commands.executeCommand<string>(
        'markdown.api.render',
        await vscode.workspace.openTextDocument(review()),
      )
      assert.match(rendered, /paragraph\.<br>/, 'the Markdown render has no line break')
      assert.ok(
        await untilInWebview(
          REVIEW_PAGE,
          `return doc.querySelector('p[data-line="2"] br') !== null`,
        ),
        `the page has no line break, last build ${shown.lastBuild}: ${JSON.stringify(
          await inWebview(
            REVIEW_PAGE,
            `return [doc.body.dataset.yreviewPreview, doc.querySelector('p[data-line="2"]')?.outerHTML]`,
          ),
        )}`,
      )
      await setting('workbench', 'colorTheme', 'Default Light Modern')
      assert.ok(
        await untilInWebview(REVIEW_PAGE, `return doc.body.classList.contains('vscode-light')`),
      )
    } finally {
      await setting('markdown.preview', 'fontSize', undefined)
      await setting('markdown.preview', 'breaks', undefined)
      await setting('workbench', 'colorTheme', undefined)
    }
  })

  it('keeps the file of the panel for a restore', async () => {
    await openReview()
    assert.deepEqual(
      (await previews()).all().map((preview) => preview.uri.fsPath),
      [review().fsPath],
    )
    assert.ok(
      await untilInWebview(
        REVIEW_PAGE,
        `return JSON.parse(doc.body.dataset.yreviewPreview).uri.startsWith('file:')`,
      ),
    )
  })
})
