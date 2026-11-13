import { defineConfig } from '@vscode/test-cli'

export default defineConfig({
  files: 'out/test/integration/**/*.test.js',
  version: process.env.VSCODE_TEST_VERSION ?? 'stable',
  workspaceFolder: '.vscode-test/workspace',
  launchArgs: ['--disable-workspace-trust'],
  mocha: { ui: 'bdd', timeout: 60000 },
})
