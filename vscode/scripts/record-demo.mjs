// Records the demo media on Linux inside Xvfb. The workflow record-media.yml runs it.
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { runTests } from '@vscode/test-electron'
import { build } from 'esbuild'

const scratch = path.join(tmpdir(), 'yreview-demo')
const repo = path.join(scratch, 'orders-service')
const userData = path.join(scratch, 'user-data')
const out = path.resolve(process.env.DEMO_OUT ?? path.join('.vscode-test', 'demo-media'))
const identity = path.join(scratch, 'identity.gitconfig')
const agentScript = path.resolve('test', 'demo', 'review-agent.sh')

rmSync(scratch, { recursive: true, force: true })
mkdirSync(path.join(userData, 'User'), { recursive: true })
mkdirSync(out, { recursive: true })

// --- Demo repository ---

const ORDERS = `import { formatMoney } from './money'

export interface OrderLine {
  readonly sku: string
  readonly quantity: number
  readonly unitPrice: number
}

export interface Order {
  readonly id: string
  readonly customerId: string
  readonly lines: readonly OrderLine[]
  readonly placedAt: Date
}

export interface OrderSummary {
  readonly count: number
  readonly total: number
  readonly average: number
  readonly largest?: Order
}

const orderTotal = (order: Order): number =>
  order.lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0)

export function summarizeOrders(orders: readonly Order[]): OrderSummary {
  let total = 0
  let largest: Order | undefined
  for (const order of orders) {
    const value = orderTotal(order)
    total += value
    if (!largest || value > orderTotal(largest)) {
      largest = order
    }
  }
  return {
    count: orders.length,
    total,
    average: total / orders.length,
    largest,
  }
}

export const describeSummary = (summary: OrderSummary): string =>
  \`\${summary.count} orders, \${formatMoney(summary.total)} in total\`
`

const MONEY = `const euro = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' })

export const formatMoney = (cents: number): string => euro.format(cents / 100)
`

const RETRY = `export interface RetryOptions {
  readonly attempts: number
  readonly delayMs: number
}

const sleep = (ms: number): Promise<void> =>
  new Promise((done) => setTimeout(done, ms))

export async function withRetry<T>(
  call: () => Promise<T>,
  { attempts, delayMs }: RetryOptions,
): Promise<T> {
  // TODO: Stop on a 4xx response.
  const run = async (n: number): Promise<T> => {
    try {
      return await call()
    } catch (error) {
      if (n + 1 >= attempts) throw error
      // TODO: Cap the delay at 30 seconds.
      const delay = delayMs * 2 ** n
      await sleep(delay)
      return run(n + 1)
    }
  }
  return run(0)
}
`

const RETRY_CHANGED = RETRY.replace(
  '      await sleep(delay)\n',
  '      const jitter = Math.random() * delayMs\n      await sleep(delay + jitter)\n',
)

const RELEASE = `# Release process

The service ships from \`main\` every Tuesday. Each release goes through the same steps.

## Before the release

- Merge the open pull requests that have two approvals.
- Run the load test against the staging cluster.
- Add the changes that users see to \`CHANGELOG.md\`.

## Tag and deploy

Create the tag on the release commit:

\`\`\`bash
git tag -a v2.4.0 -m "Release 2.4.0"
git push origin v2.4.0
\`\`\`

The pipeline builds the image and deploys it to staging first. After 30 minutes without errors, it deploys to production.

## Roll back

Deploy the previous tag again. Do not revert commits on \`main\` during an incident.
`

const README = `# orders-service

Order summaries and retry helpers for the checkout API.
`

const PACKAGE = `${JSON.stringify(
  {
    name: 'orders-service',
    version: '2.3.1',
    private: true,
    type: 'module',
    scripts: { test: 'vitest run' },
  },
  null,
  2,
)}\n`

