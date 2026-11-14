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
])
