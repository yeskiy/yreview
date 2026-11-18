import { existsSync, mkdirSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'

import { defineConfig } from '@vscode/test-cli'

import { plainFolder } from './scripts/plain-folder.mjs'

const scratch = path.resolve('.vscode-test')
const identity = path.join(scratch, 'identity.gitconfig')
mkdirSync(scratch, { recursive: true })
writeFileSync(identity, '[user]\n\tname = Yreview Test\n\temail = reviewer@example.com\n')

// The test host gets a fresh home, so no test writes into the home folder of the machine.
const home = path.join(scratch, 'home')
rmSync(home, { recursive: true, force: true })
mkdirSync(home, { recursive: true })
// On macOS, VS Code waits on a dialog when the home has no login keychain, so link the real one.
if (process.platform === 'darwin') {
  mkdirSync(path.join(home, 'Library'))
  symlinkSync(path.join(homedir(), 'Library', 'Keychains'), path.join(home, 'Library', 'Keychains'))
}

const filesUnder = (folder) =>
  existsSync(folder)
    ? readdirSync(folder, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => path.join(entry.parentPath, entry.name))
    : []
const realReview = path.join(homedir(), '.y-review')
const realFiles = path.join(scratch, 'real-home-files.json')
writeFileSync(realFiles, JSON.stringify({ folder: realReview, files: filesUnder(realReview) }))

// The keymap test installs the real keymap into a fresh profile of its own on each run.
// An allowed publisher skips the publisher trust dialog, which a test host refuses.
const keymapExtensions = path.join(scratch, 'keymap-extensions')
const keymapUser = path.join(scratch, 'keymap-user-data', 'User')
rmSync(keymapExtensions, { recursive: true, force: true })
rmSync(path.dirname(keymapUser), { recursive: true, force: true })
mkdirSync(keymapUser, { recursive: true })
writeFileSync(
  path.join(keymapUser, 'settings.json'),
  '{ "extensions.allowed": { "*": true, "k--kato": true } }\n',
)

// The Mermaid test installs a Mermaid extension on hosts without the built-in one, into a profile of its own.
const mermaidExtensions = path.join(scratch, 'mermaid-extensions')
const mermaidUser = path.join(scratch, 'mermaid-user-data', 'User')
const mermaidWorkspace = path.join(scratch, 'mermaid-workspace')
rmSync(mermaidExtensions, { recursive: true, force: true })
rmSync(path.dirname(mermaidUser), { recursive: true, force: true })
rmSync(mermaidWorkspace, { recursive: true, force: true })
mkdirSync(mermaidUser, { recursive: true })
mkdirSync(mermaidWorkspace, { recursive: true })
writeFileSync(
  path.join(mermaidUser, 'settings.json'),
  '{ "extensions.allowed": { "*": true, "bierner": true } }\n',
)
writeFileSync(
  path.join(mermaidWorkspace, 'flow.md'),
  '# Flow\n\n```mermaid\ngraph TD\n  A-->B\n```\n',
)

// On VS Code 1.101 a DevTools port leaves the window without focus for the repository tests.
const webviewUser = path.join(scratch, 'webview-user-data')
rmSync(webviewUser, { recursive: true, force: true })
// On macOS the default menu style is native, and a native context menu is not in the page of the window.
mkdirSync(path.join(webviewUser, 'User'), { recursive: true })
writeFileSync(path.join(webviewUser, 'User', 'settings.json'), '{ "window.menuStyle": "custom" }\n')

// An empty window restores no folder only when its profile has no window from an earlier run.
const looseUser = path.join(scratch, 'loose-user-data')
rmSync(looseUser, { recursive: true, force: true })

const common = {
  version: process.env.VSCODE_TEST_VERSION ?? 'stable',
  launchArgs: ['--disable-workspace-trust'],
  env: {
    GIT_CONFIG_GLOBAL: identity,
    USERPROFILE: home,
    HOME: home,
    YREVIEW_REAL_HOME_FILES: realFiles,
  },
  mocha: { ui: 'bdd', timeout: 60000 },
}

export default defineConfig([
  {
    ...common,
    label: 'repository',
    files: 'out/test/integration/*.test.js',
    workspaceFolder: '.vscode-test/workspace',
  },
  {
    ...common,
    label: 'plain',
    files: ['out/test/integration/plain/*.test.js', 'out/test/integration/realHome.test.js'],
    workspaceFolder: plainFolder(),
  },
  {
    // An empty window: no workspace folder, so each file is a loose file.
    ...common,
    label: 'loose',
    files: 'out/test/integration/loose/*.test.js',
    launchArgs: [...common.launchArgs, `--user-data-dir=${looseUser}`],
  },
  {
    // A keymap takes keys of other tests, so it installs into a profile of its own.
    ...common,
    label: 'keymap',
    files: 'out/test/integration/keymap/*.test.js',
    workspaceFolder: plainFolder(),
    // A DevTools port lets the test press real keys. Port 0 picks a free port.
    env: { ...common.env, YREVIEW_USER_DATA: path.dirname(keymapUser) },
    launchArgs: [
      ...common.launchArgs,
      `--extensions-dir=${keymapExtensions}`,
      `--user-data-dir=${path.dirname(keymapUser)}`,
      '--remote-debugging-port=0',
    ],
  },
  {
    // Real input in a webview needs a DevTools port, so these tests use a profile of their own.
    ...common,
    label: 'webview',
    files: 'out/test/integration/webview/*.test.js',
    workspaceFolder: '.vscode-test/workspace',
    env: { ...common.env, YREVIEW_USER_DATA: webviewUser },
    launchArgs: [
      ...common.launchArgs,
      `--user-data-dir=${webviewUser}`,
      '--remote-debugging-port=0',
    ],
  },
  {
    // The Mermaid test reads the drawing in the page through a DevTools port.
    ...common,
    label: 'mermaid',
    files: 'out/test/integration/mermaid/*.test.js',
    workspaceFolder: mermaidWorkspace,
    env: { ...common.env, YREVIEW_USER_DATA: path.dirname(mermaidUser) },
    launchArgs: [
      ...common.launchArgs,
      `--extensions-dir=${mermaidExtensions}`,
      `--user-data-dir=${path.dirname(mermaidUser)}`,
      '--remote-debugging-port=0',
    ],
  },
])
