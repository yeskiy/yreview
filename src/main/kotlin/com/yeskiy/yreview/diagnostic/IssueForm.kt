package com.yeskiy.yreview.diagnostic

import java.net.URLEncoder
import java.nio.charset.StandardCharsets

/**
 * The address of a prefilled issue form, and the text that goes into it.
 *
 * Every rule here is pure, so a test proves the whole shape without a browser and without
 * an IDE. [Redact] cleans the text, because the message of an exception can name a path or
 * a secret.
 *
 * The caller names the folder of the project. The home rule alone leaves a project of
 * another drive whole, and a public form must carry no absolute project path.
 */
object IssueForm {

    /** The smallest cap a browser is known to hold. A longer address loses its tail. */
    const val MAX_URL = 2000

    /** The lines of one stack that reach the form. The first lines name the defect. */
    const val STACK_LINES = 30

    const val TITLE_LENGTH = 80

    /** The fence of a code block in the Markdown of the issue tracker. */
    private const val FENCE = "```"

    /** The address, and whether the form carries the text already. */
    data class Form(val url: String, val prefilled: Boolean)

    fun title(type: String, message: String, projectPath: String?): String =
        clean(
            if (message.isBlank()) type else "$type: ${message.take(TITLE_LENGTH)}",
            projectPath,
        ).lines().first()

    /**
     * The text of the issue. Every event of the dialog goes in, because the dialog groups
     * related failures into one report.
     */
    fun body(details: String?, stacks: List<String>, machine: String, projectPath: String?): String = clean(
        listOf(
            "### What happened",
            "",
            details?.trim().orEmpty().ifEmpty { "The reporter wrote nothing here." },
            "",
            "### Stack",
            "",
            stacks.joinToString("\n\n") { "$FENCE\n${cut(it)}\n$FENCE" },
            "",
            "### Machine",
            "",
            FENCE,
            machine,
            FENCE,
            "",
            "Paste the diagnostic report here. The report holds the switches and the last records.",
        ).joinToString("\n"),
        projectPath,
    )

    /**
     * The address of the form.
     *
     * A text over the cap gives the plain address instead, and then the caller hands the
     * text to the user in another way.
     */
    fun form(base: String, title: String, body: String): Form {
        val full = "$base?title=${encode(title)}&body=${encode(body)}"
        return if (full.length > MAX_URL) Form(base, false) else Form(full, true)
    }

    private fun cut(stack: String): String = stack.lines().take(STACK_LINES).joinToString("\n")

    private fun clean(value: String, projectPath: String?): String =
        Redact.text(value, Redact.homes(), projectPath)

    private fun encode(value: String): String = URLEncoder.encode(value, StandardCharsets.UTF_8)
}
