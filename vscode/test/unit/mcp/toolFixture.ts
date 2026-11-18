import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { containedPath, isUnder } from '../../../src/core/paths'
import type { RecordRange } from '../../../src/core/record'
import { type ToolHost, type ToolStore, ReviewTools } from '../../../src/mcp/reviewTools'
import { CommentBook } from '../../../src/store/commentBook'
import { refFor } from '../../../src/store/noteRefs'
import type { Anchor } from '../../../src/store/reviewService'
import { removeDir, scratchDir } from '../../fixtures/scratch'
import { MemoryNotes } from '../store/memoryNotes'

export const COMMIT_A = 'a'.repeat(40)
export const COMMIT_B = 'b'.repeat(40)
export const WORKTREE = 'worktree'

export interface AddCall {
  readonly anchor: Anchor
  readonly range: RecordRange
  readonly text: string
  readonly shared: boolean
}

/** A git store at commit A and a folder store, each on a scratch folder with one file. */
export const toolFixture = () => {
  const gitRoot = scratchDir()
  const folderRoot = scratchDir()
  mkdirSync(path.join(gitRoot, 'src'))
  mkdirSync(path.join(folderRoot, 'src'))
  writeFileSync(path.join(gitRoot, 'src', 'a.ts'), 'one\ntwo\nthree\nfour\nfive\n')
  writeFileSync(path.join(folderRoot, 'src', 'b.ts'), 'one\n')
  const gitNotes = new MemoryNotes()
  const folderNotes = new MemoryNotes()
  const author = async (): Promise<string> => 'dev@example.com'
  const git: ToolStore = {
    root: gitRoot,
    kind: 'git',
    head: COMMIT_A,
    book: new CommentBook(gitNotes, author),
  }
  const folder: ToolStore = {
    root: folderRoot,
    kind: 'folder',
    head: WORKTREE,
    book: new CommentBook(folderNotes, author),
  }
  const calls = {
    anchorOf: [] as string[],
    add: [] as AddCall[],
    changed: 0,
    showFile: [] as { file: string; line: number }[],
    showDiff: [] as { root: string; path: string; revision: string; line: number }[],
  }
  // A set root makes the anchor name a store outside the workspace, as a loose file does.
  const state: { diffShown: boolean; anchorRoot?: string } = { diffShown: true }
  const host: ToolHost = {
    stores: async () => [git, folder],
    folders: () => [gitRoot, folderRoot],
    workspaceRoots: async () => [gitRoot, folderRoot],
    containedPath,
    anchorOf: async (file) => {
      calls.anchorOf.push(file)
      return isUnder(gitRoot, file)
        ? {
            kind: 'found',
            anchor: {
              store: 'git',
              root: state.anchorRoot ?? gitRoot,
              head: COMMIT_A,
              path: path.relative(gitRoot, file).replaceAll('\\', '/'),
            },
          }
        : { kind: 'noPlace' }
    },
    addComment: async (anchor, range, text, shared) => {
      calls.add.push({ anchor, range, text, shared })
      return { stored: await git.book.add(refFor(shared), anchor.head, anchor.path, range, text) }
    },
    shareByDefault: () => true,
    changed: () => {
      calls.changed += 1
    },
    showFile: async (file, line) => {
      calls.showFile.push({ file, line })
    },
    showDiff: async (root, relative, revision, line) => {
      calls.showDiff.push({ root, path: relative, revision, line })
      return state.diffShown
    },
  }
  return {
    gitRoot,
    folderRoot,
    gitNotes,
    git,
    folder,
    calls,
    state,
    tools: new ReviewTools(host),
    dispose: () => {
      removeDir(gitRoot)
      removeDir(folderRoot)
    },
  }
}
