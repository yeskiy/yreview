import { existsSync, globSync } from 'node:fs'

import { build } from 'esbuild'

const production = process.argv.includes('--production')
const common = {
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  sourcemap: !production,
  minify: production,
  logLevel: 'info',
  mainFields: ['module', 'main'],
}

await Promise.all([
  build({
    ...common,
    entryPoints: ['src/extension.ts'],
    outfile: 'dist/extension.js',
    external: ['vscode'],
  }),
  // TODO: remove the check once task 5.2 adds src/channel/main.ts.
  ...(existsSync('src/channel/main.ts')
    ? [build({ ...common, entryPoints: ['src/channel/main.ts'], outfile: 'dist/channel.js' })]
    : []),
  ...(process.argv.includes('--tests')
    ? [
        build({
          ...common,
          entryPoints: globSync('test/integration/**/*.test.ts'),
          outdir: 'out/test/integration',
          outbase: 'test/integration',
          external: ['vscode', 'mocha'],
          sourcemap: true,
          minify: false,
        }),
      ]
    : []),
])
