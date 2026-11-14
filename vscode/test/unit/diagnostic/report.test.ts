import assert from 'node:assert/strict'
import path from 'node:path'

import { PROJECT_MARK } from '../../../src/core/redact'
import {
  type MachineFacts,
  type ReportFacts,
  REPORT_TITLE,
  reportHead,
  reportText,
} from '../../../src/diagnostic/report'
import { LIMIT } from '../../../src/diagnostic/sessionLog'
import { failureRecord, sendRecord, sessionRecord } from '../../../src/diagnostic/sessionRecord'

// Every private value of the machine goes into a record on purpose. The report must drop all of them.
const home = 'C:/Users/alice'
const project = 'E:/work/demo-repo'
const token = '9f8e7d6c5b4a39281706f5e4d3c2b1a09f8e7d6c5b4a39281706f5e4d3c2b1a0'
const email = 'alice@example.com'
const remote = 'https://github.com/alice-corp/secret-app.git'
const at = new Date(2026, 8, 4, 10, 11, 12)

const machine: MachineFacts = {
  extension: '1.0.0',
  editor: 'Visual Studio Code 1.146.0',
  host: 'local',
  os: 'Windows_NT 10.0.26100 x64',
  node: '24.22.2',
  git: '2.55.0',
  languageModelTools: true,
  mcpProvider: false,
}
const facts: ReportFacts = {
  machine,
  channel: true,
  sharing: 'local',
  sessionLocation: 'panel',
  agent: 'claude',
  agentCommand: 'default',
}
const poisoned = sessionRecord(
  {
    command: `claude --token ${token} --config C:/Users/alice/AppData/Local/Temp/mcp.json`,
    directory: project,
    bridgeReady: true,
    bridgeUrl: 'http://127.0.0.1:64343',
    status: `The remote is ${remote} and the author is ${email}.`,
    channelServer: {
      kind: 'found',
      path: 'C:/Users/alice/.vscode/extensions/yeskiy.yreview-1.0.0/dist/channel.js',
    },
    runtime: 'C:/Users/alice/AppData/Local/Programs/Microsoft VS Code/Code.exe',
    configFile: 'C:/Users/alice/.y-review/mcp/claude-vscode.json',
    terminalStarted: true,
    processId: 4242,
  },
  at,
)
const failure = failureRecord(
  'push the shared note',
  Object.assign(new Error(`git could not read ${remote} for ${email} under C:/Users/alice/work`), {
    name: 'IOError',
  }),
  path.resolve(__dirname, '../../..'),
  at,
)
const send = sendRecord(
  { route: 'CHANNEL', store: 'git', readers: 1, tasks: 3, batches: 1, dropped: 0 },
  at,
)
const places = { homes: [home], projects: [project], repositories: [] }
const report = reportText(facts, [poisoned, send, failure], places)

describe('the diagnostic report', () => {
  describe('what a maintainer needs', () => {
    it('names the extension version and the editor build', () => {
      assert.match(report, /1\.0\.0/)
      assert.match(report, /Visual Studio Code 1\.146\.0/)
    })
    it('names the two optional APIs in the head', () => {
      assert.match(reportHead(machine), /lm tools/)
      assert.match(reportHead(machine), /mcp provider/)
    })
    it('opens with a line that says what the report is', () =>
      assert.ok(reportHead(machine).startsWith(REPORT_TITLE)))
    it('names the switches of the window', () => {
      assert.match(report, /channel/)
      assert.match(report, /sharing {8}local/)
    })
    it('keeps the counts, the routes and the kinds', () => {
      assert.match(report, /channel/)
      assert.match(report, /git/)
      assert.match(report, /readers/)
      assert.match(report, /IOError/)
    })
    it('keeps the loopback address of the bridge', () =>
      assert.match(report, /http:\/\/127\.0\.0\.1:64343/))
    it('names how many records it holds', () =>
      assert.ok(report.includes(`Records, newest first (3 of ${LIMIT})`), report))
  })

  describe('the rule that decides whether this ships', () => {
    it('never carries the bridge token', () => assert.ok(!report.includes(token)))
    it('never carries a part of the bridge token', () =>
      assert.ok(!report.includes(token.slice(0, 12))))
    it('never carries an absolute path of the user', () => {
      assert.ok(!report.includes(home), report)
      assert.ok(!report.includes(project), report)
      assert.ok(!report.includes('alice'), report)
    })
    it('never carries the git remote', () => {
      assert.ok(!report.includes(remote), report)
      assert.ok(!report.includes('github.com'), report)
    })
    it('never carries the mail address of the user', () => {
      assert.ok(!report.includes(email), report)
      assert.ok(!report.includes('example.com'), report)
    })
    // The window inside WSL names /mnt/e/work/demo-repo, and a record can name E:/work/demo-repo.
    it('removes a project path inside WSL under both spellings', () => {
      const wslRecord = sessionRecord(
        {
          command: 'claude',
          directory: 'E:/work/demo-repo',
          bridgeReady: false,
          bridgeUrl: '',
          status: 'off',
          terminalStarted: false,
        },
        at,
      )
      const text = reportText(facts, [wslRecord], {
        homes: [home],
        projects: ['/mnt/e/work/demo-repo'],
        repositories: [],
      })
      assert.ok(!text.includes('demo-repo'), text)
      assert.ok(text.includes(PROJECT_MARK), text)
    })
    it('keeps the rules when the machine is not known', () => {
      const text = reportText(facts, [poisoned, failure], {
        homes: [],
        projects: [],
        repositories: [],
      })
      assert.ok(!text.includes(token))
      assert.ok(!text.includes(email))
      assert.ok(!text.includes(remote))
    })
  })
})
