import { open } from 'node:fs/promises'

import type * as vscode from 'vscode'

import { holds, joinPath, rootLabel } from '../core/storeRules'
import type { Anchor } from '../store/reviewService'
import type { OutsideRoot } from '../tasks/taskScan'

/** The largest file that the scan reads from the disk, the cap of `spec/format.md` section 11. */
export const TEXT_CAP_BYTES = 4_194_304

/** A text tab, the modified side of a text diff, and a custom editor give a URI. A notebook gives none. */
const uriOfInput = (input: unknown): vscode.Uri | undefined => {
  if (typeof input !== 'object' || input === null || 'notebookType' in input) return undefined
  if ('modified' in input) return input.modified as vscode.Uri
  return 'uri' in input ? (input.uri as vscode.Uri) : undefined
}

/** The file URIs of every tab group, each once. */
export const openFileUris = (groups: readonly vscode.TabGroup[]): readonly vscode.Uri[] => [
  ...new Map(
    groups
      .flatMap((group) => group.tabs)
      .flatMap((tab) => uriOfInput(tab.input) ?? [])
      .filter((uri) => uri.scheme === 'file')
      .map((uri) => [uri.toString(), uri] as const),
  ).values(),
]

interface OutsideFile {
  readonly uri: vscode.Uri
  readonly anchor: Anchor
}

/** The anchored open files that no inside root holds, sorted by root and path. */
export const outsideFiles = async (
  uris: readonly vscode.Uri[],
  insideRoots: readonly string[],
  anchorOf: (uri: vscode.Uri) => Promise<Anchor | undefined>,
): Promise<readonly OutsideFile[]> =>
  (await Promise.all(uris.map(async (uri) => ({ uri, anchor: await anchorOf(uri) }))))
    .flatMap(({ uri, anchor }) =>
      anchor === undefined ||
      insideRoots.some((inside) => holds(inside, joinPath(anchor.root, anchor.path)))
        ? []
        : [{ uri, anchor }],
    )
    .sort(
      (a, b) =>
        a.anchor.root.localeCompare(b.anchor.root) || a.anchor.path.localeCompare(b.anchor.path),
    )

/** One key for a set of outside files, so a tab event that changes nothing starts no scan. */
export const outsideKey = (files: readonly OutsideFile[]): string =>
  files.map(({ anchor }) => joinPath(anchor.root, anchor.path)).join('\n')

export const outsideRoots = async (
  uris: readonly vscode.Uri[],
  insideRoots: readonly string[],
  anchorOf: (uri: vscode.Uri) => Promise<Anchor | undefined>,
  textOf: (uri: vscode.Uri) => Promise<string | undefined>,
  home: string | undefined,
): Promise<readonly OutsideRoot[]> => [
  ...(
    await Promise.all(
      (await outsideFiles(uris, insideRoots, anchorOf)).map(async ({ uri, anchor }) => ({
        anchor,
        text: (await textOf(uri)) ?? '',
      })),
    )
  )
    .reduce((roots, { anchor, text }) => {
      const known = roots.get(anchor.root)
      if (known?.files.some((file) => file.path === anchor.path) === true) return roots
      return roots.set(anchor.root, {
        root: anchor.root,
        store: anchor.store,
        commit: anchor.head,
        label: rootLabel(anchor.root, home),
        files: [...(known?.files ?? []), { path: anchor.path, text }],
      })
    }, new Map<string, OutsideRoot>())
    .values(),
]

/** The text of an open document, else of the file on the disk up to the cap, else undefined. */
export const textOfDocuments =
  (documents: () => readonly { readonly uri: vscode.Uri; getText(): string }[]) =>
  async (uri: vscode.Uri): Promise<string | undefined> => {
    const document = documents().find((each) => each.uri.toString() === uri.toString())
    if (document !== undefined) return document.getText()
    const handle = await open(uri.fsPath, 'r').catch(() => undefined)
    if (handle === undefined) return undefined
    try {
      const info = await handle.stat()
      if (!info.isFile()) return undefined
      const buffer = Buffer.alloc(Math.min(info.size, TEXT_CAP_BYTES) + 1)
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
      return bytesRead > TEXT_CAP_BYTES ? undefined : buffer.toString('utf8', 0, bytesRead)
    } finally {
      await handle.close()
    }
  }
