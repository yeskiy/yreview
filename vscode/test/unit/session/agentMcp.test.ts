import { strict as assert } from 'node:assert'

import {
  CHANNEL_FLAG,
  CHANNEL_VALUE,
  NO_ARGUMENTS,
  RUNTIME_PLACE,
  SERVER_PLACE,
  addCommand,
  appendedText,
  launchArguments,
  mcpArguments,
  mcpHelp,
  mcpVariables,
  needsFile,
  programFor,
  userFileText,
} from '../../../src/session/agentMcp'
import { AGENTS, type AgentId, agentOf } from '../../../src/session/catalog'
import { SERVER_NAME, channelLaunch, launcherLaunch } from '../../../src/session/channelConfig'

const EXEC = 'C:\\Program Files\\Microsoft VS Code\\Code.exe'
const SCRIPT = 'C:\\Users\\one\\.vscode\\extensions\\yeskiy.y-review\\dist\\channel.js'
const FILE = 'C:\\Users\\one\\.y-review\\mcp\\claude-vscode.json'
const FOUND = 'C:\\Users\\dev\\AppData\\Local\\Programs\\agy\\agy.exe'
const launch = channelLaunch(SCRIPT, EXEC)
const STORED: readonly AgentId[] = ['antigravity', 'cursor', 'aider', 'amp', 'custom', 'none']
const key = (name: string, value: string): string => `mcp_servers.y-review.${name}=${value}`

