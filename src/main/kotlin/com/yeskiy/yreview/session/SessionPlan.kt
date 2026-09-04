package com.yeskiy.yreview.session

import com.yeskiy.yreview.bridge.SessionKey

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

        private const val NO_RUNTIME =
            "The IDE names no Java runtime, so the plugin cannot start the channel server."

        /**
         * The channel needs three parts. The bridge must answer, the plugin must hold the
         * channel server, and the IDE must name a Java runtime. The plugin appends the two
         * flags only then, and [configFile] holds the configuration file the caller wrote
         * for this session.
         *
         * [sessionKey] is the address of this session on the bridge. The channel server
         * reads it from the environment and sends it back in a header, so the IDE can send
         * a batch to this session alone.
         */
        fun of(
            projectPath: String,
            bridge: BridgeLookup,
            command: String = AgentCatalog.of(AgentCatalog.DEFAULT).defaultCommand,
            server: ChannelServer.Answer = ChannelServer.Answer.Unknown,
            javaPath: String? = null,
            configFile: String? = null,
            sessionKey: String? = null,
        ): SessionPlan {
            val ready = bridge is BridgeLookup.Available &&
                server is ChannelServer.Answer.Found &&
                javaPath != null
            return SessionPlan(
                command = ShellCommand.shellCommand(
                    AgentLaunch.arguments(
                        AgentCatalog.of(AgentCatalog.DEFAULT),
                        command,
                        configFile.takeIf { ready },
                    )
                ),
                workingDirectory = ShellCommand.windowsPath(projectPath),
                environment = when (bridge) {
                    is BridgeLookup.Available -> mapOf(
                        BridgeDiscovery.URL_VARIABLE to bridge.url,
                        BridgeDiscovery.TOKEN_VARIABLE to bridge.token
                    ) + sessionKey?.let { mapOf(SessionKey.VARIABLE to it) }.orEmpty()
                    is BridgeLookup.Unavailable, BridgeLookup.ChannelOff -> emptyMap()
                },
                status = status(bridge, server, javaPath),
                bridgeReady = bridge is BridgeLookup.Available
            )
        }

        /**
         * The bridge decides first. A session without a bridge carries no channel whatever
         * the machine holds, so the text names the bridge and stops there.
         */
        private fun status(
            bridge: BridgeLookup,
            server: ChannelServer.Answer,
            javaPath: String?,
        ): String = when (bridge) {
            is BridgeLookup.Unavailable ->
                "The review bridge is not available yet. ${bridge.reason} $WITHOUT_CHANNEL"
            BridgeLookup.ChannelOff ->
                "The review channel is off in the settings. $WITHOUT_CHANNEL"
            is BridgeLookup.Available -> when (server) {
                is ChannelServer.Answer.Found ->
                    if (javaPath != null) {
                        "The review bridge is ready at ${bridge.url}."
                    } else {
                        "$NO_RUNTIME $WITHOUT_CHANNEL"
                    }
                ChannelServer.Answer.Unknown ->
                    "The folder of the plugin is not known, so no channel server was found. $WITHOUT_CHANNEL"
                is ChannelServer.Answer.Missing ->
                    "The plugin holds no channel server at ${server.path}. $WITHOUT_CHANNEL"
            }
        }
    }
}
