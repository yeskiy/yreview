import assert from 'node:assert/strict'

import { MARKDOWN_ID, contributionsOf } from '../../../src/reviewPreview/contributions'

const join = (root: string, relative: string): string => `${root}/${relative.replace(/^\.\//, '')}`
const ext = (id: string, contributes: object) => ({
  id,
  root: `/ext/${id}`,
  packageJSON: { contributes },
})

describe('the contributions of the Markdown extensions', () => {
  const all = [
    ext(MARKDOWN_ID, {
      'markdown.previewStyles': ['./media/markdown.css', './media/highlight.css'],
      'markdown.previewScripts': [{ path: './media/index.js', type: 'module' }],
    }),
    ext('vscode.mermaid-markdown-features', {
      'markdown.previewScripts': [{ path: './markdown-preview-out/index.js', type: 'module' }],
    }),
    ext('bierner.markdown-mermaid', {
      'markdown.previewScripts': ['./dist-preview/index.bundle.js'],
    }),
    ext('vscode.markdown-math', { 'markdown.previewStyles': ['./notebook-out/katex.min.css'] }),
    ext('yeskiy.yreview', {
      'markdown.previewStyles': ['./media/preview.css'],
      'markdown.previewScripts': ['./dist/previewSelection.js'],
    }),
    ext('evil.escape', {
      'markdown.previewStyles': ['../../secret.css', '/abs.css', 'C:/x.css', 7],
    }),
    ext('plain.none', {}),
  ]
  const found = contributionsOf(all, 'yeskiy.yreview', join)

  it('keeps the styles of the Markdown extension first, and leaves out its scripts', () => {
    assert.deepEqual(found.styles.slice(0, 2), [
      `/ext/${MARKDOWN_ID}/media/markdown.css`,
      `/ext/${MARKDOWN_ID}/media/highlight.css`,
    ])
    assert.equal(
      found.scripts.some((script) => script.uri.includes(MARKDOWN_ID)),
      false,
    )
  })

  it('loads the scripts of other extensions, with the module type', () =>
    assert.deepEqual(found.scripts, [
      { uri: '/ext/vscode.mermaid-markdown-features/markdown-preview-out/index.js', module: true },
      { uri: '/ext/bierner.markdown-mermaid/dist-preview/index.bundle.js', module: false },
    ]))

  it('leaves out Yreview and every path that leaves its extension', () => {
    assert.equal(
      [...found.styles, ...found.scripts.map((script) => script.uri)].some(
        (uri) => uri.includes('yreview') || uri.includes('evil'),
      ),
      false,
    )
  })

  it('gives the root of each extension that contributes', () =>
    assert.deepEqual(found.roots, [
      `/ext/${MARKDOWN_ID}`,
      '/ext/vscode.mermaid-markdown-features',
      '/ext/bierner.markdown-mermaid',
      '/ext/vscode.markdown-math',
    ]))
})
