// Runs the compatibility checks of test/compat in one editor setup. The workflow compat.yml runs it.
// Usage: node scripts/compat.mjs --setup <name> --mode <local|ssh|wsl|devcontainer>
//   --install <editor folder | vscode-stable> --vsix <file> --out <folder>
//   [--ssh-host <alias>] [--wsl-distro <name>]
import { execFileSync, spawnSync } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { setTimeout as wait } from 'node:timers/promises'

import { downloadAndUnzipVSCode, runTests } from '@vscode/test-electron'
import { build } from 'esbuild'

import { CHECKS, SKIPPED } from './compat-checks.mjs'

const { values: args } = parseArgs({
  options: {
    setup: { type: 'string' },
    mode: { type: 'string', default: 'local' },
    install: { type: 'string' },
    vsix: { type: 'string' },
    out: { type: 'string' },
    'ssh-host': { type: 'string', default: 'yreview-ci' },
    'wsl-distro': { type: 'string', default: 'Ubuntu-24.04' },
  },
})
const setup = args.setup ?? 'unknown'
const { mode } = args
const RUN_TIMEOUT_MS = 15 * 60_000

const HOSTS = { local: 'local', ssh: 'ssh-remote', wsl: 'wsl', devcontainer: 'dev-container' }

const root = path.join(process.env.RUNNER_TEMP ?? tmpdir(), 'yreview-compat')
const userData = path.join(root, 'user-data')
const extensions = path.join(root, 'extensions')
const extension = path.join(root, 'vsix', 'extension')
const bundle = path.join(extension, 'compat')
const staging = path.join(root, 'staging')
const say = (text) => console.log(`[compat] ${text}`)

// --- Editor ---

const filesUnder = (folder, depth) =>
  readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(entry.parentPath, entry.name)
    if (entry.isDirectory()) return depth > 0 ? filesUnder(full, depth - 1) : []
    return [full]
  })

const fail = (message) => {
  throw new Error(message)
}

/** The executable, the CLI and the product facts of an editor folder. */
const editorIn = (folder) => {
  const productFile =
    filesUnder(folder, 8).find((file) =>
      file.endsWith(path.join('resources', 'app', 'product.json')),
    ) ?? fail(`no product.json under ${folder}`)
  const product = JSON.parse(readFileSync(productFile, 'utf8'))
  const app = path.dirname(productFile)
  const names =
    process.platform === 'win32'
      ? [product.nameShort, product.applicationName, product.win32ExeBasename]
          .filter(Boolean)
          .map((name) => `${name}.exe`)
      : [product.applicationName]
  const levels = [2, 3].map((up) => path.resolve(app, ...Array(up).fill('..')))
  const exe =
    levels.flatMap((dir) => names.map((name) => path.join(dir, name))).find(existsSync) ??
    fail(`no executable ${names.join(', ')} near ${app}`)
  const own = JSON.parse(readFileSync(path.join(app, 'package.json'), 'utf8'))
  return {
    exe,
    cliScript: path.join(app, 'out', 'cli.js'),
    name: product.nameLong ?? product.nameShort,
    version:
      product.cursorVersion ?? product.windsurfVersion ?? product.devinVersion ?? own.version,
    vscodeVersion: product.vscodeVersion ?? own.version,
    commit: product.commit,
    // Cursor 3 opens its agent window first. The flag opens the classic editor window.
    launch: /cursor/iu.test(product.nameShort ?? '') ? ['--classic'] : [],
  }
}

/** Runs the CLI of the editor, as its bin script does. */
const cli = (editor, ...rest) =>
  execFileSync(
    editor.exe,
    [editor.cliScript, `--user-data-dir=${userData}`, `--extensions-dir=${extensions}`, ...rest],
    { encoding: 'utf8', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, timeout: 300_000 },
  )

// --- Remote paths ---

const wslPath = (file) =>
  file
    .replace(/^([A-Za-z]):\\/u, (_, drive) => `/mnt/${drive.toLowerCase()}/`)
    .replaceAll('\\', '/')
const remotePath = (file) => (mode === 'wsl' ? wslPath(file) : file)
const authority = (work) =>
  ({
    ssh: `ssh-remote+${args['ssh-host']}`,
    wsl: `wsl+${args['wsl-distro']}`,
    devcontainer: `dev-container+${Buffer.from(work).toString('hex')}`,
  })[mode]
const remoteUri = (work, file) => `vscode-remote://${authority(work)}${remotePath(file)}`

/** Runs a command on the host of Yreview. */
const onHost = (command, ...rest) =>
  mode === 'wsl'
    ? execFileSync('wsl.exe', ['-d', args['wsl-distro'], '--', command, ...rest], {
        encoding: 'utf8',
      })
    : execFileSync(command, rest, { encoding: 'utf8' })

// --- Workspace ---

