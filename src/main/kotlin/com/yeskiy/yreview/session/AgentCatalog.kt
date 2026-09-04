package com.yeskiy.yreview.session

/**
 * The choices of the session window.
 *
 * Every value but [NONE] and [CUSTOM] names a command line tool. [CUSTOM] runs a command
 * the user types, and [NONE] runs nothing at all.
 */
enum class AgentId { CLAUDE, OPENCODE, CODEX, ANTIGRAVITY, GEMINI, COPILOT, CURSOR, AIDER, AMP, CUSTOM, NONE }

/**
 * How the plugin puts text into a session while that session runs.
 *
 * [CHANNEL] means a stdio channel server of the plugin, plus the development channel flag
 * of Claude Code. [LOCAL_HTTP] means two calls to an HTTP server that the agent runs.
 * [NONE] means that the user copies the prompt and pastes it.
 */
enum class PushKind { CHANNEL, LOCAL_HTTP, NONE }

/**
 * How the plugin gives one agent a Model Context Protocol server.
 *
 * The first three values run by themselves for one session, and they touch no file the
 * user owns. The next two write a file the user owns, so the plugin asks first and writes
 * only after the user presses Add.
 */
sealed interface McpRoute {

    /** A flag names a file the plugin wrote. [prefix] stands in front of the path. */
    data class Flag(val flag: String, val prefix: String = "") : McpRoute

    /** An environment variable names a file the plugin wrote. */
    data class Variable(val name: String) : McpRoute

    /** Dotted keys on the command line. The plugin writes no file for this route. */
    data object Keys : McpRoute

    /** The agent has a command that writes its own configuration file. */
    data object AddCommand : McpRoute

    /** The agent reads this file and offers no command. The path is inside the project. */
    data class UserFile(val path: String) : McpRoute

    /** The plugin registers nothing, because no route was proved. */
    data object None : McpRoute
}

/**
 * A desktop application of the same brand.
 *
 * The session window runs a terminal, so it can never run a desktop application. This
 * record exists so no message ever tells a user that their product is missing, when only
 * the command line tool is missing.
 */
data class DesktopApp(val label: String, val sharesConfig: Boolean, val note: String)

/**
 * One choice of the session window.
 *
 * [commands] holds the names a search looks for, and the first one is the default command.
 * The record names no working directory, because every agent reads the working directory
 * of its own process.
 */
data class AgentSpec(
    val id: AgentId,
    val label: String,
    /** The name a tab shows. The label is too long for a tab bar of six tabs. */
    val short: String,
    val commands: List<String>,
    val push: PushKind,
    val mcp: McpRoute,
    val hint: String,
    val desktop: DesktopApp? = null,
) {

    /** The command a fresh choice runs. Custom and None answer with an empty text. */
    val defaultCommand: String get() = commands.firstOrNull().orEmpty()

    /** True while the session window can start this choice in a terminal. */
    val runnable: Boolean get() = id != AgentId.NONE
}

/**
 * The choices this release lists.
 *
 * The list is data. Nothing here reads a file or an environment variable. One more agent
 * is one more record, plus a branch in [AgentLaunch] when that agent needs an argument.
 */
object AgentCatalog {

    /** The choice of a user who never chose. It is also the agent the plugin started with. */
    val DEFAULT: AgentId = AgentId.CLAUDE

