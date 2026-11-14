import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(__dirname, '../..')
const manifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')) as Record<
  string,
  unknown
>

interface Contributed {
  readonly command?: string
  readonly id?: string
  readonly key?: string
  readonly when?: string
  readonly group?: string
  readonly defaults?: Record<string, string | null>
}

const contributes = manifest.contributes as {
  readonly keybindings: readonly Contributed[]
  readonly colors: readonly Contributed[]
  readonly menus: Record<string, readonly Contributed[]>
}

describe('manifest', () => {
  it('names the store id yeskiy.yreview', () => {
    assert.equal(`${String(manifest.publisher)}.${String(manifest.name)}`, 'yeskiy.yreview')
    assert.equal(manifest.displayName, 'Yreview')
  })

  it('runs only on the workspace host and has no web entry point', () => {
    assert.deepEqual(manifest.extensionKind, ['workspace'])
    assert.equal(manifest.browser, undefined)
  })

  it('refuses untrusted and virtual workspaces', () => {
    const capabilities = manifest.capabilities as Record<string, unknown>
    assert.equal((capabilities.untrustedWorkspaces as Record<string, unknown>).supported, false)
    assert.equal(capabilities.virtualWorkspaces, false)
  })

  it('contributes no telemetry setting', () => {
    assert.doesNotMatch(JSON.stringify(manifest.contributes), /telemetry/i)
  })

  it('carries the license of the repository', () => {
    assert.equal(
      readFileSync(path.join(root, 'LICENSE'), 'utf8').replace(/\r\n/g, '\n'),
      readFileSync(path.join(root, '..', 'LICENSE'), 'utf8').replace(/\r\n/g, '\n'),
    )
  })

  it('binds Escape in our comment box to the command that closes it', () => {
    const escape = contributes.keybindings.find((binding) => binding.key === 'escape')
    assert.equal(escape?.command, 'yreview.closeBox')
    const when = escape?.when ?? ''
    ;['commentEditorFocused', 'commentController == yreview'].forEach((part) =>
      assert.ok(when.includes(part), part),
    )
    ;['!suggestWidgetVisible', '!inlineSuggestionVisible', '!parameterHintsVisible'].forEach(
      (part) => assert.ok(when.includes(part), part),
    )
  })

  it('shows Discard only in an empty box of our controller', () => {
    const discard = contributes.menus['comments/commentThread/context']?.find(
      (item) => item.command === 'yreview.discard',
    )
    assert.equal(discard?.when, 'commentController == yreview && commentThreadIsEmpty')
    assert.equal(
      contributes.menus.commandPalette?.find((item) => item.command === 'yreview.discard')?.when,
      'false',
    )
  })

  it('colors an overlap with one color that differs from the range color', () => {
    const ids = contributes.colors.map((color) => color.id)
    assert.deepEqual(ids, [
      'yreview.commentRangeBackground',
      'yreview.commentOverlapBackground',
      'yreview.commentOverlapBorder',
    ])
    const overlap = contributes.colors[1]?.defaults ?? {}
    assert.match(overlap.dark ?? '', /^#[0-9a-f]{8}$/)
    assert.match(overlap.light ?? '', /^#[0-9a-f]{8}$/)
    assert.equal(contributes.colors[2]?.defaults?.highContrast, 'contrastActiveBorder')
  })
})
