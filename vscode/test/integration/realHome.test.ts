import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'

interface RealFiles {
  readonly folder: string
  readonly files: readonly string[]
}

const filesUnder = (folder: string): readonly string[] =>
  existsSync(folder)
    ? readdirSync(folder, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => path.join(entry.parentPath, entry.name))
    : []

// A root hook runs after every test of this run, so it sees the files of the whole suite.
after(() => {
  const given = process.env.YREVIEW_REAL_HOME_FILES
  assert.ok(given, 'the test configuration gives no list of the real home files')
  const real = JSON.parse(readFileSync(given, 'utf8')) as RealFiles
  assert.notEqual(path.resolve(homedir()), path.resolve(real.folder, '..'))
  const known = new Set(real.files)
  // Only these paths belong to the extension. An IDE plugin writes its own files beside them.
  const owned = (file: string): boolean =>
    /^(bridge\/vscode\/.+|mcp\/[^/]+-vscode\.json|vscode\/.+)$/.test(
      path.relative(real.folder, file).replaceAll('\\', '/'),
    )
  assert.deepEqual(
    filesUnder(real.folder).filter((file) => !known.has(file) && owned(file)),
    [],
    'a test wrote into the real home folder',
  )
})

describe('the home folder of the test host', () => {
  it('is a temporary folder, not the home folder of the machine', () => {
    assert.match(homedir(), /[/\\]\.vscode-test[/\\]home$/)
  })
})