    val ALL: List<AgentSpec> = listOf(
        AgentSpec(
            AgentId.CLAUDE,
            "Claude Code",
            "Claude",
            listOf("claude"),
            PushKind.CHANNEL,
            McpRoute.Flag(AgentLaunch.CONFIG_FLAG),
            "The official installer writes it to the PATH.",
            DesktopApp(
                "Claude Desktop",
                sharesConfig = false,
                note = "Claude Desktop is a different product with a configuration file of its own, " +
                    "and a terminal cannot run it.",
            ),
        ),
        AgentSpec(
            AgentId.OPENCODE,
            "OpenCode",
            "OpenCode",
            listOf("opencode"),
            PushKind.LOCAL_HTTP,
            McpRoute.Variable("OPENCODE_CONFIG"),
            "It installs through npm, Homebrew, or Scoop.",
        ),
        AgentSpec(
            AgentId.CODEX,
            "OpenAI Codex CLI",
            "Codex",
            listOf("codex"),
            PushKind.NONE,
            McpRoute.Keys,
            "It installs through npm or Homebrew.",
            DesktopApp(
                "the ChatGPT desktop application",
                sharesConfig = true,
                note = "The ChatGPT desktop application reads the same .codex/config.toml file, " +
                    "so a server registered here reaches it too. A terminal cannot run it.",
            ),
        ),
        AgentSpec(
            AgentId.ANTIGRAVITY,
            "Antigravity CLI",
            "Antigravity",
            listOf("agy"),
            PushKind.NONE,
            McpRoute.AddCommand,
            "Google ships it as the follower of Gemini CLI.",
            DesktopApp(
                "the Antigravity editor",
                sharesConfig = true,
                note = "The Antigravity editor reads the same mcp_config.json file, " +
                    "so a server registered here reaches it too. A terminal cannot run it.",
            ),
        ),
        AgentSpec(
            AgentId.GEMINI,
            "Gemini CLI",
            "Gemini",
            listOf("gemini"),
            PushKind.NONE,
            McpRoute.Variable("GEMINI_CLI_SYSTEM_DEFAULTS_PATH"),
            "It installs through npm. Google ended the consumer tiers on 2026-06-18.",
        ),
        AgentSpec(
            AgentId.COPILOT,
            "GitHub Copilot CLI",
            "Copilot",
            listOf("copilot"),
            PushKind.NONE,
            McpRoute.Flag("--additional-mcp-config", "@"),
            "It installs through npm or winget, and it needs a Copilot subscription.",
        ),
        AgentSpec(
            AgentId.CURSOR,
            "Cursor CLI",
            "Cursor",
            listOf("cursor-agent", "agent"),
            PushKind.NONE,
            McpRoute.UserFile(".cursor/mcp.json"),
            "The Cursor installer writes both names to the PATH.",
            DesktopApp(
                "the Cursor editor",
                sharesConfig = true,
                note = "The Cursor editor reads the same mcp.json file, " +
                    "so a server registered here reaches it too. A terminal cannot run it.",
            ),
        ),
        AgentSpec(
            AgentId.AIDER,
            "Aider",
            "Aider",
            listOf("aider"),
            PushKind.NONE,
            McpRoute.None,
            "It installs through pip or pipx. It reads no Model Context Protocol server.",
        ),
        AgentSpec(
            AgentId.AMP,
            "Amp",
            "Amp",
            listOf("amp"),
            PushKind.NONE,
            McpRoute.None,
            "Sourcegraph ships it, and it needs a paid plan.",
            DesktopApp(
                "Amp for macOS",
                sharesConfig = false,
                note = "Amp for macOS is a separate application, and a terminal cannot run it.",
            ),
        ),
        AgentSpec(
            AgentId.CUSTOM,
            "Another agent",
            "Agent",
            emptyList(),
            PushKind.NONE,
            McpRoute.None,
            "Name the command yourself. A shell function works, because a shell runs the command.",
        ),
        AgentSpec(
            AgentId.NONE,
            "No agent",
            "Session",
            emptyList(),
            PushKind.NONE,
            McpRoute.None,
            "The window starts nothing. Copy the tasks and paste them where your agent runs.",
        ),
    )

    private val BY_ID: Map<AgentId, AgentSpec> = ALL.associateBy { it.id }

    fun of(id: AgentId): AgentSpec = BY_ID.getValue(id)

    /**
     * The list a screen shows. The agents the scan found stand first, in the order of
     * [ALL], and No agent always stands last.
     */
    fun ordered(found: Set<AgentId>): List<AgentSpec> {
        val last = of(AgentId.NONE)
        val rest = ALL.filter { it.id != AgentId.NONE }
        return rest.filter { it.id in found } + rest.filter { it.id !in found } + last
    }

    /** Null when nobody chose, and null when this build does not know the stored name. */
    fun parse(raw: String?): AgentId? =
        raw?.trim()?.takeIf { it.isNotEmpty() }?.let { name -> AgentId.entries.firstOrNull { it.name == name } }
}