const IDENTITY = [
  ['user.email', 'reviewer@example.com'],
  ['user.name', 'Reviewer'],
  ['commit.gpgsign', 'false'],
]

const FILLER = Array.from({ length: 60 }, (_, at) => `Filler paragraph ${at}.\n`).join('\n')
const FILES = {
  'src/a.txt': 'one\ntwo\nthree\n',
  'src/notes.md': '# Notes\n\nFirst paragraph.\n\nSecond paragraph.\n',
  'src/review.md': [
    '# Review',
    '',
    'First line of a paragraph.',
    'Second line of the paragraph.',
    'Third line of the paragraph.',
    '',
    '- item one',
    '- item two',
    '',
    '```ts',
    'const a = 1',
    'const b = 2',
    '```',
    '',
    '[notes](notes.md) and [site](https://example.com/)',
    '',
    '<img src="missing.png" onerror="window.yreviewInjected = true">',
    '',
    FILLER,
  ].join('\n'),
}

/** Makes a bare remote, the workspace clone and a second clone on the host of Yreview. */
const prepareWorkspace = () => {
  const base = mode === 'wsl' ? '/tmp/yreview-compat-ws' : path.join(root, 'ws')
  const join = (...parts) => (mode === 'wsl' ? path.posix.join(...parts) : path.join(...parts))
  const [bare, work, second] = ['bare.git', 'work', 'second'].map((name) => join(base, name))
  rmSync(staging, { recursive: true, force: true })
  Object.entries(FILES).forEach(([file, text]) => {
    mkdirSync(path.dirname(path.join(staging, file)), { recursive: true })
    writeFileSync(path.join(staging, file), text)
  })
  if (mode === 'wsl') {
    onHost('rm', '-rf', base)
    onHost('mkdir', '-p', base)
    onHost('cp', '-r', wslPath(staging), work)
  } else {
    rmSync(base, { recursive: true, force: true })
    cpSync(staging, work, { recursive: true })
  }
  const gitIn = (dir, ...rest) => onHost('git', '-C', dir, ...rest)
  onHost('git', 'init', '-q', '--bare', '-b', 'main', bare)
  gitIn(work, 'init', '-q', '-b', 'main')
  IDENTITY.forEach(([key, value]) => gitIn(work, 'config', key, value))
  gitIn(work, 'add', '.')
  gitIn(work, 'commit', '-q', '-m', 'init')
  gitIn(work, 'remote', 'add', 'origin', bare)
  gitIn(work, 'push', '-q', '-u', 'origin', 'main')
  onHost('git', 'clone', '-q', bare, second)
  IDENTITY.forEach(([key, value]) => gitIn(second, 'config', key, value))
  return { work, second }
}

/** A dev container on the docker of the runner. The root keeps its path, so both sides share files. */
const writeDevcontainer = (work) => {
  mkdirSync(path.join(work, '.devcontainer'), { recursive: true })
  writeFileSync(
    path.join(work, '.devcontainer', 'devcontainer.json'),
    `${JSON.stringify(
      {
        name: 'yreview-compat',
        image: 'mcr.microsoft.com/devcontainers/base:bookworm',
        workspaceMount: `source=${root},target=${root},type=bind`,
        workspaceFolder: work,
        runArgs: ['--network=host'],
        shutdownAction: 'none',
        remoteUser: 'vscode',
        updateRemoteUserUID: true,
        postCreateCommand: "git config --global --add safe.directory '*'",
      },
      null,
      2,
    )}\n`,
  )
  writeFileSync(path.join(work, '.git', 'info', 'exclude'), '.devcontainer/\n', { flag: 'a' })
}

const SETTINGS = {
  'window.titleBarStyle': 'custom',
  'window.menuStyle': 'custom',
  'window.dialogStyle': 'custom',
  'window.restoreWindows': 'none',
  'workbench.startupEditor': 'none',
  'workbench.tips.enabled': false,
  'workbench.enableExperiments': false,
  'telemetry.telemetryLevel': 'off',
  'update.mode': 'none',
  'extensions.autoUpdate': false,
  'extensions.autoCheckUpdates': false,
  'extensions.ignoreRecommendations': true,
  'security.workspace.trust.enabled': false,
  'git.openRepositoryInParentFolders': 'never',
  'git.autofetch': false,
  'chat.disableAIFeatures': true,
  'yreview.writeRefspec': false,
  'yreview.autoStartSession': false,
  'remote.SSH.configFile': path.join(process.env.HOME ?? '', '.ssh', 'yreview-ci.config'),
  'remote.SSH.remotePlatform': { [args['ssh-host']]: 'linux' },
  'remote.SSH.showLoginTerminal': false,
  'remote.SSH.useLocalServer': false,
  'remote.SSH.connectTimeout': 120,
  'dev.containers.dockerPath': 'docker',
}

