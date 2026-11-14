import * as vscode from 'vscode'

import { type ReviewSession, type ReviewSessions, nameOf } from './terminals'

export const sessionRow = (session: ReviewSession): vscode.TreeItem =>
  Object.assign(new vscode.TreeItem(nameOf(session)), {
    id: session.key,
    description: session.agent.label,
    tooltip: `${nameOf(session)}, ${session.agent.label}`,
    iconPath: new vscode.ThemeIcon('terminal'),
    contextValue: 'yreview.session',
    command: {
      command: 'yreview.showSession',
      title: 'Show Review Session',
      arguments: [session],
    },
  })

/** One row for each running session. The welcome text of the manifest shows when none runs. */
export class SessionsView implements vscode.TreeDataProvider<ReviewSession>, vscode.Disposable {
  private readonly changed = new vscode.EventEmitter<void>()

  readonly onDidChangeTreeData = this.changed.event

  readonly getTreeItem = sessionRow

  private readonly listening: vscode.Disposable

  constructor(private readonly sessions: ReviewSessions) {
    this.listening = sessions.onDidChange(() => this.changed.fire())
  }

  getChildren(element?: ReviewSession): ReviewSession[] {
    return element === undefined ? [...this.sessions.list()] : []
  }

  dispose(): void {
    this.listening.dispose()
    this.changed.dispose()
  }
}
