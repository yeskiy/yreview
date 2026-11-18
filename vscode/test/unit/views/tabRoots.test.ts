import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import path from 'node:path'

import type * as vscode from 'vscode'

import { WORKTREE } from '../../../src/core/anchor'
import type { Anchor } from '../../../src/store/reviewService'
import {
  TEXT_CAP_BYTES,
  openFileUris,
  outsideRoots,
  textOfDocuments,
} from '../../../src/views/tabRoots'
import { removeDir, scratchDir } from '../../fixtures/scratch'

const uriOf = (fsPath: string, scheme = 'file'): vscode.Uri =>
  ({ scheme, fsPath, toString: () => `${scheme}://${fsPath}` }) as unknown as vscode.Uri

const groupsOf = (...inputs: readonly (readonly unknown[])[]): readonly vscode.TabGroup[] =>
  inputs.map((tabs) => ({ tabs: tabs.map((input) => ({ input })) })) as unknown as vscode.TabGroup[]

const folder = (root: string, file: string): Anchor => ({
  store: 'folder',
  root,
  head: WORKTREE,
  path: file,
})

const ANCHORS: ReadonlyMap<string, Anchor> = new Map([
  ['/work/src/a.ts', { store: 'git', root: '/work', head: 'c1', path: 'src/a.ts' }],
  ['/loose/a.txt', folder('/loose', 'a.txt')],
  ['/loose/sub/b.txt', folder('/loose', 'sub/b.txt')],
  ['/other/repo/x.ts', { store: 'git', root: '/other/repo', head: 'c2', path: 'x.ts' }],
  ['/notes/n.txt', folder('/notes', 'n.txt')],
])

const anchorOf = (uri: vscode.Uri): Promise<Anchor | undefined> =>
  Promise.resolve(uri.scheme === 'file' ? ANCHORS.get(uri.fsPath) : undefined)

const textOf = (uri: vscode.Uri): Promise<string | undefined> =>
  Promise.resolve(`text of ${uri.fsPath}`)

const rootsOf = (...paths: readonly string[]) =>
  outsideRoots(
    paths.map((each) => uriOf(each)),
    ['/work'],
    anchorOf,
    textOf,
    '/home',
  )

describe('the roots of open tabs outside the workspace', () => {
  it('gives no outside root for a file under a workspace root', async () => {
    assert.deepEqual(await rootsOf('/work/src/a.ts'), [])
  })

  it('gives one root with 2 files for two loose files of one store', async () => {
    assert.deepEqual(await rootsOf('/loose/sub/b.txt', '/loose/a.txt'), [
      {
        root: '/loose',
        store: 'folder',
        commit: WORKTREE,
        label: 'loose (/loose)',
        files: [
          { path: 'a.txt', text: 'text of /loose/a.txt' },
          { path: 'sub/b.txt', text: 'text of /loose/sub/b.txt' },
        ],
      },
    ])
  })

  it('gives a git root for a file of a repository outside the workspace', async () => {
    const [root, ...more] = await rootsOf('/other/repo/x.ts')
    assert.deepEqual(more, [])
    assert.equal(root?.store, 'git')
    assert.equal(root?.commit, 'c2')
    assert.deepEqual(root?.files, [{ path: 'x.ts', text: 'text of /other/repo/x.ts' }])
  })

  it('gives nothing for a file that the anchor refuses', async () => {
    assert.deepEqual(await rootsOf('/nowhere/z.txt'), [])
  })

  it('gives nothing for a tab of a scheme that is not file', async () => {
    assert.deepEqual(
      await outsideRoots([uriOf('/loose/a.txt', 'untitled')], [], anchorOf, textOf, undefined),
      [],
    )
  })

  it('sorts the roots by root', async () => {
    assert.deepEqual(
      (await rootsOf('/other/repo/x.ts', '/notes/n.txt', '/loose/a.txt')).map((each) => each.root),
      ['/loose', '/notes', '/other/repo'],
    )
  })

  it('keeps a file of an open tab with no text, so its comments still show', async () => {
    const [root] = await outsideRoots(
      [uriOf('/loose/a.txt')],
      [],
      anchorOf,
      () => Promise.resolve(undefined),
      undefined,
    )
    assert.deepEqual(root?.files, [{ path: 'a.txt', text: '' }])
  })
})

describe('the file URIs of open tabs', () => {
  const text = { uri: uriOf('/a.txt') }
  const diff = { original: uriOf('/old.txt', 'git'), modified: uriOf('/b.txt') }
  const custom = { uri: uriOf('/c.png'), viewType: 'image' }
  const notebook = { uri: uriOf('/d.ipynb'), notebookType: 'jupyter' }
  const notebookDiff = {
    original: uriOf('/e.ipynb'),
    modified: uriOf('/f.ipynb'),
    notebookType: 'jupyter',
  }

  it('keeps text, the modified side of a diff and custom inputs from every group', () => {
    assert.deepEqual(
      openFileUris(groupsOf([text, notebook], [diff, custom, notebookDiff, { viewType: 'x' }])).map(
        (uri) => uri.fsPath,
      ),
      ['/a.txt', '/b.txt', '/c.png'],
    )
  })

  it('gives each file once and drops a scheme that is not file', () => {
    assert.deepEqual(
      openFileUris(groupsOf([text, { uri: uriOf('/u', 'untitled') }], [text, undefined])).map(
        (uri) => uri.fsPath,
      ),
      ['/a.txt'],
    )
  })
})

describe('the text of an open tab', () => {
  const dirs: string[] = []
  after(() => dirs.forEach(removeDir))
  const fileWith = (content: string): string => {
    const dir = scratchDir()
    dirs.push(dir)
    const file = path.join(dir, 'f.txt')
    writeFileSync(file, content)
    return file
  }

  it('reads an open document before the disk', async () => {
    const file = fileWith('disk')
    const read = textOfDocuments(() => [{ uri: uriOf(file), getText: () => 'buffer' }])
    assert.equal(await read(uriOf(file)), 'buffer')
  })

  it('reads the disk when no document is open', async () => {
    assert.equal(await textOfDocuments(() => [])(uriOf(fileWith('disk'))), 'disk')
  })

  it('gives no text for a file above the cap or a file that is not there', async () => {
    const read = textOfDocuments(() => [])
    assert.equal(await read(uriOf(fileWith('x'.repeat(TEXT_CAP_BYTES + 1)))), undefined)
    assert.equal(
      await read(uriOf(fileWith('x'.repeat(TEXT_CAP_BYTES)))),
      'x'.repeat(TEXT_CAP_BYTES),
    )
    assert.equal(await read(uriOf(path.join(path.dirname(fileWith('')), 'none.txt'))), undefined)
  })
})
