import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
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
    // A keymap takes keys of other tests, so it installs into a profile of its own.
    ...common,
    label: 'keymap',
    files: 'out/test/integration/keymap/*.test.js',
    workspaceFolder: plainFolder(),
    launchArgs: [
      ...common.launchArgs,
      `--extensions-dir=${keymapExtensions}`,
      `--user-data-dir=${path.dirname(keymapUser)}`,
    ],
  },
])
