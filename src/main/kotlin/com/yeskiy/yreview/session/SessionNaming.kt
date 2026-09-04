package com.yeskiy.yreview.session

/**
 * The words of the rename, and the cleaning of what the user typed.
 *
 * The text lives away from the action, so a test reads every sentence with no window on
 * screen. An agent that names its own sessions gets no rename here. The sentence then names
 * the command that the user types in the session instead.
 */
object SessionNaming {

    const val ACTION_TEXT = "Rename Session"

    const val TITLE = "Rename Review Session"

    const val PROMPT = "Name of this session:"

    const val HINT = "Give this tab a name of your own. An empty name brings the built name back."

    /** The longest name the plugin keeps. A longer answer is cut to this length. */
    const val MAX_NAME = 60

    /** Null while the user may rename a tab of this agent, or the reason why not. */
    fun blocked(spec: AgentSpec?): String? = (spec?.naming as? Naming.Agent)?.let {
        "${spec.label} names its own sessions. Type ${it.command} in the session to name it."
    }

    /**
     * The name a tab keeps, from the answer of the user. Null means that the tab drops the
     * name of the user and shows the built name again.
     */
    fun clean(raw: String?): String? = raw
        ?.replace(WHITESPACE, " ")
        ?.trim()
        ?.take(MAX_NAME)
        ?.takeIf { it.isNotEmpty() }

    private val WHITESPACE = Regex("\\s+")
}
