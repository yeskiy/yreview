package com.yeskiy.yreview.session

/**
 * Everything the terminal needs to start one review session. The bridge token travels in
 * the environment only. A command line is readable by every process on the machine.
 */
data class SessionPlan(
    val command: List<String>,
    val workingDirectory: String,
    val environment: Map<String, String>,
    val status: String,
    val bridgeReady: Boolean
) {

    companion object {

        private const val WITHOUT_CHANNEL =
            "The session starts without the channel. " +
                "The agent can still read the comments through the IDE server."

        /**
         * The channel needs both halves. The bridge must answer, and the settings must name
         * the channel server. The plugin appends the two flags only then, and [configFile]
         * holds the configuration file the caller wrote for this session.
         */
        fun of(
            projectPath: String,
            bridge: BridgeLookup,
            command: String = ClaudeCommand.DEFAULT_COMMAND,
            server: ChannelServer.Answer = ChannelServer.Answer.NotSet,
            configFile: String? = null,
        ): SessionPlan {
            val ready = bridge is BridgeLookup.Available && server is ChannelServer.Answer.Found
            return SessionPlan(
                command = ClaudeCommand.shellCommand(command, configFile.takeIf { ready }),
                workingDirectory = ClaudeCommand.windowsPath(projectPath),
                environment = when (bridge) {
                    is BridgeLookup.Available -> mapOf(
                        BridgeDiscovery.URL_VARIABLE to bridge.url,
                        BridgeDiscovery.TOKEN_VARIABLE to bridge.token
                    )
                    is BridgeLookup.Unavailable, BridgeLookup.ChannelOff -> emptyMap()
                },
                status = status(bridge, server),
                bridgeReady = bridge is BridgeLookup.Available
            )
        }

        /**
         * The bridge decides first. A session without a bridge carries no channel whatever
         * the settings name, so the text names the bridge and stops there.
         */
        private fun status(bridge: BridgeLookup, server: ChannelServer.Answer): String = when (bridge) {
            is BridgeLookup.Unavailable ->
                "The review bridge is not available yet. ${bridge.reason} $WITHOUT_CHANNEL"
            BridgeLookup.ChannelOff ->
                "The review channel is off in the settings. $WITHOUT_CHANNEL"
            is BridgeLookup.Available -> when (server) {
                is ChannelServer.Answer.Found -> "The review bridge is ready at ${bridge.url}."
                ChannelServer.Answer.NotSet ->
                    "No channel server is set in the settings. $WITHOUT_CHANNEL"
                is ChannelServer.Answer.Missing ->
                    "The channel server of the settings is not a file: ${server.path}. $WITHOUT_CHANNEL"
            }
        }
    }
}
