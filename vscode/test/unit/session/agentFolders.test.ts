import assert from 'node:assert/strict'

import {
  type Places,
  type Platform,
  agentFolders,
  platformOf,
} from '../../../src/session/agentFolders'

const windowsPlaces: Places = {
  home: 'C:\\Users\\dev',
  appData: 'C:\\Users\\dev\\AppData\\Roaming',
  localAppData: 'C:\\Users\\dev\\AppData\\Local',
  programData: 'C:\\ProgramData',
  dataHome: undefined,
}

const unix: Places = {
  home: '/home/dev',
  appData: undefined,
  localAppData: undefined,
  programData: undefined,
  dataHome: undefined,
}

const empty: Places = {
  home: undefined,
  appData: undefined,
  localAppData: undefined,
  programData: undefined,
  dataHome: undefined,
}

const PLATFORMS: readonly Platform[] = ['windows', 'mac', 'linux']

const texts = (platform: Platform, places: Places): readonly string[] =>
  agentFolders(platform, places).map((folder) => folder.replaceAll('\\', '/'))

const holds = (folders: readonly string[], ...wanted: string[]): void =>
  wanted.forEach((folder) => assert.ok(folders.includes(folder), `${folder} in ${folders}`))

describe('agent folders', () => {
  it('the operating system name decides the platform', () => {
    assert.equal(platformOf('Windows 11'), 'windows')
    assert.equal(platformOf('Mac OS X'), 'mac')
    assert.equal(platformOf('Linux'), 'linux')
    assert.equal(platformOf(''), 'linux')
  })

  it('the node platform names decide the platform too', () => {
    assert.equal(platformOf('win32'), 'windows')
    assert.equal(platformOf('darwin'), 'mac')
    assert.equal(platformOf('linux'), 'linux')
  })

  it('windows holds the two shim folders that this machine really uses', () => {
    holds(
      texts('windows', windowsPlaces),
      'C:/Users/dev/AppData/Local/Volta/bin',
      'C:/Users/dev/scoop/shims',
      'C:/ProgramData/chocolatey/bin',
      'C:/Users/dev/AppData/Local/agy/bin',
      'C:/Users/dev/AppData/Roaming/npm',
      'C:/Users/dev/.local/bin',
    )
  })

  it('mac holds both homebrew folders', () => {
    holds(texts('mac', unix), '/opt/homebrew/bin', '/usr/local/bin', '/home/dev/.local/bin')
  })

  it('linux holds the snap and the flatpak wrappers', () => {
    holds(
      texts('linux', unix),
      '/snap/bin',
      '/var/lib/flatpak/exports/bin',
      '/home/dev/.local/share/flatpak/exports/bin',
      '/home/dev/.local/share/pnpm',
    )
  })

  it('a named data home replaces the default one on linux', () => {
    const folders = texts('linux', { ...unix, dataHome: '/home/dev/share' })
    holds(folders, '/home/dev/share/pnpm')
    assert.ok(!folders.includes('/home/dev/.local/share/pnpm'), `${folders}`)
  })

  it('an empty data home leaves the default pnpm folder standing', () => {
    const folders = texts('linux', { ...unix, dataHome: '' })
    holds(folders, '/home/dev/.local/share/pnpm')
    assert.ok(!folders.includes('pnpm'), `${folders}`)
  })

  it('an empty variable names no folder at all', () => {
    PLATFORMS.forEach((platform) =>
      assert.deepEqual(
        agentFolders(platform, {
          home: '',
          appData: '',
          localAppData: '',
          programData: '',
          dataHome: '',
        }),
        agentFolders(platform, empty),
        `${platform} reads an empty variable and a missing one differently`,
      ),
    )
  })

  it('a machine that names no variable gives no broken path', () => {
    assert.deepEqual(agentFolders('windows', empty), [])
    assert.deepEqual(texts('linux', empty), [
      '/usr/local/bin',
      '/home/linuxbrew/.linuxbrew/bin',
      '/snap/bin',
      '/var/lib/flatpak/exports/bin',
    ])
    assert.deepEqual(texts('mac', empty), ['/opt/homebrew/bin', '/usr/local/bin'])
  })

  it('no folder appears twice', () => {
    PLATFORMS.forEach((platform) => {
      const folders = texts(platform, platform === 'windows' ? windowsPlaces : unix)
      assert.equal(new Set(folders).size, folders.length, `${platform} holds a folder twice`)
    })
  })
})
