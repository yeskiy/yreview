import assert from 'node:assert/strict'

import {
  FALLBACK_SHELL,
  NO_SECRET,
  type SecretVariable,
  loginShell,
  shellCommand,
  shellLine,
  windowsPath,
  workingDirectory,
} from '../../../src/session/shellCommand'

const project = 'E:/work/demo-repo'
const config = 'C:\\Users\\dev\\AppData\\Local\\Temp\\y-review-mcp-1.json'
const secretPath = 'C:/Users/dev/.y-review/secret/a1b2.txt'
const secret: SecretVariable = { name: 'OPENCODE_SERVER_PASSWORD', path: secretPath }

describe('shell command', () => {
  it('a windows path keeps its drive letter and loses its backslashes', () => {
    assert.equal(windowsPath('E:\\work\\demo-repo'), project)
  })

  it('a wsl path becomes a windows path', () => {
    assert.equal(windowsPath('/mnt/e/work/demo-repo'), project)
  })

  it('a trailing separator is dropped', () => {
    assert.equal(windowsPath('E:/work/demo-repo/'), project)
  })

  it('a drive root keeps its separator', () => {
    assert.equal(windowsPath('E:\\'), 'E:/')
  })

  it('windows converts the working directory of a session', () => {
    assert.equal(workingDirectory('/mnt/e/work/demo-repo', true), project)
  })

  it('another system keeps the working directory as it stands', () => {
    assert.equal(workingDirectory('/mnt/e/work/demo-repo', false), '/mnt/e/work/demo-repo')
    assert.equal(workingDirectory('/home/dev/a\\b', false), '/home/dev/a\\b')
  })

  it('windows runs powershell with the profile of the user', () => {
    assert.deepEqual(shellCommand(['claude'], undefined, true), [
      'powershell.exe',
      '-NoLogo',
      '-Command',
      "& 'claude'",
    ])
  })

  it('another system runs a login shell', () => {
    assert.deepEqual(shellCommand(['opencode'], undefined, false, '/bin/zsh'), [
      '/bin/zsh',
      '-l',
      '-c',
      "'opencode'",
    ])
  })

  it('the windows line quotes every part of the command', () => {
    assert.equal(
      shellLine(
        [
          'claude',
          '--mcp-config',
          config,
          '--dangerously-load-development-channels',
          'server:y-review',
        ],
        undefined,
        true,
      ),
      `& 'claude' '--mcp-config' '${config}' ` +
        "'--dangerously-load-development-channels' 'server:y-review'",
    )
  })

  it('the posix line quotes every part of the command', () => {
    assert.equal(
      shellLine(['opencode', '--port', '52431'], undefined, false),
      "'opencode' '--port' '52431'",
    )
  })

  it('a single quote inside an argument stays inside the literal', () => {
    assert.equal(shellLine(["it's"], undefined, true), "& 'it''s'")
    assert.equal(shellLine(["it's"], undefined, false), "'it'\\''s'")
  })

  it('a path with a space reaches the agent whole', () => {
    const line = shellLine(['C:/Program Files/x/claude.exe'], undefined, true)
    assert.ok(line.includes("'C:/Program Files/x/claude.exe'"), line)
  })

  it('no wrapper outlives the agent', () => {
    assert.ok(!shellCommand(['claude'], undefined, true).includes('-NoExit'))
    assert.ok(!shellCommand(['claude'], undefined, false, '/bin/sh').includes('-i'))
  })

  it('powershell keeps the profile of the user', () => {
    assert.ok(!shellCommand(['claude'], undefined, true).includes('-NoProfile'))
  })

  it('the windows line reads the password from the file and removes that file', () => {
    assert.equal(
      shellLine(['opencode', '--port', '52431'], secret, true),
      `$env:OPENCODE_SERVER_PASSWORD = (Get-Content -LiteralPath '${secretPath}'); ` +
        `Remove-Item -LiteralPath '${secretPath}' -Force; ` +
        'if ([string]::IsNullOrEmpty($env:OPENCODE_SERVER_PASSWORD)) ' +
        `{ Write-Error '${NO_SECRET}'; exit 1 }; ` +
        "& 'opencode' '--port' '52431'",
    )
  })

  it('the posix line reads the password from the file and removes that file', () => {
    assert.equal(
      shellLine(['opencode', '--port', '52431'], secret, false),
      `OPENCODE_SERVER_PASSWORD="$(cat '${secretPath}' && rm -f '${secretPath}')"; ` +
        'if [ -z "$OPENCODE_SERVER_PASSWORD" ]; ' +
        `then echo '${NO_SECRET}' >&2; exit 1; fi; ` +
        'export OPENCODE_SERVER_PASSWORD; ' +
        "'opencode' '--port' '52431'",
    )
  })

  it('the windows line stops before the agent when the file gives nothing', () => {
    const line = shellLine(['opencode'], secret, true)
    assert.ok(line.includes('if ([string]::IsNullOrEmpty($env:OPENCODE_SERVER_PASSWORD))'), line)
    assert.ok(line.indexOf('exit 1') < line.indexOf("& 'opencode'"), line)
  })

  it('the posix line stops before the agent when the file gives nothing', () => {
    const line = shellLine(['opencode'], secret, false)
    assert.ok(line.includes('if [ -z "$OPENCODE_SERVER_PASSWORD" ]'), line)
    assert.ok(line.indexOf('exit 1') < line.indexOf("'opencode'"), line)
  })

  it('the wrapper of both systems carries the read of the password', () => {
    assert.ok(
      shellCommand(['opencode'], secret, true)
        .at(-1)
        ?.startsWith('$env:OPENCODE_SERVER_PASSWORD = (Get-Content'),
    )
    assert.ok(
      shellCommand(['opencode'], secret, false, '/bin/sh')
        .at(-1)
        ?.startsWith('OPENCODE_SERVER_PASSWORD="$(cat'),
    )
  })

  it('a line without a password keeps the shape it always had', () => {
    assert.equal(shellLine(['opencode'], undefined, true), "& 'opencode'")
    assert.equal(shellLine(['opencode'], undefined, false), "'opencode'")
  })

  it('a single quote in the path of the password stays inside the literal', () => {
    const quoted: SecretVariable = { name: 'P', path: "/home/o'brien/p.txt" }
    assert.ok(
      shellLine(['opencode'], quoted, true).startsWith(
        "$env:P = (Get-Content -LiteralPath '/home/o''brien/p.txt'); ",
      ),
    )
    assert.ok(
      shellLine(['opencode'], quoted, false).startsWith(
        "P=\"$(cat '/home/o'\\''brien/p.txt' && rm -f '/home/o'\\''brien/p.txt')\"; ",
      ),
    )
  })

  it('the fallback shell answers when the environment names none', () => {
    assert.equal(FALLBACK_SHELL, '/bin/sh')
    assert.notEqual(loginShell().trim(), '')
    assert.equal(loginShell({}), FALLBACK_SHELL)
    assert.equal(loginShell({ SHELL: '  ' }), FALLBACK_SHELL)
  })
})
