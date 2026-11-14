import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import type { RootHookObject } from 'mocha'

const dir = mkdtempSync(path.join(tmpdir(), 'yreview-identity-'))
const saved = process.env.GIT_CONFIG_GLOBAL

/** Gives git a known identity, so a folder outside every repository does not use the machine identity. */
export const mochaHooks: RootHookObject = {
  beforeAll() {
    const file = path.join(dir, 'global.gitconfig')
    writeFileSync(file, '[user]\n\tname = Yreview Test\n\temail = reviewer@example.com\n')
    process.env.GIT_CONFIG_GLOBAL = file
  },
  afterAll() {
    if (saved === undefined) delete process.env.GIT_CONFIG_GLOBAL
    else process.env.GIT_CONFIG_GLOBAL = saved
    rmSync(dir, { recursive: true, force: true })
  },
}
