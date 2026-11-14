import { format } from 'node:util'

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

import { ChannelApp } from './app'
import { ConfigError, FILE_VARIABLE, parseConfig } from './config'
import { SERVER_NAME } from './reviewChannel'

const BAD_CONFIG_EXIT = 2

const log = (message: string): void => {
  process.stderr.write(`${SERVER_NAME}: ${message}\n`)
}

// The agent reads the protocol on standard output, so one stray line there ends the session.
Object.assign(console, {
  log: (...parts: unknown[]): void => {
    process.stderr.write(`${format(...parts)}\n`)
  },
})

/** The process ends by itself when standard input closes, because stop ends every socket. */
const run = async (): Promise<void> => {
  const config = await parseConfig(process.env)
  const app = new ChannelApp(config, (error) => log(error.message))
  const transport = new StdioServerTransport()
  const stop = (): void => {
    app
      .stop()
      .catch((failure: unknown) =>
        log(failure instanceof Error ? failure.message : String(failure)),
      )
  }
  transport.onclose = stop
  process.stdin.on('end', stop)
  await app.connect(transport).catch(async (failure: unknown) => {
    await app.stop()
    throw failure
  })
  log(`ready, bridge on ${config.bridgeUrl}`)
}

run().catch((failure: unknown) => {
  if (failure instanceof ConfigError) {
    log(failure.message)
    log(`set ${FILE_VARIABLE}, then start the server again`)
    process.exitCode = BAD_CONFIG_EXIT
  } else {
    log(failure instanceof Error ? failure.message : String(failure))
    process.exitCode = 1
  }
  process.stdin.destroy()
})
