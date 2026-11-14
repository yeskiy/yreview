// --- Decoding, with the rules of the kotlinx.serialization 1.11 lexer ---

export const REFUSED = new Error('The Kotlin decoder refuses this line.')

export const refuse = (): never => {
  throw REFUSED
}

const SPACE = /[ \t\n\r]*/y
// A run of the characters that kotlinx reads as one literal token.
const RUN = /[^ \t\n\r,:{}[\]"\\]+/y
const RUN_CHAR = /[^ \t\n\r,:{}[\]"\\]/
const STRING = /"((?:[^"\\]|\\(?:["\\/bfnrt]|u[0-9A-Fa-f]{4}))*)"/y
// One string or one other character, to skip an unknown value.
const SKIP_TOKEN = /"(?:[^"\\]|\\(?:["\\/bfnrt]|u[0-9A-Fa-f]{4}))*"|[^"]/gy
const ESCAPE = /\\(?:u([0-9A-Fa-f]{4})|(.))/g
const UNESCAPE: Readonly<Record<string, string>> = {
  '"': '"',
  '\\': '\\',
  '/': '/',
  b: '\b',
  f: '\f',
  n: '\n',
  r: '\r',
  t: '\t',
}
const NUMBER = /^(-?)([0-9]*)(?:[eE]([+-]?)([0-9]*))?$/
const BOOLEAN = /^(?:true|false)$/i
const OPENERS: Readonly<Record<string, string>> = { '}': '{', ']': '[' }
const LONG_MAX = 2 ** 63
const INT_LIMIT = 2 ** 31

/** The Long that kotlinx reads from a numeric literal, or a refusal. */
const kotlinLong = (literal: string): bigint => {
  const [, sign, digits = '', exponentSign, exponentDigits = ''] = NUMBER.exec(literal) ?? refuse()
  const exponent = exponentSign !== undefined
  if (digits === '' && !(sign === '-' && exponent)) refuse()
  // kotlinx adds each digit to a negative Long and refuses once the sum turns positive.
  const negative = [...digits].reduce((sum, digit) => {
    const next = BigInt.asIntN(64, sum * 10n - BigInt(digit))
    return next > 0n ? refuse() : next
  }, 0n)
  const power = Number(
    [...exponentDigits].reduce((sum, digit) => BigInt.asIntN(64, sum * 10n + BigInt(digit)), 0n),
  )
  const scaled = (() => {
    if (!exponent) return negative
    const value =
      exponentSign === '-' ? Number(negative) / 10 ** power : Number(negative) * 10 ** power
    return value >= LONG_MAX || value < -LONG_MAX || Math.floor(value) !== value
      ? refuse()
      : BigInt(value)
  })()
  if (sign === '-') return scaled
  return scaled === -(2n ** 63n) ? refuse() : -scaled
}

export class Lexer {
  private at = 0

  constructor(private readonly source: string) {}

  private match(pattern: RegExp): RegExpExecArray | undefined {
    // eslint-disable-next-line no-param-reassign
    pattern.lastIndex = this.at
    const found = pattern.exec(this.source)
    if (found) this.at = pattern.lastIndex
    return found ?? undefined
  }

  peek(): string | undefined {
    this.match(SPACE)
    return this.source[this.at]
  }

  take(char: string): boolean {
    if (this.peek() !== char) return false
    this.at += 1
    return true
  }

  expect(char: string): void {
    if (!this.take(char)) refuse()
  }

  end(): void {
    if (this.peek() !== undefined) refuse()
  }

  string(): string {
    this.match(SPACE)
    const [, body = ''] = this.match(STRING) ?? refuse()
    return body.replace(ESCAPE, (_, hex: string | undefined, char: string) =>
      hex === undefined ? (UNESCAPE[char] ?? char) : String.fromCharCode(Number.parseInt(hex, 16)),
    )
  }

  /** True after a `null` literal, which kotlinx reads only when no literal character follows. */
  null(): boolean {
    this.match(SPACE)
    const found =
      this.source.startsWith('null', this.at) && !RUN_CHAR.test(this.source[this.at + 4] ?? ' ')
    if (found) this.at += 4
    return found
  }

  /** A literal, bare or in quotes. kotlinx reads a number or a boolean in either form. */
  private literal(): string {
    this.match(SPACE)
    const quoted = this.source[this.at] === '"'
    if (quoted) this.at += 1
    const run = this.match(RUN)?.[0] ?? refuse()
    if (quoted && this.source[this.at] !== '"') refuse()
    if (quoted) this.at += 1
    return run
  }

  int(): number {
    const value = Number(kotlinLong(this.literal()))
    return value >= -INT_LIMIT && value < INT_LIMIT ? value : refuse()
  }

  flag(): boolean {
    const run = this.literal()
    return BOOLEAN.test(run) ? run.toLowerCase() === 'true' : refuse()
  }

  /** Skips one value of a key that the record does not know, as kotlinx skipElement does. */
  skip(): void {
    const next = this.peek()
    if (next === '"') {
      this.string()
      return
    }
    if (next !== '{' && next !== '[') {
      if (!this.match(RUN)) refuse()
      return
    }
    const stack: string[] = []
    const tokens = Array.from(this.source.slice(this.at).matchAll(SKIP_TOKEN))
    const last = tokens.findIndex(([token]) => {
      if (token === '{' || token === '[') stack.push(token)
      if (token === '}' || token === ']') {
        if (stack.pop() !== OPENERS[token]) refuse()
        return stack.length === 0
      }
      return false
    })
    const closing = tokens[last] ?? refuse()
    this.at += closing.index + closing[0].length
  }

  /** The members of one object. kotlinx needs no comma between two members. */
  members(member: (key: string) => void): void {
    this.expect('{')
    const state = { comma: false }
    const closed = Array.from({ length: this.source.length }).some(() => {
      const next = this.peek()
      if (next === '}' && !state.comma) {
        this.at += 1
        return true
      }
      if (next !== '"') refuse()
      const key = this.string()
      this.expect(':')
      member(key)
      state.comma = this.take(',')
      return false
    })
    if (!closed) refuse()
  }

  /** The elements of one array, with a comma between two elements and none after the last. */
  elements(element: () => void): void {
    this.expect('[')
    if (this.take(']')) return
    const closed = Array.from({ length: this.source.length }).some(() => {
      element()
      if (this.take(',')) return false
      this.expect(']')
      return true
    })
    if (!closed) refuse()
  }
}

export type Reader = (lexer: Lexer) => unknown

/** The values of one object, the last one for a key that repeats. Each value must read. */
export const readObject = (
  lexer: Lexer,
  readers: ReadonlyMap<string, Reader>,
): Map<string, unknown> => {
  const values = new Map<string, unknown>()
  lexer.members((key) => {
    const read = readers.get(key)
    if (read) values.set(key, read(lexer))
    else lexer.skip()
  })
  return values
}

/** A nullable Kotlin field: absent and null both read as no value. */
export const nullable =
  (read: Reader): Reader =>
  (lexer) =>
    lexer.null() ? undefined : read(lexer)

export const text: Reader = (lexer) => lexer.string()
export const int: Reader = (lexer) => lexer.int()
export const flag: Reader = (lexer) => lexer.flag()

export const required = <T>(values: ReadonlyMap<string, unknown>, key: string): T =>
  values.has(key) ? (values.get(key) as T) : refuse()

export const optional = <T>(values: ReadonlyMap<string, unknown>, key: string): T | undefined =>
  values.get(key) as T | undefined

/** The object without its undefined fields and without the Int fields that hold the default 0. */
export const plain = <T extends object>(value: T, zeroKeys: readonly string[] = []): T =>
  Object.fromEntries(
    Object.entries(value).filter(
      ([key, field]) => field !== undefined && !(zeroKeys.includes(key) && field === 0),
    ),
  ) as T

export const list =
  (read: Reader): Reader =>
  (lexer) => {
    const values: unknown[] = []
    lexer.elements(() => values.push(read(lexer)))
    return values
  }

/** The value of the whole text, or undefined when the Kotlin decoder refuses it. */
export const readWhole = <T>(source: string, read: (lexer: Lexer) => T): T | undefined => {
  try {
    const lexer = new Lexer(source)
    const value = read(lexer)
    lexer.end()
    return value
  } catch (error) {
    if (error === REFUSED) return undefined
    throw error
  }
}