// --- Run ---

const REMOTE_EXTENSIONS = {
  ssh: 'ms-vscode-remote.remote-ssh',
  wsl: 'ms-vscode-remote.remote-wsl',
  devcontainer: 'ms-vscode-remote.remote-containers',
}

const results = path.join(root, 'results.json')
const bridgeRecord = path.join(root, 'bridge.json')
const { version } = JSON.parse(readFileSync('package.json', 'utf8'))

const writeConfig = (files, second) =>
  writeFileSync(
    path.join(bundle, 'config.json'),
    `${JSON.stringify(
      {
        setup,
        files,
        results: remotePath(results),
        userData: remotePath(userData),
        expectedHost: HOSTS[mode],
        second,
        bridgeRecord: remotePath(bridgeRecord),
        version,
      },
      null,
      2,
    )}\n`,
  )

/** Runs the editor with the tests, and gives undefined or the reason why the run failed. */
const runEditor = async (editor, options) => {
  const timer = { id: undefined }
  try {
    await Promise.race([
      runTests({ vscodeExecutablePath: editor.exe, ...options }),
      new Promise((_, reject) => {
        timer.id = setTimeout(
          () => reject(new Error(`the editor did not finish in ${RUN_TIMEOUT_MS / 60_000} min`)),
          RUN_TIMEOUT_MS,
        )
      }),
    ])
    return undefined
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  } finally {
    clearTimeout(timer.id)
  }
}

/** The bridge file still exists on the host of Yreview. */
const bridgeFileExists = (file) => {
  if (mode === 'wsl')
    return spawnSync('wsl.exe', ['-d', args['wsl-distro'], '--', 'test', '-e', file]).status === 0
  if (mode !== 'devcontainer') return existsSync(file)
  const container = execFileSync(
    'docker',
    ['ps', '-q', '--filter', `label=devcontainer.local_folder=${path.join(root, 'ws', 'work')}`],
    { encoding: 'utf8' },
  ).trim()
  return spawnSync('docker', ['exec', container, 'test', '-e', file]).status === 0
}

const BRIDGE_WAIT_S = 120

/** The seconds until the bridge file goes, or undefined when it stays. */
const bridgeGone = async (file, waited = 0) => {
  if (!bridgeFileExists(file)) return waited
  if (waited >= BRIDGE_WAIT_S) return undefined
  await wait(1000)
  return bridgeGone(file, waited + 1)
}

/** The result of each check from the test records of the run. */
const checkResults = async (records, failure) => {
  const bridge = existsSync(bridgeRecord)
    ? JSON.parse(readFileSync(bridgeRecord, 'utf8')).path
    : undefined
  const gone = bridge === undefined ? undefined : await bridgeGone(bridge)
  if (bridge !== undefined) say(`the bridge file went after ${gone ?? 'more than 120'} s`)
  return Promise.all(
    CHECKS.map(async ([check, name]) => {
      if (SKIPPED.has(check)) return { check, name, status: 'not checked yet', reason: '' }
      const file = `check${String(check).padStart(2, '0')}.test.js`
      const own = records.filter((record) => record.file === file)
      const failed = own.find((record) => record.state === 'failed')
      const skipped = own.find((record) => record.state === 'skipped')
      if (failed !== undefined) return { check, name, status: 'failed', reason: failed.error }
      if (skipped !== undefined)
        return {
          check,
          name,
          status: 'not automated',
          reason: /\((?:not automated|skipped): (.*)\)$/u.exec(skipped.title)?.[1] ?? skipped.title,
        }
      if (!own.some((record) => record.state === 'passed'))
        return {
          check,
          name,
          status: 'failed',
          reason: `the test did not run: ${failure ?? 'no record'}`,
        }
      if (check === 11 && gone === undefined)
        return {
          check,
          name,
          status: 'failed',
          reason: `the bridge file stays ${BRIDGE_WAIT_S} s after the window closes`,
        }
      const note = own.map((record) => /\(note: (.*)\)$/u.exec(record.title)?.[1]).find(Boolean)
      return { check, name, status: 'passed', reason: note ?? '' }
    }),
  )
}

