import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'

import { BridgeClient, DEFAULT_RETRY_DELAY_MS } from './bridgeClient'
import type { BridgeConfig } from './config'
import { ReviewChannel } from './reviewChannel'
import { reviewTools } from './reviewTools'

/** The bridge carries the comments in, the channel carries them to the model, and reports go back. */
export class ChannelApp {
  private readonly bridge: BridgeClient

  private readonly channel: ReviewChannel

  private stopping: Promise<void> | undefined

  constructor(
    config: BridgeConfig,
    onError: (error: Error) => void,
    retryDelayMs = DEFAULT_RETRY_DELAY_MS,
  ) {
    this.bridge = new BridgeClient({
      bridgeUrl: config.bridgeUrl,
      token: config.token,
      sessionKey: config.sessionKey,
      onError,
      retryDelayMs,
      onLost: (reason) => this.channel.notice(reason),
    })
    this.channel = new ReviewChannel((ids) => this.bridge.resolve(ids), reviewTools(this.bridge))
  }

  async connect(transport: Transport): Promise<void> {
    await this.channel.connect(transport)
    this.bridge.start((batch) => this.channel.push(batch))
  }

  /** The close of the channel closes the transport, which calls stop again, so one stop runs. */
  stop(): Promise<void> {
    this.stopping ??= Promise.resolve().then(async () => {
      this.bridge.stop()
      await this.channel.close()
    })
    return this.stopping
  }
}
