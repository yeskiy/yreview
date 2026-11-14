import { stat } from 'node:fs/promises'

import { readIfFile, writeAtomic } from '../core/atomicWrite'

const SERVERS = 'mcpServers'

export type McpMerge =
  | { readonly kind: 'text'; readonly value: string }
  | { readonly kind: 'problem'; readonly value: string }

export type McpWrite =
  | { readonly kind: 'written' }
  | { readonly kind: 'declined' }
  | { readonly kind: 'problem'; readonly value: string }

/** Shows the user the file and the whole new text. True means the user agreed to the write. */
export type McpApproval = (file: string, text: string) => Promise<boolean>

interface RawJson {
  readonly rawJSON: (text: string) => unknown
  readonly isRawJSON: (value: unknown) => boolean
}
type SourceReviver = (key: string, value: unknown, context: { readonly source?: string }) => unknown

const RAW = JSON as unknown as RawJson

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) && !RAW.isRawJSON(value)

/** Each number keeps its literal text, so 1.0 and a 20-digit value come back unchanged. */
const keepNumbers: SourceReviver = (_key, value, context) =>
  typeof value === 'number' && context.source !== undefined ? RAW.rawJSON(context.source) : value

const objectOf = (text: string): Record<string, unknown> | undefined => {
  try {
    const value: unknown = JSON.parse(text, keepNumbers as Parameters<typeof JSON.parse>[1])
    return isPlainObject(value) ? value : undefined
  } catch {
    return undefined
  }
}

/** Adds each server of `wanted`, and keeps every other key and server of the file. */
export const mergeMcp = (existing: string | undefined, wanted: string): McpMerge => {
  const add = objectOf(wanted)?.[SERVERS]
  if (!isPlainObject(add))
    return { kind: 'problem', value: 'Yreview made no server entry to write.' }
  const base = existing === undefined || existing.trim() === '' ? {} : objectOf(existing)
  if (base === undefined) {
    return {
      kind: 'problem',
      value: 'The file holds no valid JSON object, so Yreview did not change it.',
    }
  }
  const servers = base[SERVERS] ?? {}
  if (!isPlainObject(servers)) {
    return {
      kind: 'problem',
      value: `The ${SERVERS} key of the file holds no object, so Yreview did not change it.`,
    }
  }
  return {
    kind: 'text',
    value: JSON.stringify({ ...base, [SERVERS]: { ...servers, ...add } }, null, 4),
  }
}

/** The file changes only after the user approves the whole new text. A file keeps its mode. */
export const writeMcpFile = async (
  file: string,
  wanted: string,
  approve: McpApproval,
): Promise<McpWrite> => {
  const before = await readIfFile(file)
  const merged = mergeMcp(before, wanted)
  if (merged.kind === 'problem') return { kind: 'problem', value: `${merged.value} File: ${file}` }
  if (!(await approve(file, merged.value))) return { kind: 'declined' }
  if ((await readIfFile(file)) !== before) {
    return {
      kind: 'problem',
      value: `The file changed while the dialog was open, so Yreview did not change it. File: ${file}`,
    }
  }
  const mode = (await stat(file).catch(() => undefined))?.mode
  await writeAtomic(file, merged.value, mode === undefined ? 0o644 : mode % 0o1000)
  return { kind: 'written' }
}
