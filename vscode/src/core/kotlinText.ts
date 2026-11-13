// Kotlin trim() and isBlank() on the JVM: Character.isWhitespace or Character.isSpaceChar.
const SPACE =
  '\\t\\n\\u000b\\f\\r\\u001c-\\u001f \\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000'
const EDGES = new RegExp(`^[${SPACE}]+|[${SPACE}]+$`, 'gu')
const BLANK = new RegExp(`^[${SPACE}]*$`, 'u')

export const kotlinTrim = (text: string): string => text.replace(EDGES, '')

export const isKotlinBlank = (text: string): boolean => BLANK.test(text)
