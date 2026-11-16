// Runs the compatibility checks in the extension host and writes one record for each test.
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import Mocha from 'mocha'
import * as vscode from 'vscode'

import { evaluate, workbench } from '../integration/keymap/devtools'
import type { CompatConfig } from './kit'

interface TestRecord {
  readonly file: string
  readonly title: string
  readonly state: 'passed' | 'failed' | 'skipped'
  readonly error?: string
  readonly windowState?: unknown
}

/** What the window shows after a failed test, so the record tells why. */
const readWindow = async (): Promise<unknown> => ({
  activeTab: vscode.window.tabGroups.activeTabGroup.activeTab?.label,
  activeInput: (vscode.window.tabGroups.activeTabGroup.activeTab?.input as { viewType?: string })
    ?.viewType,
  page: await evaluate(
    await workbench(),
    `({ body: document.body.className.slice(0, 200),
      workbench: document.querySelector('.monaco-workbench')?.className.slice(0, 300) ?? null,
      focus: document.activeElement?.tagName + '.' + String(document.activeElement?.className).slice(0, 80),
      parts: [...document.querySelectorAll('.part')].filter((n) => n.getBoundingClientRect().width > 0).map((n) => n.id || n.className.slice(0, 40)),
      toasts: [...document.querySelectorAll('.notification-toast, .notifications-toasts')].map((n) => n.className.slice(0, 60)),
      menus: document.querySelectorAll('.monaco-menu, .context-view').length,
      frames: document.querySelectorAll('iframe').length })`,
  ).catch((error: unknown) => String(error)),
})

export const run = async (): Promise<void> => {
  const config = JSON.parse(
    readFileSync(path.join(__dirname, 'config.json'), 'utf8'),
  ) as CompatConfig
  // The remote extension host does not get the environment of the local editor.
  process.env.YREVIEW_USER_DATA = config.userData
  const mocha = new Mocha({ ui: 'bdd', timeout: 120_000, color: false })
  config.files.forEach((file) => mocha.addFile(path.join(__dirname, file)))
  const records: TestRecord[] = []
  const states = new Map<string, unknown>()
  mocha.suite.afterEach(async function dump() {
    if (this.currentTest?.state === 'failed')
      states.set(this.currentTest.fullTitle(), await readWindow().catch(String))
  })
  const record = (test: Mocha.Runnable, state: TestRecord['state'], error?: Error): void => {
    records.push({
      file: path.basename(test.file ?? ''),
      title: test.fullTitle(),
      state,
      ...(error === undefined ? {} : { error: error.message.slice(0, 2000) }),
    })
  }
  await new Promise<void>((resolve) => {
    const runner = mocha.run(() => resolve())
    runner.on('pass', (test) => record(test, 'passed'))
    runner.on('fail', (test, error: Error) => record(test, 'failed', error))
    runner.on('pending', (test) => record(test, 'skipped'))
  })
  writeFileSync(
    config.results,
    `${JSON.stringify(
      {
        host: vscode.env.remoteName ?? 'local',
        appName: vscode.env.appName,
        vscodeVersion: vscode.version,
        platform: process.platform,
        tests: records.map((one) => ({ ...one, windowState: states.get(one.title) })),
      },
      null,
      2,
    )}\n`,
  )
}
