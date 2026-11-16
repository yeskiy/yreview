// Runs the compatibility checks in the extension host and writes one record for each test.
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import Mocha from 'mocha'
import * as vscode from 'vscode'

import type { CompatConfig } from './kit'

interface TestRecord {
  readonly file: string
  readonly title: string
  readonly state: 'passed' | 'failed' | 'skipped'
  readonly error?: string
}

export const run = async (): Promise<void> => {
  const config = JSON.parse(
    readFileSync(path.join(__dirname, 'config.json'), 'utf8'),
  ) as CompatConfig
  // The remote extension host does not get the environment of the local editor.
  process.env.YREVIEW_USER_DATA = config.userData
  const mocha = new Mocha({ ui: 'bdd', timeout: 120_000, color: false })
  config.files.forEach((file) => mocha.addFile(path.join(__dirname, file)))
  const records: TestRecord[] = []
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
        tests: records,
      },
      null,
      2,
    )}\n`,
  )
}
