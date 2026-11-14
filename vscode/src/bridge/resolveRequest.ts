import { isKnown } from '../core/taskIds'
import { MAX_CLOSE_IDS } from '../tasks/taskCompletion'

export const MAX_IDS = MAX_CLOSE_IDS
export const ID_RULE =
  'An id must be a short handle in the form y followed by letters and digits, ' +
  'a comment id of 40 lowercase hexadecimal characters, ' +
  'or a todo id in the form todo-<40 hexadecimal characters>-<number>.'

export type ResolveParse =
  | { readonly kind: 'ids'; readonly ids: readonly string[] }
  | { readonly kind: 'bad'; readonly reason: string }

const bad = (reason: string): ResolveParse => ({ kind: 'bad', reason })

const jsonOf = (body: string): unknown => {
  try {
    return JSON.parse(body)
  } catch {
    return undefined
  }
}

/** Every value comes from outside the editor, so only an identifier that the extension made passes. */
export const parseResolve = (body: string): ResolveParse => {
  const root = jsonOf(body)
  if (typeof root !== 'object' || root === null || Array.isArray(root)) {
    return bad('The body must be a JSON object.')
  }
  if (Object.keys(root).join(',') !== 'ids') {
    return bad('The body must hold the field ids and no other field.')
  }
  const { ids } = root as { readonly ids: unknown }
  if (!Array.isArray(ids)) return bad('The field ids must be an array.')
  if (ids.length === 0) return bad('The field ids must hold one id or more.')
  if (ids.length > MAX_IDS) return bad(`The field ids must hold ${MAX_IDS} ids or fewer.`)
  const wrong = ids.find((id: unknown) => typeof id !== 'string' || !isKnown(id))
  if (wrong !== undefined)
    return bad(typeof wrong === 'string' ? ID_RULE : 'Every id must be a string.')
  return { kind: 'ids', ids: [...new Set(ids as string[])] }
}
