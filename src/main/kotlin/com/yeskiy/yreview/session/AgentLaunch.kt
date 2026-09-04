package com.yeskiy.yreview.session

/**
 * Builds the argument list of one review session.
 *
 * The base command comes from the settings, because every machine holds its agents in its
 * own place. The plugin owns the arguments it appends, and only Claude Code takes any
 * today. One flag declares the channel server, and the other flag registers that server
 * for the session. An entry in a configuration file alone never registers a channel.
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

    const val NO_ARGUMENTS = "The plugin appends no argument for this agent."

    /** The flags of a Claude Code session that carries the channel. */
    fun claudeFlags(configFile: String): List<String> =
        listOf(CONFIG_FLAG, configFile, CHANNEL_FLAG, CHANNEL_VALUE)

    /**
     * Without a configuration file the session starts plain, and it carries no channel.
     * An agent with no channel takes no argument from the plugin at all.
     */
    fun arguments(agent: AgentSpec, command: String, configFile: String? = null): List<String> =
        when (agent.id) {
            AgentId.CLAUDE -> listOf(command) + configFile?.let { claudeFlags(it) }.orEmpty()
            else -> listOf(command)
        }

    /** The real strings for the settings page, so a user reads what the session runs. */
    fun appendedText(id: AgentId): String = when (id) {
        AgentId.CLAUDE -> "$CONFIG_FLAG <the configuration file of the session>\n$CHANNEL_FLAG $CHANNEL_VALUE"
        else -> NO_ARGUMENTS
    }
}
