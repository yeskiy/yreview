package com.yeskiy.yreview.session

/**
 * The words the plugin says about one agent.
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
        if (!spec.product) return "${spec.label}. ${spec.hint}"
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

    /**
     * Why the plugin puts no message into a running session of this choice.
     *
     * The answer is a clause, so a caller adds the punctuation it needs. A choice that
     * names no product gets a sentence about the window, because a label of a menu is not
     * the name of a product.
     */
    fun noPush(spec: AgentSpec): String = when {
        !spec.runnable -> "The session window runs nothing"
        !spec.product -> "The plugin puts no message into a command of your own"
        else -> "${spec.label} does not accept a message into a running session"
    }

    /**
     * The name that the Start button and the Stop button carry.
     *
     * A choice that names no product gives the plain word. "Start Another agent" reads as
     * a request for one more agent, and the plus button is the control that does that.
     */
    fun buttonName(spec: AgentSpec): String = if (spec.product) spec.label else "the session"

    /** Why one send went to the clipboard, when the choice of the agent is the reason. */
    fun sendReason(spec: AgentSpec): String =
        if (spec.push == PushKind.NONE) noPush(spec) else "No ${spec.label} session reads this project"

    /**
     * What the settings page says about this machine, under the command field.
     *
     * A choice that names no product carries the hint alone. No search looks for such a
     * choice, so no sentence may report that this machine holds it or misses it.
     */
    fun place(spec: AgentSpec, answer: AgentScan.Answer): String = when {
        !spec.product -> spec.hint
        !answer.scanned -> SEARCHING
        answer.of(spec.id).found -> "This machine holds ${spec.label} at ${answer.of(spec.id).path}."
        else -> "The plugin did not find ${spec.label} on this machine. ${spec.hint}"
    }
}
