import path from 'node:path'

import { includeIgnoreFile } from '@eslint/compat'
import js from '@eslint/js'
import { defineConfig } from 'eslint/config'
import { configs, helpers, plugins } from 'eslint-config-airbnb-extended'
import { rules as prettierConfigRules } from 'eslint-config-prettier'
import prettierPlugin from 'eslint-plugin-prettier'

export default defineConfig([
  includeIgnoreFile(path.resolve('.', '.gitignore')),
  { name: 'js/config', ...js.configs.recommended },
  plugins.stylistic,
  plugins.importX,
  ...configs.base.recommended,
  plugins.node,
  ...configs.node.recommended,
  plugins.typescriptEslint,
  ...configs.base.typescript,
  {
    name: 'ts/import-settings',
    files: ['**/*.ts'],
    settings: helpers.getImportSettings({ javascript: false, typescript: true, jsx: false }),
  },
  { name: 'prettier/plugin/config', plugins: { prettier: prettierPlugin } },
  { name: 'prettier/config', rules: { ...prettierConfigRules, 'prettier/prettier': 'error' } },
  {
    name: 'project/style',
    rules: {
      'import-x/prefer-default-export': 'off',
      'import-x/no-default-export': 'off',
      'prefer-const': 'error',
      'no-restricted-syntax': [
        'error',
        { selector: 'VariableDeclaration[kind="let"]', message: 'Use const.' },
        { selector: 'ForStatement', message: 'Use an array method.' },
        { selector: 'ForInStatement', message: 'Use an array method.' },
        { selector: 'ForOfStatement', message: 'Use an array method.' },
        {
          selector: "CallExpression[callee.object.name='log'] Identifier[name=/[Tt]oken/]",
          message: 'A log line never holds a token.',
        },
      ],
    },
  },
  {
    // The editor gives the module vscode at run time, and no package holds it.
    name: 'project/vscode-module',
    rules: {
      'import-x/no-unresolved': ['error', { ignore: ['^vscode$'] }],
      'import-x/no-extraneous-dependencies': [
        'error',
        {
          devDependencies: false,
          optionalDependencies: false,
          peerDependencies: true,
          bundledDependencies: true,
          whitelist: ['vscode'],
        },
      ],
    },
  },
  {
    name: 'scripts/config',
    files: ['scripts/**/*.mjs', '*.mjs'],
    rules: {
      'no-console': 'off',
      'n/no-process-exit': 'off',
      // A one-shot CLI script blocks nobody. The rule also needs type information that .mjs files lack.
      'n/no-sync': 'off',
      // Node ESM resolves a relative import only with its file extension.
      'import-x/extensions': ['error', 'always', { ignorePackages: true }],
      'import-x/no-extraneous-dependencies': ['error', { devDependencies: true }],
      // The scripts run on the Node.js 24 of the build machine and of CI.
      'n/no-unsupported-features/node-builtins': ['error', { version: '>=24.0.0' }],
    },
  },
  {
    name: 'tests/config',
    files: ['test/**/*.ts'],
    rules: { 'import-x/no-extraneous-dependencies': 'off', 'n/no-sync': 'off' },
  },
])
