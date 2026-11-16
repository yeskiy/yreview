import * as vscode from 'vscode'

import { fitted, type LineRange } from './previewLines'

/** The lines as a selection of whole lines, without blank lines at the end. */
export const wholeLines = (
  document: vscode.TextDocument,
  lines: LineRange | undefined,
): vscode.Selection | undefined => {
  const range =
    lines === undefined
      ? undefined
      : fitted(lines, document.lineCount, (line) => document.lineAt(line).isEmptyOrWhitespace)
  return range === undefined
    ? undefined
    : new vscode.Selection(range.start, 0, range.end, document.lineAt(range.end).text.length)
}
