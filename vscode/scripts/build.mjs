import { globSync } from 'node:fs'

import { build } from 'esbuild'

const production = process.argv.includes('--production')
const common = {
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  sourcemap: !production,
  minify: production,
  keepNames: true,
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
  build({ ...common, entryPoints: ['src/channel/main.ts'], outfile: 'dist/channel.js' }),
  build({
    ...common,
    platform: 'browser',
    target: 'es2022',
    format: 'iife',
    entryPoints: ['src/preview/previewSelection.ts'],
    outfile: 'dist/previewSelection.js',
  }),
  build({
    ...common,
    platform: 'browser',
    target: 'es2022',
    format: 'iife',
    entryPoints: ['src/reviewPreview/webview/index.ts'],
    outfile: 'dist/reviewPreview.js',
  }),
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
