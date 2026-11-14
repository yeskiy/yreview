import Sqids from 'sqids'

import { HANDLE_PREFIX, TODO_PREFIX, isHandle, isLong, isTodo } from './taskIds'

export type HandleKey =
  | { readonly kind: 'exact'; readonly id: string }
  | { readonly kind: 'comment'; readonly prefix: string }
  | { readonly kind: 'todo'; readonly prefix: string; readonly order: number }

export type HandleMatch =
  | { readonly kind: 'one'; readonly id: string }
  | { readonly kind: 'none' }
  | { readonly kind: 'many'; readonly count: number }

const KEY_CHARS = 8
const KEY_LIMIT = 2 ** 32
const INT_LIMIT = 2 ** 31
// An empty block list ties each handle to the alphabet alone, as in TaskHandles.kt.
const SQIDS = new Sqids({ alphabet: 'abcdefghijklmnopqrstuvwxyz0123456789', blocklist: new Set() })
// Kotlin String.toIntOrNull on the text after the last `-` of an identifier.
const INT_TEXT = /^\+?[0-9]+$/

const keyOfHex = (hex: string): number => Number.parseInt(hex.slice(0, KEY_CHARS), 16)
const tailOf = (id: string): string => id.slice(id.lastIndexOf('-') + 1)
const orderOf = (id: string): number | undefined =>
  INT_TEXT.test(tailOf(id)) && Number(tailOf(id)) < INT_LIMIT ? Number(tailOf(id)) : undefined
const hexOf = (key: number): string => key.toString(16).padStart(KEY_CHARS, '0')
// Kotlin Long.toInt() keeps the low 32 bits as a signed number.
const toInt = (value: number): number => (value >= INT_LIMIT ? value - KEY_LIMIT : value)

export const handleOf = (id: string): string => {
  if (!isLong(id)) return id
  const numbers = isTodo(id)
    ? [keyOfHex(id.slice(TODO_PREFIX.length)), Number(tailOf(id))]
    : [keyOfHex(id)]
  return `${HANDLE_PREFIX}${SQIDS.encode(numbers)}`
}

const keyOfHandle = (handle: string): HandleKey | undefined => {
  const numbers = SQIDS.decode(handle.slice(HANDLE_PREFIX.length))
  if (numbers.some((n) => !Number.isSafeInteger(n) || n < 0 || n >= KEY_LIMIT)) return undefined
  const [key, order] = numbers
  if (numbers.length === 1 && key !== undefined) return { kind: 'comment', prefix: hexOf(key) }
  if (numbers.length === 2 && key !== undefined && order !== undefined) {
    return { kind: 'todo', prefix: hexOf(key), order: toInt(order) }
  }
  return undefined
}

export const keyOf = (text: string): HandleKey | undefined => {
  if (isLong(text)) return { kind: 'exact', id: text }
  return isHandle(text) ? keyOfHandle(text) : undefined
}

/** True when the text names a TODO item, in the long form or in the short form. */
export const namesTodo = (text: string): boolean => {
  const key = keyOf(text)
  return key?.kind === 'todo' || (key?.kind === 'exact' && isTodo(key.id))
}

const names = (key: HandleKey, id: string): boolean => {
  switch (key.kind) {
    case 'exact':
      return id === key.id
    case 'comment':
      return !isTodo(id) && id.startsWith(key.prefix)
    default:
      return id.startsWith(`${TODO_PREFIX}${key.prefix}`) && orderOf(id) === key.order
  }
}

export const matchKey = (key: HandleKey, ids: readonly string[]): HandleMatch => {
  const hits = [...new Set(ids.filter((id) => names(key, id)))]
  const [only] = hits
  if (hits.length === 0 || only === undefined) return { kind: 'none' }
  return hits.length === 1 ? { kind: 'one', id: only } : { kind: 'many', count: hits.length }
}
