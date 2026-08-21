package com.yeskiy.yreview.channel

import io.modelcontextprotocol.kotlin.sdk.shared.Transport
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel

/**
 * Joins the two halves of the server. The bridge carries the comments of the IDE, and the
 * channel carries them to the model. The report of the model travels the other way.
 */
class ChannelApp(
    config: BridgeConfig,
    onError: (Throwable) -> Unit,
    retryDelayMs: Long = BridgeClient.DEFAULT_RETRY_DELAY_MS,
) {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    private val bridge = BridgeClient(
        bridgeUrl = config.bridgeUrl,
        token = config.token,
        onError = onError,
        retryDelayMs = retryDelayMs,
    )

    private val channel = ReviewChannel { ids -> bridge.resolve(ids) }

    suspend fun connect(transport: Transport) {
        channel.connect(transport)
        bridge.start(scope) { batch -> channel.push(batch) }
    }

    suspend fun stop() {
        bridge.stop()
        channel.close()
        scope.cancel()
    }
}
