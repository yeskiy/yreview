package com.yeskiy.yreview.session

/**
 * How one agent gets the review server of the plugin.
 *
 * A per session route runs by itself. The plugin writes a file of its own, one for each
 * agent, and touches nothing the user owns. That file stays after the session ends,
 * because the agent keeps the path and starts a later job with it. A stored route needs a
 * file the agent owns, so the plugin shows the exact command or the exact document, and it
 * writes only after the user presses Add.
 *
 * The plugin never registers a server it cannot make work. An agent with no proved route
 * gets nothing, and the file protocol carries the whole loop for that agent.
 */
object AgentMcp {

    private const val KEY = "mcp_servers.${AgentLaunch.SERVER_NAME}"

    private const val KEY_FLAG = "-c"

    private const val FILES =
        "Every send writes AGENT.md and tasks.json in the review folder. " +
            "The agent appends a finished identifier to done.txt, and the IDE closes the task. " +
            "That route needs no server at all."

    /** True while a session of this agent needs a configuration file that the plugin writes. */
    fun needsFile(spec: AgentSpec): Boolean = when (spec.mcp) {
        is McpRoute.Flag, is McpRoute.Variable -> true
        McpRoute.Keys, McpRoute.AddCommand, is McpRoute.UserFile, McpRoute.None -> false
    }

    /**
     * The arguments the plugin appends for a per session route, and nothing for any other.
     *
     * A null [javaPath] or a null [serverPath] means that the plugin holds no server to
     * register, so the dotted keys stay out of the command line.
     */
    fun arguments(
        spec: AgentSpec,
        javaPath: String?,
        serverPath: String?,
        configFile: String?,
    ): List<String> = when (val route = spec.mcp) {
        is McpRoute.Flag -> configFile?.let { listOf(route.flag, route.prefix + it) }.orEmpty()
        McpRoute.Keys ->
            if (javaPath == null || serverPath == null) emptyList() else keys(javaPath, serverPath)
        is McpRoute.Variable, McpRoute.AddCommand, is McpRoute.UserFile, McpRoute.None -> emptyList()
    }

    /** The variables the plugin sets for a per session route, and nothing for any other. */
    fun variables(spec: AgentSpec, configFile: String?): Map<String, String> =
        when (val route = spec.mcp) {
            is McpRoute.Variable -> configFile?.let { mapOf(route.name to it) }.orEmpty()
            is McpRoute.Flag, McpRoute.Keys, McpRoute.AddCommand, is McpRoute.UserFile, McpRoute.None -> emptyMap()
        }

    /**
     * The command that registers the server, for a route that asks first. Null for any other.
     *
     * [program] is the launcher of the agent. The plugin starts it with no shell, so the
     * caller passes the answer of [program] and never a name that only a shell resolves.
     */
    fun addCommand(
        spec: AgentSpec,
        javaPath: String,
        serverPath: String,
        program: String = spec.defaultCommand,
    ): List<String>? =
        if (spec.mcp != McpRoute.AddCommand) {
            null
        } else {
            listOf(program, "mcp", "add", AgentLaunch.SERVER_NAME, "--") + server(javaPath, serverPath)
        }

    /**
     * The launcher that a press on Add starts.
     *
     * The command of the settings page comes first, because that page promises that a full
     * path in the command field works. The path of the search comes next, because an IDE
     * that starts from a desktop launcher can hold a shorter PATH than the terminal of the
     * user, and a bare name then starts nothing.
     *
     * [typed] holds the bare name of the agent while the user typed no command of their
     * own. That name says nothing about this machine, so the found path wins over it.
     * [found] is null when the search found no file.
     */
    fun program(spec: AgentSpec, typed: String, found: String?): String {
        val text = typed.trim()
        if (text.isNotEmpty() && text != spec.defaultCommand) return text
        return found ?: spec.defaultCommand
    }

    /** The document the plugin writes, for a route that asks first. Null for any other. */
    fun userFile(spec: AgentSpec, javaPath: String, serverPath: String): String? =
        if (spec.mcp !is McpRoute.UserFile) null else ChannelConfig.text(spec.id, javaPath, serverPath)

    /** One paragraph for the settings page. It says exactly what this agent gets. */
    fun help(spec: AgentSpec): String = when (val route = spec.mcp) {
        is McpRoute.Flag, is McpRoute.Variable, McpRoute.Keys ->
            "The plugin registers its review server for this agent on every session. " +
                "It writes nothing that you own, and it asks nothing."
        McpRoute.AddCommand ->
            "This agent keeps its servers in a file of its own. " +
                "Press Add, and the plugin runs the command above once. $FILES"
        is McpRoute.UserFile ->
            "This agent keeps its servers in ${route.path} inside the project. " +
                "Press Add, and the plugin writes the document above. $FILES"
        McpRoute.None ->
            "The plugin registers no server for this agent, because no route was proved. $FILES"
    }

    /** The launcher of the Java runtime, then the jar of the server, then the main class. */
    private fun server(javaPath: String, serverPath: String): List<String> =
        listOf(javaPath, ChannelServer.CLASS_PATH_FLAG, serverPath, ChannelServer.MAIN_CLASS)

    /**
     * The two dotted keys of Codex. Codex reads each value as TOML, and a multi-line
     * literal string keeps every backslash raw. The form also holds an apostrophe, so a
     * Windows path reaches Codex unchanged. The shell wrapper passes a single quote through.
     */
    private fun keys(javaPath: String, serverPath: String): List<String> = listOf(
        KEY_FLAG,
        "$KEY.command=${toml(javaPath)}",
        KEY_FLAG,
        "$KEY.args=[" +
            listOf(ChannelServer.CLASS_PATH_FLAG, serverPath, ChannelServer.MAIN_CLASS)
                .joinToString(",") { toml(it) } + "]",
    )

    private fun toml(value: String): String = "'''$value'''"
}
