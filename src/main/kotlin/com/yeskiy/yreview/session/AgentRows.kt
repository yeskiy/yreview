package com.yeskiy.yreview.session

/**
 * The words of the agent selector.
 *
 * The text lives away from the panel, so a test reads every sentence with no window on
 * screen. No sentence ever says that an agent is not installed. A wrapper that is a shell
 * function has no file, so no scan can find it, and the user can still run it.
 */
object AgentRows {

    const val CHOOSE = "Choose the command line agent for this project."

    const val SEARCHING = "The plugin is looking for the installed agents."

    const val NOTHING_FOUND =
        "The plugin found no command line agent on this machine. " +
            "Open Settings, Tools, Yreview to name a command of your own, or to choose No agent."

    const val OTHER_AGENTS = "Another agent, a command of your own, or No agent, in Settings, Tools, Yreview."

    const val UNKNOWN_CHOICE =
        "This version does not know the agent that was chosen before, so please choose again."

    /** What the window shows after the user chose No agent. It never asks again. */
    const val NO_AGENT =
        "No agent runs in this window. Use the Copy button, and paste the tasks where your agent runs."

    /**
     * One line of the selector. It always says whether Send reaches this agent.
     *
     * A choice that names no command is not a tool, so no search looks for it and the row
     * carries the hint alone.
     */
    fun row(spec: AgentSpec, found: Boolean): String {
        if (spec.commands.isEmpty()) return "${spec.label}. ${spec.hint}"
        val place = if (found) "found on this machine" else "not found on this machine"
        val send = when (spec.push) {
            PushKind.CHANNEL, PushKind.LOCAL_HTTP -> "Send and Copy both work."
            PushKind.NONE -> "Copy only, because it takes no message into a running session."
        }
        return listOfNotNull("${spec.label}, $place.", send, if (found) null else spec.desktop?.note)
            .joinToString(" ")
    }

    /**
     * The rows the panel shows. The agents the scan found come first, then Another agent
     * and No agent. An unfinished search shows none, and the panel waits.
     *
     * The panel never lists every agent it knows. A status text draws one row for each
     * line and it does not scroll, so a short window would cut the list. The settings page
     * holds the full list.
     */
    fun offered(answer: AgentScan.Answer): List<AgentSpec> {
        if (!answer.scanned) return emptyList()
        return AgentCatalog.ALL.filter { answer.of(it.id).found } +
            AgentCatalog.of(AgentId.CUSTOM) +
            AgentCatalog.of(AgentId.NONE)
    }
}
