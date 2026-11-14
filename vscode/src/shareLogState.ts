import type * as vscode from 'vscode'

import { ShareLog, readMarks } from './store/shareLog'

const KEY = 'yreview.shareLog'

/** The share log of this workspace. The marks live in the workspace state, outside the repository. */
export const shareLogOf = (state: vscode.Memento): ShareLog =>
  new ShareLog(readMarks(state.get<unknown>(KEY)), (marks) =>
    Promise.resolve(state.update(KEY, marks)),
  )
