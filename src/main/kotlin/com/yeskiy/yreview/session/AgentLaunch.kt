package com.yeskiy.yreview.session

/**
 * Builds the argument list of one review session.
 *
 * The base command comes from the settings, because every machine holds its agents in its
 * own place. The plugin owns the arguments it appends. [AgentMcp] builds the registration
 * of the review server, and this object adds the flags that belong to one agent alone.
 * Only Claude Code carries the channel flag, and only OpenCode carries a port.
 *
 * No agent needs a folder argument. Every agent reads the working directory of its own
 * process, and the terminal sets that directory.
 */
object AgentLaunch {

    /** The channel event carries the server name, so this name reaches the model. */
    const val SERVER_NAME = "y-review"

    const val CONFIG_FLAG = "--mcp-config"

    /** Channels are a research preview, so a server outside the Anthropic list needs this flag. */
    const val CHANNEL_FLAG = "--dangerously-load-development-channels"

    const val CHANNEL_VALUE = "server:$SERVER_NAME"

    /** OpenCode binds a socket only when both of these flags appear in its arguments. */
    const val HOST_FLAG = "--hostname"

    const val PORT_FLAG = "--port"

    const val LOOPBACK = "127.0.0.1"

    const val NO_ARGUMENTS = "The plugin appends no argument for this agent."

    /**
     * The command, then the registration of the review server, then the flags of the agent
     * itself. Without a configuration file a session of Claude Code starts plain, and it
     * carries no channel. The plugin must name the port of OpenCode, because OpenCode
     * prints none and writes no file that names a running instance.
     */
    fun arguments(
        agent: AgentSpec,
        command: String,
        configFile: String? = null,
        javaPath: String? = null,
        serverPath: String? = null,
        port: Int? = null,
    ): List<String> {
        val own = when {
            agent.id == AgentId.CLAUDE && configFile != null -> listOf(CHANNEL_FLAG, CHANNEL_VALUE)
            agent.id == AgentId.OPENCODE && port != null -> listOf(HOST_FLAG, LOOPBACK, PORT_FLAG, port.toString())
            else -> emptyList()
        }
        return listOf(command) + AgentMcp.arguments(agent, javaPath, serverPath, configFile) + own
    }

    /** The variables of the registration. The bridge variables come from [SessionPlan]. */
    fun variables(agent: AgentSpec, configFile: String?): Map<String, String> =
        AgentMcp.variables(agent, configFile)

    /**
     * The real strings for the settings page, so a user reads what the plugin really uses.
     *
     * A stored route appends nothing at a session start. It shows the command that a press
     * on Add runs, or the document that a press on Add writes. The page passes the paths
     * of this machine, and a placeholder stands where a path is not known yet.
     */
    fun appendedText(
        id: AgentId,
        javaPath: String = JAVA_PLACE,
        serverPath: String = SERVER_PLACE,
    ): String {
        val agent = AgentCatalog.of(id)
        AgentMcp.addCommand(agent, javaPath, serverPath)?.let { return it.joinToString(" ") }
        AgentMcp.userFile(agent, javaPath, serverPath)?.let { return it }
        val channel = if (id == AgentId.CLAUDE) listOf(CHANNEL_FLAG, CHANNEL_VALUE) else emptyList()
        return (AgentMcp.arguments(agent, javaPath, serverPath, FILE_PLACE) + channel)
            .joinToString(" ")
            .ifEmpty { NO_ARGUMENTS }
    }

    /** What the settings page prints where a real path is not known yet. */
    const val JAVA_PLACE = "<the java of the IDE>"

    const val SERVER_PLACE = "<the server of the plugin>"

    const val FILE_PLACE = "<the configuration file of the agent>"
}