/** The CLI installs the VSIX, and the extension from it activates. Local setups only. */
const installCheck = async (editor) => {
  try {
    cli(editor, '--install-extension', path.resolve(args.vsix), '--force')
    const listed = cli(editor, '--list-extensions', '--show-versions')
    if (!listed.includes(`yeskiy.yreview@${version}`))
      return { status: 'failed', reason: `the CLI lists no yeskiy.yreview@${version}: ${listed}` }
    writeConfig(['install.test.js'], '')
    rmSync(results, { force: true })
    const stub = path.join(root, 'stub')
    cpSync(path.resolve('test', 'compat', 'stub'), stub, { recursive: true })
    const failure = await runEditor(editor, {
      extensionDevelopmentPath: stub,
      extensionTestsPath: path.join(bundle, 'index.js'),
      launchArgs: [
        ...editor.launch,
        `--user-data-dir=${userData}`,
        `--extensions-dir=${extensions}`,
        '--remote-debugging-port=0',
      ],
    })
    const record = existsSync(results)
      ? JSON.parse(readFileSync(results, 'utf8')).tests.find(
          (one) => one.file === 'install.test.js',
        )
      : undefined
    if (record?.state === 'passed') return { status: 'passed', reason: '' }
    return { status: 'failed', reason: record?.error ?? failure ?? 'no record' }
  } catch (error) {
    return { status: 'failed', reason: String(error instanceof Error ? error.message : error) }
  } finally {
    // The main run loads the extension from its folder, so the installed copy goes first.
    spawnSync(
      editor.exe,
      [
        editor.cliScript,
        `--user-data-dir=${userData}`,
        `--extensions-dir=${extensions}`,
        '--uninstall-extension',
        'yeskiy.yreview',
      ],
      { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } },
    )
  }
}

const buildBundle = async () => {
  rmSync(path.join(root, 'vsix'), { recursive: true, force: true })
  mkdirSync(path.join(root, 'vsix'), { recursive: true })
  // A VSIX is a zip file. The tar of Windows reads zip files, the GNU tar of Linux does not.
  if (process.platform === 'win32')
    execFileSync('tar', ['-xf', path.resolve(args.vsix), '-C', path.join(root, 'vsix')])
  else execFileSync('unzip', ['-q', path.resolve(args.vsix), '-d', path.join(root, 'vsix')])
  await build({
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'cjs',
    sourcemap: true,
    keepNames: true,
    logLevel: 'warning',
    // Mocha runs in serial, so its parallel worker files stay out of the bundle.
    logOverride: { 'require-resolve-not-external': 'silent' },
    entryPoints: [
      'test/compat/index.ts',
      ...readdirSync('test/compat')
        .filter((file) => file.endsWith('.test.ts'))
        .map((file) => `test/compat/${file}`),
    ],
    outdir: bundle,
    external: ['vscode'],
  })
}

const main = async () => {
  rmSync(root, { recursive: true, force: true })
  mkdirSync(path.join(userData, 'User'), { recursive: true })
  mkdirSync(extensions, { recursive: true })
  writeFileSync(
    path.join(userData, 'User', 'settings.json'),
    `${JSON.stringify(SETTINGS, null, 2)}\n`,
  )
  await buildBundle()
  const editor = editorIn(
    args.install === 'vscode-stable'
      ? path.dirname(await downloadAndUnzipVSCode('stable'))
      : path.resolve(args.install),
  )
  say(`${setup}: ${editor.name} ${editor.version} (VS Code ${editor.vscodeVersion})`)
  const install = mode === 'local' ? await installCheck(editor) : undefined
  if (install !== undefined) say(`install: ${install.status} ${install.reason}`)
  if (mode !== 'local') cli(editor, '--install-extension', REMOTE_EXTENSIONS[mode])
  const { work, second } = prepareWorkspace()
  if (mode === 'devcontainer') writeDevcontainer(work)
  writeConfig(
    readdirSync(bundle).filter((file) => /^check\d+\.test\.js$/u.test(file)),
    second,
  )
  rmSync(results, { force: true })
  const remote = mode !== 'local'
  const failure = await runEditor(editor, {
    extensionDevelopmentPath: remote ? remoteUri(work, extension) : extension,
    extensionTestsPath: remote
      ? remoteUri(work, path.join(bundle, 'index.js'))
      : path.join(bundle, 'index.js'),
    launchArgs: [
      ...editor.launch,
      remote ? `--folder-uri=${remoteUri(work, work)}` : work,
      `--user-data-dir=${userData}`,
      `--extensions-dir=${extensions}`,
      '--remote-debugging-port=0',
    ],
  })
  if (failure !== undefined) say(`the run failed: ${failure}`)
  const run = existsSync(results) ? JSON.parse(readFileSync(results, 'utf8')) : { tests: [] }
  const outcome = {
    setup,
    mode,
    os: process.platform,
    editor: { name: editor.name, version: editor.version, vscodeVersion: editor.vscodeVersion },
    host: run.host,
    date: new Date().toISOString().slice(0, 10),
    install,
    checks: await checkResults(run.tests, failure),
    tests: run.tests,
  }
  mkdirSync(path.resolve(args.out), { recursive: true })
  writeFileSync(
    path.join(path.resolve(args.out), `${setup}.json`),
    `${JSON.stringify(outcome, null, 2)}\n`,
  )
  outcome.checks.forEach((one) => say(`check ${one.check}: ${one.status} ${one.reason}`))
}

await main()
process.exit(0)
