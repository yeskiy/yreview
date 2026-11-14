// A terminal reads U+009B as the start of a control sequence, so the second range goes too.
const KEPT = new Set(['\t', '\r', '\n'])

export const isAnyControl = (unit: string): boolean => {
  const code = unit.charCodeAt(0)
  return code < 0x20 || (code >= 0x7f && code <= 0x9f)
}

export const isControl = (unit: string): boolean => isAnyControl(unit) && !KEPT.has(unit)

/** The text that a clipboard, a file or the channel may get. Lines stay. */
export const cleanText = (text: string): string =>
  text
    .split('')
    .filter((unit) => !isControl(unit))
    .join('')

/** A path holds no line, so it keeps no control character at all. */
export const cleanPath = (value: string): string =>
  value
    .split('')
    .filter((unit) => !isAnyControl(unit))
    .join('')

/** The first code units of a text, and never one half of a character. */
export const cutText = (text: string, limit: number): string => {
  const short = text.slice(0, limit)
  const last = short.charCodeAt(short.length - 1)
  return last >= 0xd800 && last <= 0xdbff ? short.slice(0, -1) : short
}
