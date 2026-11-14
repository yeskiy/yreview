import path from 'node:path'

import * as vscode from 'vscode'

import { homeDirectory } from '../bridge/discoveryFile'
import { BridgeHost } from '../bridge/host'
import { reviewRoutes } from '../bridge/reviewRoutes'
import type { Log } from '../log'
import { ReviewTools } from '../mcp/reviewTools'
import { ensureLauncher, refreshLauncher } from '../session/launcher'
import { readSettings } from '../settings'
import type { ReviewService } from '../store/reviewService'
import { type CloseReport, problemOf } from '../tasks/taskCompletion'
import { toolHost } from './toolHost'

export interface BridgeWiring {
  readonly host: BridgeHost
  readonly tools: ReviewTools
  readonly script: string
  launcher(): Promise<string>
}

export const wireBridge = (
  context: vscode.ExtensionContext,
  service: ReviewService,
  close: (ids: readonly string[]) => Promise<CloseReport>,
  gitPath: string,
  log: Log,
): BridgeWiring => {
  const tools = new ReviewTools(toolHost(service, gitPath))
  const host = new BridgeHost({
    channelOn: () => readSettings().channel,
    projectPath: () =>
      vscode.workspace.workspaceFolders?.find((folder) => folder.uri.scheme === 'file')?.uri.fsPath,
    home: () => homeDirectory(),
    onResolve: async (ids, session) => {
      const report = await close(ids)
      if (report.closed > 0) {
        log.info(
          `The review bridge closed ${report.closed} tasks for ${session ?? 'a session with no key'}.`,
        )
      }
      return problemOf(report)
    },
    routes: reviewRoutes(tools),
    warn: (message) => log.warn(message),
    pid: process.pid,
  })
  const script = path.join(context.extensionPath, 'dist', 'channel.js')
  refreshLauncher(homeDirectory(), process.execPath, script).catch((error: unknown) =>
    log.error('The channel launcher was not refreshed.', error),
  )
  context.subscriptions.push(
    {
      dispose: () => {
        host
          .dispose()
          .catch((error: unknown) => log.error('The review bridge did not stop.', error))
      },
    },
    vscode.workspace.onDidChangeConfiguration((change) => {
      if (change.affectsConfiguration('yreview.channel')) {
        host
          .applySwitch(readSettings().channel)
          .catch((error: unknown) => log.error('The channel switch failed.', error))
      }
    }),
  )
  return {
    host,
    tools,
    script,
    launcher: () => ensureLauncher(homeDirectory(), process.execPath, script),
  }
}
