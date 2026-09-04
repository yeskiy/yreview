package com.yeskiy.yreview.session

/**
 * The name that a terminal window title carries.
 *
 * An agent writes its window title for a person to read, so that title holds status text
 * beside the name. Every agent writes its own shape, therefore every agent gets a reader
 * of its own. A shape that this build does not know answers nothing, and the tab then
 * keeps the name it already has.
 *
 * Antigravity CLI writes a title too, and the shape of that text is not proved yet. It
 * therefore answers nothing here, because a guess would put status text on a tab.
 */
object AgentTitle {

    /** The characters that Claude Code writes in front of the name. */
    const val CLAUDE_SPINNERS = "\u2733\u25D0\u25D1"

    /** Every title of Claude Code that names no session. */
    val CLAUDE_PLAIN: List<String> =
        listOf("claude", "claude \u00B7 resume", "claude daemon", "Claude Code")

    /** The last part of every title of GitHub Copilot CLI. */
    const val COPILOT_TAIL = "GitHub Copilot"

    /** The title of Cursor CLI while the chat carries no name. */
    const val CURSOR_PLAIN = "Cursor Agent"

    /** What stands between two parts of a title of Copilot CLI and of Cursor CLI. */
    const val PART = " - "

    /** The longest title that can still be a name. A longer one is a status line. */
    const val LONGEST = 80

    /** What Swing draws as markup. A tab shows the text of a title, and never markup. */
    const val MARKUP = "<html"

    /** Null while the title of this agent carries no name. */
    fun of(agent: AgentSpec, raw: String?): String? {
        val text = raw.orEmpty().replace(WHITESPACE, " ").trim()
        if (text.isEmpty() || text.length > LONGEST) return null
        if (text.startsWith(MARKUP, ignoreCase = true)) return null
        return when (agent.id) {
            AgentId.CLAUDE -> claude(text)
            AgentId.COPILOT -> copilot(text)
            AgentId.CURSOR -> cursor(text)
            else -> null
        }
    }

    /** Claude Code writes one spinner character, a space, and the name. */
    private fun claude(text: String): String? {
        val name = text.trimStart { it in CLAUDE_SPINNERS }.trim()
        if (name.isEmpty()) return null
        if (CLAUDE_PLAIN.any { name.equals(it, ignoreCase = true) }) return null
        return name
    }

    /**
     * Copilot CLI ends every title with the name of the product. The part in front of that
     * holds the intent of the moment, and the name stands before the intent.
     *
     * A title of two parts holds the name or the intent, and nothing tells them apart, so
     * such a title names nothing.
     */
    private fun copilot(text: String): String? {
        val body = text.removeSuffix(PART + COPILOT_TAIL)
        if (body == text) return null
        val parts = body.split(PART)
        return parts.dropLast(1).joinToString(PART).trim().takeIf { it.isNotEmpty() }
    }

    /**
     * Cursor CLI writes the name first, then the status of the moment. Every form can carry
     * the worktree in parentheses at the end.
     *
     * The default title names no session, with that group or without it. The reader drops
     * the group for the comparison alone, and it never cuts a name.
     */
    private fun cursor(text: String): String? {
        val head = text.substringBefore(PART).trim()
        if (head.isEmpty()) return null
        if (plain(head) || plain(head.replace(TRAILING_GROUP, ""))) return null
        return head
    }

    private fun plain(text: String): Boolean = text.trim().equals(CURSOR_PLAIN, ignoreCase = true)

    private val WHITESPACE = Regex("\\s+")

    /** One group in parentheses at the end. Cursor CLI writes the worktree there. */
    private val TRAILING_GROUP = Regex("\\s*\\([^()]*\\)$")
}
