import type { ReviewTools } from '../mcp/reviewTools'
import type { Route, RouteAnswer, RouteHandler } from './server'

export const COMMENTS_PATH = '/comments'
export const COMMENTS_RESOLVE_PATH = '/comments/resolve'
export const COMMENTS_OPEN_PATH = '/comments/open'

// The same limits stand in the tool input of src/channel/reviewTools.ts.
const MAX_ID = 200
const MAX_PATH = 1024
const MAX_TEXT = 20_000
const ID_RULE = 'The body must hold the field id and no other field.'

const ok = (body: unknown): RouteAnswer => ({ status: 200, body })
const refuse = (reason: string): RouteAnswer => ({ status: 400, body: { error: reason } })

/** True or false, the fallback for an empty or absent value, or undefined for any other value. */
const flag = (query: URLSearchParams, name: string, fallback: boolean): boolean | undefined => {
  const value = query.get(name)
  if (value === null || value === '') return fallback
  if (value === 'true') return true
  return value === 'false' ? false : undefined
}

/** An object with exactly these keys, or undefined. */
const fields = (body: string, names: readonly string[]): Record<string, unknown> | undefined => {
  const value = (() => {
    try {
      return JSON.parse(body) as unknown
    } catch {
      return undefined
    }
  })()
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const keys = Object.keys(value)
  return keys.length === names.length && keys.every((key) => names.includes(key))
    ? (value as Record<string, unknown>)
    : undefined
}

const isText = (value: unknown, min: number, max: number): value is string =>
  typeof value === 'string' && value.length >= min && value.length <= max

const isLine = (value: unknown): value is number => Number.isSafeInteger(value)

const idOf = (body: string): string | undefined => {
  const value = fields(body, ['id'])?.id
  return isText(value, 1, MAX_ID) ? value : undefined
}

const byId =
  (work: (id: string) => Promise<unknown>): RouteHandler =>
  async ({ body }) => {
    const id = idOf(body)
    return id === undefined ? refuse(ID_RULE) : ok(await work(id))
  }

/** The VS Code-only routes of spec section 13.1. A refusal of the tool is still a 200 answer. */
export const reviewRoutes = (tools: ReviewTools): ReadonlyMap<string, Route> =>
  new Map<string, Route>([
    [
      COMMENTS_PATH,
      {
        GET: async ({ query }) => {
          const resolved = flag(query, 'resolved', false)
          const analyses = flag(query, 'analyses', false)
          const local = flag(query, 'local', true)
          if (resolved === undefined || analyses === undefined || local === undefined) {
            return refuse('The query values resolved, analyses and local must be true or false.')
          }
          return ok(await tools.list(resolved, analyses, local))
        },
        POST: async ({ body }) => {
          const value = fields(body, ['path', 'startLine', 'endLine', 'text'])
          if (
            value === undefined ||
            !isText(value.path, 1, MAX_PATH) ||
            !isLine(value.startLine) ||
            !isLine(value.endLine) ||
            !isText(value.text, 0, MAX_TEXT)
          ) {
            return refuse(
              'The body must hold path, startLine, endLine and text, and no other field.',
            )
          }
          return ok(await tools.addComment(value.path, value.startLine, value.endLine, value.text))
        },
      },
    ],
    [COMMENTS_RESOLVE_PATH, { POST: byId((id) => tools.resolveComment(id)) }],
    [COMMENTS_OPEN_PATH, { POST: byId((id) => tools.openComment(id)) }],
  ])
