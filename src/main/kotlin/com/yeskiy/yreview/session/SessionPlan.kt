package com.yeskiy.yreview.session

import com.yeskiy.yreview.bridge.OpenCodeClient
import com.yeskiy.yreview.bridge.SessionKey

/**
 * Everything the terminal needs to start one review session.
 *
 * No secret of a session travels in a variable or on a command line. The environment
 * carries the path of the bridge file, and the session reads the token from that file. The
 * command line names the password file of an agent that runs a server of its own, and the
 * shell reads the password from that file. The platform writes both the environment and
 * the command line of a terminal into the log of the IDE, and a path there tells a reader
 * nothing that a secret would tell.
 */
data class SessionPlan(
    val command: List<String>,
    val workingDirectory: String,
    val environment: Map<String, String>,
    /** The address of the bridge, for the status text and for the diagnostic report. */
    val bridgeUrl: String,
    val status: String,
    /** True while this session carries the channel. An agent with no channel reads false. */
    val bridgeReady: Boolean
) {

    companion object {

        private const val WITHOUT_CHANNEL =
            "The session starts without the channel. " +
                "The agent can still read the comments through the IDE server."

        private const val NO_RUNTIME =
            "The IDE names no Java runtime, so the plugin cannot start the channel server."

        const val NO_COMMAND = "This agent has no command yet. Name one in Settings, Tools, Yreview."

        /**
         * The channel needs four parts. The agent must carry one, the bridge must answer,
         * the plugin must hold the channel server, and the IDE must name a Java runtime.
         * The plugin appends the flags of the agent only then, and [configFile] holds the
         * configuration file the caller wrote for this session.
         *
         * [sessionKey] is the address of this session on the bridge. The channel server
         * reads it from the environment and sends it back in a header, so the IDE can send
         * a batch to this session alone. The key names a session and guards nothing, so it
         * stays a plain variable.
         *
         * [httpPort] and [passwordFile] belong to an agent that runs an HTTP server of its
         * own. The plugin wrote the password of that server into [passwordFile], and the
         * shell reads it there. The password itself never reaches this function.
         */
        fun of(
            projectPath: String,
            bridge: BridgeLookup,
            agent: AgentSpec = AgentCatalog.of(AgentCatalog.DEFAULT),
            command: String = agent.defaultCommand,
            server: ChannelServer.Answer = ChannelServer.Answer.Unknown,
            javaPath: String? = null,
            configFile: String? = null,
            sessionKey: String? = null,
            httpPort: Int? = null,
            passwordFile: String? = null,
            windows: Boolean = ShellCommand.onWindows(),
        ): SessionPlan {
            val serverPath = (server as? ChannelServer.Answer.Found)?.path
            /** A registration reaches the agent only when all three parts of the server stand. */
            val registered = bridge is BridgeLookup.Available && serverPath != null && javaPath != null
            val ready = agent.push == PushKind.CHANNEL && registered
            return SessionPlan(
                command = ShellCommand.shellCommand(
                    AgentLaunch.arguments(
                        agent,
                        command,
                        configFile.takeIf { registered },
                        javaPath.takeIf { registered },
                        serverPath.takeIf { registered },
                        httpPort,
                    ),
                    passwordFile?.let { SecretVariable(OpenCodeClient.PASSWORD_VARIABLE, it) },
                ),
                workingDirectory = ShellCommand.workingDirectory(projectPath, windows),
                bridgeUrl = (bridge as? BridgeLookup.Available)?.url.orEmpty(),
                environment = bridgeVariables(bridge, sessionKey) +
                    AgentLaunch.variables(agent, configFile.takeIf { registered }),
                status = status(agent, command, bridge, server, javaPath),
                bridgeReady = ready
            )
        }

        /** The path of the bridge file, and the address of this session on the bridge. */
        private fun bridgeVariables(bridge: BridgeLookup, sessionKey: String?): Map<String, String> =
            when (bridge) {
                is BridgeLookup.Available -> buildMap {
                    put(BridgeDiscovery.FILE_VARIABLE, bridge.path)
                    sessionKey?.let { put(SessionKey.VARIABLE, it) }
                }
                is BridgeLookup.Unavailable, BridgeLookup.ChannelOff -> emptyMap()
            }

        /**
         * The agent decides first. An agent that takes no message into a running session
         * never carries a channel, whatever the machine holds, so the text says that and
         * stops there.
         */
        private fun status(
            agent: AgentSpec,
            command: String,
            bridge: BridgeLookup,
            server: ChannelServer.Answer,
            javaPath: String?,
        ): String = when {
            command.isBlank() -> NO_COMMAND
            agent.push == PushKind.NONE ->
                "${AgentRows.noPush(agent)}. Use the Copy button, then paste the prompt in the session."
            else -> channelStatus(bridge, server, javaPath)
        }

        private fun channelStatus(
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