describe('agent mcp (AgentMcpTest.kt)', () => {
  it('claude code names the file on the command line', () => {
    assert.equal(needsFile(agentOf('claude')), true)
    assert.deepEqual(mcpArguments(agentOf('claude'), launch, FILE), ['--mcp-config', FILE])
    assert.deepEqual(mcpVariables(agentOf('claude'), FILE), {})
  })

  it('copilot puts an at sign in front of the file', () =>
    assert.deepEqual(mcpArguments(agentOf('copilot'), launch, FILE), [
      '--additional-mcp-config',
      `@${FILE}`,
    ]))

  it('opencode and gemini name the file in a variable', () => {
    assert.equal(needsFile(agentOf('opencode')), true)
    assert.deepEqual(mcpVariables(agentOf('opencode'), FILE), { OPENCODE_CONFIG: FILE })
    assert.deepEqual(mcpArguments(agentOf('opencode'), launch, FILE), [])
    assert.deepEqual(mcpVariables(agentOf('gemini'), FILE), {
      GEMINI_CLI_SYSTEM_DEFAULTS_PATH: FILE,
    })
  })

  it('codex needs no file and carries three dotted keys', () => {
    assert.equal(needsFile(agentOf('codex')), false)
    assert.deepEqual(mcpArguments(agentOf('codex'), launch, undefined), [
      '-c',
      key('command', `'''${EXEC}'''`),
      '-c',
      key('args', `['''${SCRIPT}''']`),
      '-c',
      key('env.ELECTRON_RUN_AS_NODE', "'''1'''"),
    ])
  })

  it('codex must accept a windows path that keeps every backslash raw', () => {
    const values = mcpArguments(agentOf('codex'), launch, undefined).filter((one) => one !== '-c')
    assert.equal(values.length, 3)
    values.slice(0, 2).forEach((one) => {
      assert.equal(one.includes('\\'), true, one)
      assert.equal(one.includes('\\\\'), false, one)
    })
    assert.equal(values[0]?.includes(EXEC), true)
    assert.equal(values[1]?.includes(SCRIPT), true)
  })

  it('codex must accept a path that holds an apostrophe', () => {
    const owner = "C:\\Users\\O'Brien\\Code\\Code.exe"
    assert.equal(
      mcpArguments(agentOf('codex'), channelLaunch(SCRIPT, owner), undefined)[1],
      key('command', `'''${owner}'''`),
    )
  })

  it('codex must accept a posix path', () =>
    assert.deepEqual(
      mcpArguments(
        agentOf('codex'),
        channelLaunch('/home/one/.vscode/extensions/y/dist/channel.js', '/usr/share/code/code'),
        undefined,
      ).slice(0, 4),
      [
        '-c',
        key('command', "'''/usr/share/code/code'''"),
        '-c',
        key('args', "['''/home/one/.vscode/extensions/y/dist/channel.js''']"),
      ],
    ))

  it('codex gets no key while Yreview holds no server', () =>
    assert.deepEqual(mcpArguments(agentOf('codex'), undefined, undefined), []))

  it('no session argument reaches an agent with a stored route', () =>
    STORED.forEach((id) => {
      assert.deepEqual(mcpArguments(agentOf(id), launch, FILE), [], id)
      assert.deepEqual(mcpVariables(agentOf(id), FILE), {}, id)
      assert.equal(needsFile(agentOf(id)), false, id)
    }))

  it('antigravity gets one command that the user approves', () =>
    assert.deepEqual(addCommand(agentOf('antigravity'), launch, 'agy'), [
      'agy',
      'mcp',
      'add',
      'y-review',
      '--',
      EXEC,
      SCRIPT,
    ]))

  it('the add command runs the path that the search found', () =>
    assert.deepEqual(
      addCommand(
        agentOf('antigravity'),
        launch,
        programFor(agentOf('antigravity'), 'agy', '/opt/homebrew/bin/agy'),
      ),
      ['/opt/homebrew/bin/agy', 'mcp', 'add', 'y-review', '--', EXEC, SCRIPT],
    ))

  it('the add command of windows starts the launcher through cmd', () =>
    assert.deepEqual(
      addCommand(agentOf('antigravity'), launcherLaunch('C:\\l.cmd', true, 'cmd.exe'), 'agy'),
      ['agy', 'mcp', 'add', 'y-review', '--', 'cmd.exe', '/d', '/c', 'C:\\l.cmd'],
    ))

  it('a command that the user typed wins over the path of the search', () =>
    assert.equal(
      programFor(agentOf('antigravity'), ' /home/me/bin/agy ', '/opt/homebrew/bin/agy'),
      '/home/me/bin/agy',
    ))

  it('the bare name stands while the search found nothing', () => {
    assert.equal(programFor(agentOf('antigravity'), 'agy', undefined), 'agy')
    assert.equal(programFor(agentOf('antigravity'), '  ', undefined), 'agy')
  })

  it('only antigravity has an add command', () =>
    AGENTS.filter((agent) => agent.id !== 'antigravity').forEach((agent) =>
      assert.equal(addCommand(agent, launch, 'x'), undefined, agent.id),
    ))

  it('cursor gets a file that the user approves', () => {
    const text = userFileText(agentOf('cursor'), launch) ?? ''
    const entry = (JSON.parse(text) as { mcpServers: { 'y-review': Record<string, unknown> } })
      .mcpServers[SERVER_NAME]
    assert.equal(entry.command, EXEC)
    assert.deepEqual(entry.args, [SCRIPT])
  })

  it('only cursor has a user file', () =>
    AGENTS.filter((agent) => agent.id !== 'cursor').forEach((agent) =>
      assert.equal(userFileText(agent, launch), undefined, agent.id),
    ))

  it('the help of a per session route says that nothing is asked', () => {
    const text = mcpHelp(agentOf('opencode'))
    assert.equal(text.includes('every session'), true, text)
    assert.equal(text.includes('Add'), false, text)
  })

  it('the help of a stored route says that Yreview asks first', () => {
    assert.equal(mcpHelp(agentOf('antigravity')).includes('Add'), true)
    assert.equal(mcpHelp(agentOf('cursor')).includes('Add'), true)
  })

  it('the help of an agent with no route names the file route', () => {
    const text = mcpHelp(agentOf('aider'))
    assert.equal(text.includes('done.txt'), true, text)
    assert.equal(text.includes('tasks.json'), true, text)
  })

  it('no help text ever prints a port', () =>
    AGENTS.forEach((agent) => assert.equal(/\d{4,5}/.test(mcpHelp(agent)), false, agent.label)))
})

