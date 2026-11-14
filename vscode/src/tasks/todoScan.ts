import { kotlinTrim } from '../core/kotlinText'
import { type GitRunner, isOk, ran } from '../git/runner'
import type { CompiledPattern } from './todoPatterns'

/** One TODO item before it gets its identifier. The line is one-based, the column zero-based. */
export interface TodoHit {
  readonly line: number
  readonly column: number
  readonly text: string
  readonly word?: string
  readonly rule: string
}

export interface GrepLine {
  readonly path: string
  readonly line: number
  readonly content: string
}

interface Candidate {
  readonly end: number
  readonly hit: TodoHit
}

interface Segment {
  readonly start: number
  readonly text: string
}

const NUL = String.fromCharCode(0)
const CLOSER = /\*\/|-->|\*\)|#\}|%\}|-\}/g
const CLOSER_AT_END = /(?:\*\/|-->|\*\)|#\}|%\}|-\})$/
const WORD = /^[A-Za-z]+/
// The exit code of git grep when no line matched.
const NO_MATCH = 1

/** The first word of a TODO text in capital letters, as TodoWord.of gives it. */
export const todoWord = (text: string): string | undefined =>
  WORD.exec(kotlinTrim(text))?.[0]?.toUpperCase()

/** The parts of a line. A part ends after a comment closer, so two block comments stay apart. */
const segmentsOf = (content: string): readonly Segment[] =>
  [0, ...[...content.matchAll(CLOSER)].map((match) => match.index + match[0].length)]
    .map((start, index, starts) => ({
      start,
      text: content.slice(start, starts[index + 1] ?? content.length),
    }))
    .filter((segment) => segment.text !== '')

const candidates = (
  segment: Segment,
  line: number,
  pattern: CompiledPattern,
): readonly Candidate[] =>
  [...segment.text.matchAll(pattern.regex)].flatMap((match) => {
    const text = kotlinTrim(kotlinTrim(match[0]).replace(CLOSER_AT_END, ''))
    const column = segment.start + match.index
    return text === ''
      ? []
      : [
          {
            end: column + match[0].length,
            hit: { line, column, text, word: todoWord(text), rule: pattern.rule },
          },
        ]
  })

/** The hits of one line, in column order. A match that starts inside an earlier match is dropped. */
export const hitsOfLine = (
  content: string,
  line: number,
  patterns: readonly CompiledPattern[],
): readonly TodoHit[] =>
  segmentsOf(content)
    .flatMap((segment) => patterns.flatMap((pattern) => candidates(segment, line, pattern)))
    .sort((a, b) => a.hit.column - b.hit.column)
    .reduce<readonly Candidate[]>((kept, candidate) => {
      const last = kept[kept.length - 1]
      return last !== undefined && candidate.hit.column < last.end ? kept : [...kept, candidate]
    }, [])
    .map((candidate) => candidate.hit)

/** The TODO items of a whole text, in source order. A dirty editor document uses it. */
export const todosOfText = (
  text: string,
  patterns: readonly CompiledPattern[],
): readonly TodoHit[] =>
  text.split(/\r\n|\r|\n/).flatMap((content, index) => hitsOfLine(content, index + 1, patterns))

/** A record of `git grep -z -n` is the path, a NUL, the line number, a NUL, and the line. */
export const parseGrep = (output: string): readonly GrepLine[] =>
  output.split('\n').flatMap((record) => {
    const first = record.indexOf(NUL)
    const second = record.indexOf(NUL, first + 1)
    const line = Number(record.slice(first + 1, second))
    return first > 0 && second > first && Number.isSafeInteger(line) && line > 0
      ? [{ path: record.slice(0, first), line, content: record.slice(second + 1) }]
      : []
  })

/** The hits of each file, in source order. git grep gives the lines of a file in line order. */
export const hitsByFile = (
  lines: readonly GrepLine[],
  patterns: readonly CompiledPattern[],
): ReadonlyMap<string, readonly TodoHit[]> =>
  lines.reduce((byFile, grep) => {
    const hits = hitsOfLine(grep.content, grep.line, patterns)
    return hits.length === 0
      ? byFile
      : byFile.set(grep.path, [...(byFile.get(grep.path) ?? []), ...hits])
  }, new Map<string, readonly TodoHit[]>())

/** The lines that hold a word, in tracked files and in untracked files that git does not ignore. */
export const grepTodos = async (
  git: GitRunner,
  words: readonly string[],
  signal?: AbortSignal,
): Promise<readonly GrepLine[] | undefined> => {
  if (words.length === 0) return []
  const result = await git.run(
    [
      'grep',
      '-n',
      '-z',
      '-I',
      '-i',
      '-F',
      '--untracked',
      '--exclude-standard',
      '--no-recurse-submodules',
      '--no-color',
      '--no-column',
      ...words.flatMap((word) => ['-e', word]),
    ],
    signal,
  )
  if (!ran(result) || (!isOk(result) && result.exitCode !== NO_MATCH)) return undefined
  return parseGrep(result.stdout)
}
