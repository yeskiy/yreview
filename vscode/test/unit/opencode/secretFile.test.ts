import { strict as assert } from 'node:assert'
import { existsSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import path from 'node:path'

import { deleteSecret, secretFilePath, writeSecret } from '../../../src/session/secretFile'
import { newSessionKey } from '../../../src/session/sessionKey'
import { scratchDir } from '../../fixtures/scratch'

const VALUE = '3f8a1c07d95b2e46'

describe('secret file (SecretFileTest.kt)', () => {
  const held = { home: '' }
  const folder = (): string => path.join(held.home, '.y-review', 'secret')
  beforeEach(() => {
    held.home = scratchDir()
  })
  afterEach(() => rmSync(held.home, { recursive: true, force: true }))

  it('the shell finds the value that Yreview wrote', async () => {
    const file = secretFilePath(newSessionKey(), held.home)
    await writeSecret(file, VALUE)
    assert.equal(readFileSync(file, 'utf8'), VALUE)
  })

  it('the file stands under the folder of Yreview in the user profile', () =>
    assert.equal(secretFilePath('a1b2c3d4', held.home), path.join(folder(), 'a1b2c3d4.txt')))

  it('a key that names a parent folder still names a file inside the folder', async () => {
    const file = secretFilePath('../../x', held.home)
    await writeSecret(file, VALUE)
    assert.equal(path.dirname(file), folder())
    assert.equal(path.basename(file), '------x.txt')
    assert.equal(readFileSync(file, 'utf8'), VALUE)
  })

  it('a delete takes the value off the disk', async () => {
    const file = secretFilePath('a1b2c3d4', held.home)
    await writeSecret(file, VALUE)
    await deleteSecret(file)
    assert.equal(existsSync(file), false)
  })

  it('a delete of a file that is already gone is quiet', () =>
    deleteSecret(secretFilePath('a1b2c3d4', held.home)))

  it('a new value replaces the old one', async () => {
    const file = secretFilePath('a1b2c3d4', held.home)
    await writeSecret(file, VALUE)
    await writeSecret(file, '0000111122223333')
    assert.equal(readFileSync(file, 'utf8'), '0000111122223333')
  })

  it('no other user of the machine can read the file', async function onlyPosix() {
    if (process.platform === 'win32') this.skip()
    const file = secretFilePath('a1b2c3d4', held.home)
    await writeSecret(file, VALUE)
    assert.equal(statSync(file).mode % 0o1000, 0o600)
  })

  it('the folder holds one file for each session', async () => {
    await writeSecret(secretFilePath('aaaa1111', held.home), VALUE)
    await writeSecret(secretFilePath('bbbb2222', held.home), VALUE)
    assert.equal(readdirSync(folder()).length, 2)
  })
})
