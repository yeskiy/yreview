import { stat } from 'node:fs/promises'

const BLANK = /^[ \t\r\n]+|[ \t\r\n]+$/g
const SPACE = /^[ \t\r\n]$/
const QUOTES = new Set(['"', "'"])

interface Scan {
  readonly words: readonly string[]
  readonly word: string | undefined
  readonly quote: string | undefined
}

/** A path that cannot be read is no file. */
export const isFile = (file: string): Promise<boolean> =>
  stat(file).then(
    (found) => found.isFile(),
    () => false,
  )

const step = (scan: Scan, char: string): Scan => {
  if (scan.quote !== undefined) {
    return char === scan.quote
      ? { ...scan, quote: undefined }
      : { ...scan, word: `${scan.word ?? ''}${char}` }
  }
  if (SPACE.test(char)) {
    return scan.word === undefined
      ? scan
      : { words: [...scan.words, scan.word], word: undefined, quote: undefined }
  }
  return QUOTES.has(char)
    ? { ...scan, word: scan.word ?? '', quote: char }
    : { ...scan, word: `${scan.word ?? ''}${char}` }
}

/**
 * The words of an agent command. A value that is one existing file is one word. Else blanks divide
 * words, quotes group them, an open quote runs to the end, and a backslash is plain text.
 */
export const commandWords = (value: string, fileAt: (path: string) => boolean): string[] => {
  const trimmed = value.replace(BLANK, '')
  if (trimmed === '') return []
  if (fileAt(trimmed)) return [trimmed]
  const end = [...trimmed].reduce(step, { words: [], word: undefined, quote: undefined })
  return end.word === undefined ? [...end.words] : [...end.words, end.word]
}
