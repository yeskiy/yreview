import type { TextCut } from './todoCut'

/** The comment marks of one language: line marks and pairs of block marks. */
export interface CommentSyntax {
  readonly line: readonly string[]
  readonly block: readonly (readonly [string, string])[]
}

const C_LIKE: CommentSyntax = { line: ['//'], block: [['/*', '*/']] }
const HASH: CommentSyntax = { line: ['#'], block: [] }
const MARKUP: CommentSyntax = { line: [], block: [['<!--', '-->']] }
const PERCENT: CommentSyntax = { line: ['%'], block: [] }
const SEMICOLON: CommentSyntax = { line: [';'], block: [] }
const DEFAULT: CommentSyntax = {
  line: ['//', '#'],
  block: [
    ['/*', '*/'],
    ['<!--', '-->'],
  ],
}

const same = (
  ids: readonly string[],
  syntax: CommentSyntax,
): readonly (readonly [string, CommentSyntax])[] => ids.map((id) => [id, syntax] as const)

const TABLE: ReadonlyMap<string, CommentSyntax> = new Map<string, CommentSyntax>([
  ...same(
    [
      'c',
      'cpp',
      'csharp',
      'java',
      'javascript',
      'javascriptreact',
      'typescript',
      'typescriptreact',
      'go',
      'rust',
      'swift',
      'kotlin',
      'scala',
      'dart',
      'groovy',
      'objective-c',
      'objective-cpp',
      'jsonc',
      'proto',
      'scss',
      'less',
    ],
    C_LIKE,
  ),
  ...same(
    [
      'python',
      'shellscript',
      'ruby',
      'perl',
      'r',
      'yaml',
      'toml',
      'dockerfile',
      'makefile',
      'coffeescript',
      'julia',
      'elixir',
      'nim',
      'properties',
      'cmake',
    ],
    HASH,
  ),
  ...same(['html', 'xml', 'xsl', 'markdown'], MARKUP),
  ...same(['latex', 'tex', 'bibtex', 'matlab', 'erlang'], PERCENT),
  ...same(['clojure', 'lisp', 'scheme'], SEMICOLON),
  ['css', { line: [], block: [['/*', '*/']] }],
  ['php', { line: ['//', '#'], block: [['/*', '*/']] }],
  [
    'vue',
    {
      line: ['//'],
      block: [
        ['/*', '*/'],
        ['<!--', '-->'],
      ],
    },
  ],
  [
    'svelte',
    {
      line: ['//'],
      block: [
        ['/*', '*/'],
        ['<!--', '-->'],
      ],
    },
  ],
  ['powershell', { line: ['#'], block: [['<#', '#>']] }],
  ['sql', { line: ['--'], block: [['/*', '*/']] }],
  ['lua', { line: ['--'], block: [['--[[', ']]']] }],
  ['haskell', { line: ['--'], block: [['{-', '-}']] }],
  ['elm', { line: ['--'], block: [['{-', '-}']] }],
  ['ini', { line: [';', '#'], block: [] }],
  ['ocaml', { line: [], block: [['(*', '*)']] }],
  ['fsharp', { line: ['//'], block: [['(*', '*)']] }],
  [
    'pascal',
    {
      line: ['//'],
      block: [
        ['(*', '*)'],
        ['{', '}'],
      ],
    },
  ],
  ['twig', { line: [], block: [['{#', '#}']] }],
  ['jinja', { line: [], block: [['{#', '#}']] }],
  ['vb', { line: ["'"], block: [] }],
])

export const syntaxOf = (languageId: string): CommentSyntax => TABLE.get(languageId) ?? DEFAULT

const lineEndOf = (text: string, offset: number): number => {
  const index = text.indexOf('\n', offset)
  const end = index < 0 ? text.length : index
  return text[end - 1] === '\r' ? end - 1 : end
}

/** The nearest comment that holds the offset. A closed block that holds that comment wins. */
export const commentAround = (
  text: string,
  offset: number,
  syntax: CommentSyntax,
): TextCut | undefined => {
  const first = offset <= 0 ? 0 : text.lastIndexOf('\n', offset - 1) + 1
  const lines = syntax.line.flatMap((mark) => {
    const start = offset < mark.length ? -1 : text.lastIndexOf(mark, offset - mark.length)
    return start >= first ? [{ start, end: lineEndOf(text, offset) }] : []
  })
  const blocks = syntax.block.flatMap(([open, close]) => {
    const start = offset < open.length ? -1 : text.lastIndexOf(open, offset - open.length)
    const shut = start < 0 ? -1 : text.indexOf(close, start + open.length)
    return start >= 0 && shut >= offset ? [{ start, end: shut + close.length }] : []
  })
  const nearest = [...lines, ...blocks].sort((a, b) => b.start - a.start)[0]
  if (nearest === undefined) return undefined
  return blocks.find((block) => block.start < nearest.start && block.end >= nearest.end) ?? nearest
}
