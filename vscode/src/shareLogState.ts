import type * as vscode from 'vscode'

import { ShareLog, readMarks, readRenames } from './store/shareLog'

const KEY = 'yreview.shareLog'
const RENAMES = 'yreview.renamedIds'

/** The share log of this workspace. The marks and renames live in the workspace state, outside the repository. */
export const shareLogOf = (state: vscode.Memento): ShareLog =>
  new ShareLog(
    readMarks(state.get<unknown>(KEY)),
    (marks) => Promise.resolve(state.update(KEY, marks)),
    readRenames(state.get<unknown>(RENAMES)),
    (renames) => Promise.resolve(state.update(RENAMES, renames)),
  )