writeFileSync(
  identity,
  '[user]\n\tname = Yreview Demo\n\temail = demo@example.com\n[init]\n\tdefaultBranch = main\n[commit]\n\tgpgsign = false\n',
)
const gitEnv = { ...process.env, GIT_CONFIG_GLOBAL: identity, GIT_CONFIG_NOSYSTEM: '1' }
const git = (...args) => execFileSync('git', args, { cwd: repo, env: gitEnv, stdio: 'ignore' })
const put = (file, text) => {
  mkdirSync(path.dirname(path.join(repo, file)), { recursive: true })
  writeFileSync(path.join(repo, file), text)
}
const commit = (message, files, date) => {
  Object.entries(files).forEach(([file, text]) => put(file, text))
  git('add', '.')
  execFileSync('git', ['commit', '-q', '-m', message], {
    cwd: repo,
    env: { ...gitEnv, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
  })
}

mkdirSync(repo, { recursive: true })
git('init', '-q', '-b', 'main')
commit(
  'feat: add the order summary',
  { 'README.md': README, 'package.json': PACKAGE, 'src/orders.ts': ORDERS, 'src/money.ts': MONEY },
  '2026-11-02T10:15:00Z',
)
commit(
  'feat: retry failed calls to the payment API',
  { 'src/retry.ts': RETRY },
  '2026-11-05T14:40:00Z',
)
commit(
  'docs: describe the release process',
  { 'docs/release-process.md': RELEASE },
  '2026-11-09T09:05:00Z',
)
put('src/retry.ts', RETRY_CHANGED)

// --- VS Code profile ---

writeFileSync(
  path.join(userData, 'User', 'settings.json'),
  `${JSON.stringify(
    {
      'workbench.colorTheme': 'Default Dark Modern',
      'workbench.startupEditor': 'none',
      'workbench.tips.enabled': false,
      'workbench.enableExperiments': false,
      'workbench.layoutControl.enabled': false,
      'workbench.editor.empty.hint': 'hidden',
      'workbench.view.alwaysShowHeaderActions': true,
      'workbench.secondarySideBar.defaultVisibility': 'hidden',
      'workbench.welcomePage.walkthroughs.openOnInstall': false,
      'window.titleBarStyle': 'native',
      'window.menuBarVisibility': 'compact',
      'window.commandCenter': false,
      'window.restoreWindows': 'none',
      'telemetry.telemetryLevel': 'off',
      'update.mode': 'none',
      'extensions.ignoreRecommendations': true,
      'chat.disableAIFeatures': true,
      'chat.commandCenter.enabled': false,
      'editor.fontFamily': "'JetBrains Mono', 'DejaVu Sans Mono', monospace",
      'editor.fontSize': 14,
      'editor.lineHeight': 21,
      'editor.minimap.enabled': false,
      'editor.stickyScroll.enabled': false,
      'editor.hover.enabled': false,
      'editor.lightbulb.enabled': 'off',
      'editor.occurrencesHighlight': 'off',
      'editor.selectionHighlight': false,
      'editor.guides.indentation': false,
      'editor.renderLineHighlight': 'none',
      'editor.renderWhitespace': 'none',
      'editor.showFoldingControls': 'never',
      'editor.cursorBlinking': 'solid',
      'breadcrumbs.enabled': false,
      'git.openRepositoryInParentFolders': 'never',
      'git.autofetch': false,
      'git.showProgress': false,
      'scm.showIncomingChanges': 'never',
      'scm.showOutgoingChanges': 'never',
      'security.workspace.trust.enabled': false,
      'terminal.integrated.fontSize': 13,
      'terminal.integrated.fontFamily': "'JetBrains Mono', 'DejaVu Sans Mono', monospace",
      'terminal.integrated.shellIntegration.enabled': false,
      'terminal.integrated.enablePersistentSessions': false,
      'yreview.agent': 'custom',
      'yreview.agentCommands': { custom: `bash ${agentScript}` },
      'yreview.autoStartSession': false,
    },
    null,
    2,
  )}\n`,
)

// --- Demo run ---

await build({
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  entryPoints: ['test/demo/demo.ts'],
  outfile: 'out/test/demo/demo.js',
  external: ['vscode'],
  logLevel: 'info',
})

const code = await runTests({
  version: process.env.VSCODE_TEST_VERSION ?? 'stable',
  extensionDevelopmentPath: path.resolve('.'),
  extensionTestsPath: path.resolve('out/test/demo/demo.js'),
  launchArgs: [
    repo,
    `--user-data-dir=${userData}`,
    `--extensions-dir=${path.join(scratch, 'extensions')}`,
    '--remote-debugging-port=0',
  ],
  extensionTestsEnv: {
    GIT_CONFIG_GLOBAL: identity,
    GIT_CONFIG_NOSYSTEM: '1',
    YREVIEW_USER_DATA: userData,
    DEMO_OUT: out,
  },
})
process.exit(code)