describe('agent launch (AgentLaunchTest.kt)', () => {
  const claude = agentOf('claude')
  const opencode = agentOf('opencode')

  it('without a configuration file the session runs the command alone', () =>
    assert.deepEqual(launchArguments(claude, 'claude', {}), ['claude']))

  it('claude code gets the two flags of the channel', () =>
    assert.deepEqual(launchArguments(claude, 'claude', { configFile: FILE }), [
      'claude',
      '--mcp-config',
      FILE,
      '--dangerously-load-development-channels',
      'server:y-review',
    ]))

  it('an agent that reads a variable gets no flag at all', () =>
    assert.deepEqual(launchArguments(opencode, 'opencode', { configFile: FILE }), ['opencode']))

  it('opencode binds the loopback port that Yreview gave it', () =>
    assert.deepEqual(launchArguments(opencode, 'opencode', { configFile: FILE, port: 47821 }), [
      'opencode',
      '--hostname',
      '127.0.0.1',
      '--port',
      '47821',
    ]))

  it('only claude code takes the channel flag', () =>
    AGENTS.filter((agent) => agent.id !== 'claude').forEach((agent) =>
      assert.equal(
        launchArguments(agent, 'run-it', { configFile: FILE, launch }).includes(CHANNEL_FLAG),
        false,
        agent.id,
      ),
    ))

  it('an agent with a stored route or no route takes the command alone', () =>
    STORED.forEach((id) =>
      assert.deepEqual(
        launchArguments(agentOf(id), 'run-it', { configFile: FILE, launch }),
        ['run-it'],
        id,
      ),
    ))

  it('codex carries the three dotted keys of its registration', () => {
    const values = launchArguments(agentOf('codex'), 'codex', { configFile: FILE, launch })
    assert.equal(values[0], 'codex')
    assert.equal(values.filter((one) => one === '-c').length, 3)
    assert.equal(
      values.some((one) => one.startsWith('mcp_servers.y-review.command=')),
      true,
    )
    assert.equal(
      values.some((one) => one.startsWith('mcp_servers.y-review.args=')),
      true,
    )
    assert.equal(
      values.some((one) => one.startsWith('mcp_servers.y-review.env.')),
      true,
    )
  })

  it('an agent reads the registration file through its own variable', () => {
    assert.deepEqual(mcpVariables(opencode, FILE), { OPENCODE_CONFIG: FILE })
    assert.deepEqual(mcpVariables(claude, FILE), {})
    assert.deepEqual(mcpVariables(opencode, undefined), {})
  })

  it('the channel value names the server of Yreview', () => {
    assert.equal(SERVER_NAME, 'y-review')
    assert.equal(CHANNEL_VALUE, 'server:y-review')
    assert.deepEqual(claude.mcp, { kind: 'flag', flag: '--mcp-config', prefix: '' })
    assert.equal(CHANNEL_FLAG, '--dangerously-load-development-channels')
  })

  it('the arguments never name a bridge variable', () =>
    assert.equal(
      launchArguments(claude, 'claude', { configFile: FILE }).join(' ').includes('Y_REVIEW_BRIDGE'),
      false,
    ))

  it('the settings page prints the real flags for claude code', () => {
    const text = appendedText(claude)
    assert.equal(text.includes('--mcp-config'), true, text)
    assert.equal(
      text.includes('--dangerously-load-development-channels server:y-review'),
      true,
      text,
    )
  })

  it('the settings page prints the real keys for codex', () => {
    const text = appendedText(agentOf('codex'))
    assert.equal(text.includes('mcp_servers.y-review.command='), true, text)
    assert.equal(text.includes('mcp_servers.y-review.args='), true, text)
    assert.equal(text.includes("mcp_servers.y-review.env.ELECTRON_RUN_AS_NODE='''1'''"), true)
  })

  it('the settings page says that an agent with a variable gets no argument', () => {
    assert.equal(appendedText(opencode), 'Yreview appends no argument for this agent.')
    assert.equal(appendedText(agentOf('none')), NO_ARGUMENTS)
  })

  it('the settings page prints the command that a press on add runs', () =>
    assert.equal(
      appendedText(agentOf('antigravity'), undefined, launch),
      `agy mcp add y-review -- ${EXEC} ${SCRIPT}`,
    ))

  it('the settings page prints the document that a press on add writes', () => {
    const text = appendedText(agentOf('cursor'), undefined, launch)
    assert.equal(text.includes('mcpServers'), true, text)
    assert.equal(text.includes('channel.js'), true, text)
  })

  it('the settings page prints the launcher that a press on add really starts', () =>
    assert.equal(
      appendedText(agentOf('antigravity'), programFor(agentOf('antigravity'), '', FOUND), launch),
      `${FOUND} mcp add y-review -- ${EXEC} ${SCRIPT}`,
    ))

  it('the settings page prints the whole command that a press on add runs', () => {
    const agent = agentOf('antigravity')
    const stored = launcherLaunch('C:\\l.cmd', true, 'cmd.exe')
    const program = programFor(agent, '', FOUND)
    assert.equal(
      appendedText(agent, program, stored),
      (addCommand(agent, stored, program) ?? []).join(' '),
    )
  })

  it('the settings page names a placeholder while a path is unknown', () => {
    const text = appendedText(agentOf('antigravity'))
    assert.equal(text.includes(RUNTIME_PLACE), true, text)
    assert.equal(text.includes(SERVER_PLACE), true, text)
  })
})
