import assert from 'node:assert/strict'

import { DEFAULT_FONT, cspOf, escapeAttribute, pageHtml } from '../../../src/reviewPreview/page'

const look = {
  fontFamily: DEFAULT_FONT,
  fontSize: 14,
  lineHeight: 1.6,
  scrollBeyondLastLine: true,
  wordWrap: true,
  markEditorSelection: true,
}
const input = {
  cspSource: 'https://x.vscode-cdn.net',
  nonce: 'n0nce',
  base: 'https://file+.vscode-resource.vscode-cdn.net/e%3A/a.md',
  styles: ['https://s/markdown.css'],
  scripts: [
    { src: 'https://s/mermaid.js', module: true },
    { src: 'https://s/own.js', module: false },
  ],
  look,
  html: '<p data-line="0">Hi</p>',
  state: { uri: 'file:///e%3A/a.md' },
}

describe('the review preview page', () => {
  it('has the strict policy of the built-in preview', () =>
    assert.equal(
      cspOf('https://x', 'n'),
      "default-src 'none'; form-action 'none'; img-src 'self' https://x https: data:; media-src 'self' https://x https: data:; script-src 'nonce-n'; style-src 'self' https://x 'unsafe-inline' https: data:; font-src 'self' https://x https: data:",
    ))

  it('gives each script the nonce, and the module type where it has one', () => {
    const html = pageHtml(input)
    assert.match(
      html,
      /<script async type="module" nonce="n0nce" src="https:\/\/s\/mermaid.js"><\/script>/,
    )
    assert.match(html, /<script async nonce="n0nce" src="https:\/\/s\/own.js"><\/script>/)
  })

  it('sets the base, the font variables and the body classes', () => {
    const html = pageHtml(input)
    assert.match(
      html,
      /<base href="https:\/\/file\+\.vscode-resource\.vscode-cdn\.net\/e%3A\/a\.md">/,
    )
    assert.match(html, /--markdown-font-size: 14px;/)
    assert.match(html, /--markdown-line-height: 1\.6;/)
    assert.match(
      html,
      /<body class="vscode-body scrollBeyondLastLine wordWrap showEditorSelection"/,
    )
    assert.match(html, /<div id="yreview-content"><p data-line="0">Hi<\/p><\/div>/)
  })

  it('escapes the state and a font that tries to leave its attribute', () => {
    const html = pageHtml({
      ...input,
      look: { ...look, fontFamily: 'a"; } <script>x</script>' },
      state: { uri: 'file:///"><x>' },
    })
    assert.doesNotMatch(html, /<script>x/)
    assert.doesNotMatch(html, /"><x>/)
    assert.equal(escapeAttribute(`<a href="x">&`), '&lt;a href=&quot;x&quot;&gt;&amp;')
  })

  it('falls back to the default size for a size that is not a number', () =>
    assert.match(
      pageHtml({ ...input, look: { ...look, fontSize: Number.NaN, lineHeight: -1 } }),
      /--markdown-font-size: 14px; --markdown-line-height: 1\.6;/,
    ))
})
