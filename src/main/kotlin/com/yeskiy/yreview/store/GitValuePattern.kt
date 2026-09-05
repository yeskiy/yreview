package com.yeskiy.yreview.store

/**
 * The value pattern that names one git configuration value and no other value.
 *
 * `git config --unset-all` reads its last argument as a regular expression. A refspec holds
 * a plus and a star, and both characters carry a pattern meaning, so a plain value reaches
 * other values of the same key. This object writes a backslash before every such character
 * and puts the answer between the two anchors. The pattern then matches the whole value and
 * nothing else.
 */
object GitValuePattern {

    /** The characters that a git value pattern reads as a pattern and not as themselves. */
    const val SPECIAL = "\\^\$.[]|()*+?{}"

    /** The pattern that matches this value alone. */
    fun exactly(value: String): String =
        value.map { if (it in SPECIAL) "\\" + it else "" + it }
            .joinToString("", prefix = "^", postfix = "\$")
}
