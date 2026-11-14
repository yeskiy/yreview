import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { defineConfig } from '@vscode/test-cli'

import { plainFolder } from './scripts/plain-folder.mjs'

const identity = path.resolve('.vscode-test', 'identity.gitconfig')
mkdirSync(path.dirname(identity), { recursive: true })
writeFileSync(identity, '[user]\n\tname = Yreview Test\n\temail = reviewer@example.com\n')

const common = {
  version: process.env.VSCODE_TEST_VERSION ?? 'stable',
  launchArgs: ['--disable-workspace-trust'],
  env: { GIT_CONFIG_GLOBAL: identity },
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
    files: 'out/test/integration/plain/*.test.js',
    workspaceFolder: plainFolder(),
  },
])
