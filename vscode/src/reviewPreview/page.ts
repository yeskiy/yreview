import type { PageState } from './protocol'

/** The default of `markdown.preview.fontFamily`. */
export const DEFAULT_FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe WPC', 'Segoe UI', system-ui, 'Ubuntu', 'Droid Sans', sans-serif"

export interface PreviewLook {
  readonly fontFamily: string
  readonly fontSize: number
  readonly lineHeight: number
  readonly scrollBeyondLastLine: boolean
  readonly wordWrap: boolean
  readonly markEditorSelection: boolean
}

export interface PageInput {
  readonly cspSource: string
  readonly nonce: string
  readonly base: string
  readonly styles: readonly string[]
  readonly scripts: readonly { readonly src: string; readonly module: boolean }[]
  readonly look: PreviewLook
  readonly html: string
  readonly state: PageState
}

export const escapeAttribute = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export const cspOf = (cspSource: string, nonce: string): string =>
  [
    "default-src 'none'",
    "form-action 'none'",
    `img-src 'self' ${cspSource} https: data:`,
    `media-src 'self' ${cspSource} https: data:`,
    `script-src 'nonce-${nonce}'`,
    `style-src 'self' ${cspSource} 'unsafe-inline' https: data:`,
    `font-src 'self' ${cspSource} https: data:`,
  ].join('; ')

const positive = (value: number, fallback: number): number =>
  Number.isFinite(value) && value > 0 ? value : fallback

/** The font variables that `markdown.css` reads. A font value cannot end its declaration. */
const lookStyle = (look: PreviewLook): string =>
  `--markdown-font-family: ${look.fontFamily.replace(/[;{}]/g, '') || DEFAULT_FONT}; --markdown-font-size: ${positive(look.fontSize, 14)}px; --markdown-line-height: ${positive(look.lineHeight, 1.6)};`

const bodyClasses = (look: PreviewLook): string =>
  [
    'vscode-body',
    look.scrollBeyondLastLine ? 'scrollBeyondLastLine' : '',
    look.wordWrap ? 'wordWrap' : '',
    look.markEditorSelection ? 'showEditorSelection' : '',
  ]
    .filter((name) => name !== '')
    .join(' ')

/** The page of the review preview. The first content is part of it, so no blank page shows. */
export const pageHtml = (input: PageInput): string =>
  [
    '<!DOCTYPE html>',
    `<html style="${escapeAttribute(lookStyle(input.look))}">`,
    '<head>',
    '<meta charset="UTF-8">',
    `<meta http-equiv="Content-Security-Policy" content="${escapeAttribute(cspOf(input.cspSource, input.nonce))}">`,
    `<base href="${escapeAttribute(input.base)}">`,
    ...input.styles.map((href) => `<link rel="stylesheet" href="${escapeAttribute(href)}">`),
    '</head>',
    `<body class="${bodyClasses(input.look)}" data-yreview-preview="${escapeAttribute(JSON.stringify(input.state))}">`,
    `<div id="yreview-content">${input.html}</div>`,
    ...input.scripts.map(
      (script) =>
        `<script async${script.module ? ' type="module"' : ''} nonce="${escapeAttribute(input.nonce)}" src="${escapeAttribute(script.src)}"></script>`,
    ),
    '</body>',
    '</html>',
  ].join('\n')
