import path from 'node:path'

import { isUnder } from '../core/paths'

export type LinkTarget =
  | { readonly kind: 'external'; readonly uri: string }
  | { readonly kind: 'file'; readonly path: string }

const SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]*:/
const EXTERNAL = new Set(['http:', 'https:', 'mailto:'])

const decoded = (text: string): string | undefined => {
  try {
    return decodeURIComponent(text)
  } catch {
    return undefined
  }
}

/** The target of a link of the page. A `#` link stays in the page, so it gives undefined here. */
export const linkTarget = (
  href: string,
  documentPath: string,
  root: string | undefined,
): LinkTarget | undefined => {
  const text = href.trim()
  if (text === '' || text.startsWith('#')) return undefined
  if (SCHEME.test(text)) {
    const url = URL.canParse(text) ? new URL(text) : undefined
    return url !== undefined && EXTERNAL.has(url.protocol)
      ? { kind: 'external', uri: url.toString() }
      : undefined
  }
  const relative = decoded(text.split(/[?#]/)[0] ?? '')
  if (relative === undefined || relative === '' || root === undefined) return undefined
  const file = relative.startsWith('/')
    ? path.join(root, relative)
    : path.resolve(path.dirname(documentPath), relative)
  return isUnder(root, file) ? { kind: 'file', path: file } : undefined
}
