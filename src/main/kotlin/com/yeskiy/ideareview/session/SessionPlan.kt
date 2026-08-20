package com.yeskiy.ideareview.session

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

        fun of(projectPath: String, bridge: BridgeLookup): SessionPlan {
            val path = ClaudeCommand.windowsPath(projectPath)
            return SessionPlan(
                command = ClaudeCommand.shellCommand(path),
                workingDirectory = path,
                environment = when (bridge) {
                    is BridgeLookup.Available -> mapOf(
                        BridgeDiscovery.URL_VARIABLE to bridge.url,
                        BridgeDiscovery.TOKEN_VARIABLE to bridge.token
                    )
                    is BridgeLookup.Unavailable -> emptyMap()
                },
                status = when (bridge) {
                    is BridgeLookup.Available -> "The review bridge is ready at ${bridge.url}."
                    is BridgeLookup.Unavailable ->
                        "The review bridge is not available yet. ${bridge.reason} " +
                            "The session starts without the comment channel. " +
                            "The agent can still read the comments through the IDE server."
                },
                bridgeReady = bridge is BridgeLookup.Available
            )
        }
    }
}
