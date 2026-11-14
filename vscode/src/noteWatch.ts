import * as vscode from 'vscode'

const NOTE_GLOBS = ['.git/refs/notes/**', '.git/packed-refs', '.y-review/notes/**']

/** Gives the changed files 300 ms after the last change of a note ref or a folder store note. */
export const watchNotes = (onChange: (files: readonly string[]) => void): vscode.Disposable[] => {
  const timer: { handle?: NodeJS.Timeout } = {}
  const changed = new Set<string>()
  const later = (uri: vscode.Uri): void => {
    changed.add(uri.fsPath)
    clearTimeout(timer.handle)
    timer.handle = setTimeout(() => {
      const files = [...changed]
      changed.clear()
      onChange(files)
    }, 300)
  }
  return [
    { dispose: () => clearTimeout(timer.handle) },
    ...(vscode.workspace.workspaceFolders ?? []).flatMap((folder) =>
      NOTE_GLOBS.map((glob) => {
        const watcher = vscode.workspace.createFileSystemWatcher(
          new vscode.RelativePattern(folder, glob),
        )
        watcher.onDidChange(later)
        watcher.onDidCreate(later)
        watcher.onDidDelete(later)
        return watcher
      }),
    ),
  ]
}
