import { defineConfig } from '@vscode/test-cli'

import { plainFolder } from './scripts/plain-folder.mjs'

const common = {
  version: process.env.VSCODE_TEST_VERSION ?? 'stable',
  launchArgs: ['--disable-workspace-trust'],
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
