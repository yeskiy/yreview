export interface TodoPattern {
  readonly pattern: string
  readonly caseSensitive: boolean
}

/** One pattern ready to run. The words feed the fixed-string prefilter of git grep. */
export interface CompiledPattern {
  readonly rule: string
  readonly regex: RegExp
  readonly words: readonly string[]
}

export interface Compiled {
  readonly patterns: readonly CompiledPattern[]
  readonly refused: readonly string[]
}

export const DEFAULT_PATTERNS: readonly TodoPattern[] = [
  { pattern: '\\btodo\\b.*', caseSensitive: false },
  { pattern: '\\bfixme\\b.*', caseSensitive: false },
]

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null

/** The patterns of the setting. A value that is not a list gives the defaults. */
export const readPatterns = (value: unknown): readonly TodoPattern[] =>
  Array.isArray(value)
    ? (value as unknown[]).flatMap((entry) =>
        isRecord(entry) && typeof entry.pattern === 'string'
          ? [{ pattern: entry.pattern, caseSensitive: entry.caseSensitive === true }]
          : [],
      )
    : DEFAULT_PATTERNS

// An escape, a class, a group start, a group end, a bar, a quantifier, a word character, or another character.
const TOKEN =
  /\\(?:u\{[0-9A-Fa-f]+\}|u[0-9A-Fa-f]{4}|x[0-9A-Fa-f]{2}|c[A-Za-z]|[pP]\{[^}]*\}|k<[^>]*>|[\s\S])|\[(?:\\[\s\S]|[^\]\\])*\]|\((?:\?(?:<?[=!]|:|<[^>]*>))?|\)|\||(?:[?*+]|\{\d+(?:,\d*)?\})\??|[A-Za-z0-9_]|[\s\S]/g
const WORD_CHAR = /^[A-Za-z0-9_]$/
const OPTIONAL = /^(?:[?*]|\{0)/

/** The walk over the tokens. `runs` belong to the open branch, `branches` to the closed ones. */
interface Walk {
  readonly depth: number
  readonly run: string
  readonly runs: readonly string[]
  readonly branches: readonly (readonly string[])[]
}

const keep = (runs: readonly string[], run: string): readonly string[] =>
  run.length >= 2 ? [...runs, run] : runs

const step = (walk: Walk, token: string): Walk => {
  if (token.startsWith('(')) {
    return { ...walk, depth: walk.depth + 1, run: '', runs: keep(walk.runs, walk.run) }
  }
  if (token === ')') {
    return { ...walk, depth: Math.max(walk.depth - 1, 0), run: '', runs: keep(walk.runs, walk.run) }
  }
  if (walk.depth > 0) return walk
  if (WORD_CHAR.test(token)) return { ...walk, run: walk.run + token }
  if (token === '|') {
    return { ...walk, run: '', runs: [], branches: [...walk.branches, keep(walk.runs, walk.run)] }
  }
  if (OPTIONAL.test(token))
    return { ...walk, run: '', runs: keep(walk.runs, walk.run.slice(0, -1)) }
  return { ...walk, run: '', runs: keep(walk.runs, walk.run) }
}

/** The words that every match of the pattern holds, or undefined when a branch has none. */
export const wordsOf = (pattern: string): readonly string[] | undefined => {
  const walk = [...pattern.matchAll(TOKEN)]
    .map((match) => match[0])
    .reduce(step, { depth: 0, run: '', runs: [], branches: [] })
  const words = [...walk.branches, keep(walk.runs, walk.run)].map(
    (runs) => [...runs].sort((a, b) => b.length - a.length)[0],
  )
  return words.every((word): word is string => word !== undefined) ? words : undefined
}

const compileOne = (pattern: TodoPattern): CompiledPattern | undefined => {
  const words = wordsOf(pattern.pattern)
  if (words === undefined) return undefined
  try {
    return {
      rule: pattern.pattern,
      regex: new RegExp(pattern.pattern, pattern.caseSensitive ? 'g' : 'gi'),
      words,
    }
  } catch {
    // The caller names a pattern that does not compile in the refused list.
    return undefined
  }
}

export const compilePatterns = (patterns: readonly TodoPattern[]): Compiled => {
  const results = patterns.map((pattern) => ({ pattern, compiled: compileOne(pattern) }))
  return {
    patterns: results.flatMap((result) => (result.compiled === undefined ? [] : [result.compiled])),
    refused: results
      .filter((result) => result.compiled === undefined)
      .map((result) => result.pattern.pattern),
  }
}

/** The words of the git grep prefilter, in lowercase and once each. */
export const searchWords = (patterns: readonly CompiledPattern[]): readonly string[] => [
  ...new Set(patterns.flatMap((pattern) => pattern.words.map((word) => word.toLowerCase()))),
]

export const refusedMessage = (refused: readonly string[]): string =>
  `The extension does not use the TODO patterns ${refused.join(', ')}. Each pattern needs a word of two or more letters or digits outside every group. Write each word as its own pattern.`
