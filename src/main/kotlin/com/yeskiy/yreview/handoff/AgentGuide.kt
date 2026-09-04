package com.yeskiy.yreview.handoff

/**
 * The document an agent outside Claude Code reads once.
 *
 * The rules live here, so the clipboard text stays short. The plugin writes this file on
 * every send, and the text never changes between two sends.
 *
 * [RULES] names no single folder, so the clipboard prompt of several repositories reads
 * the same rules. [TEXT] puts the header of one repository in front of them.
 */
object AgentGuide {

    const val FILE_NAME = "AGENT.md"

    const val TITLE = "# How to work through the review tasks"

    /**
     * The rules that hold for every review folder.
     *
     * A prompt that carries the tasks of two repositories reads this text once, then it
     * names the folder of each group beside the tasks of that group.
     */
    val RULES: String = """
        ## Where the tasks are

        Every review folder holds a `tasks.json` file. The file holds one JSON object.

        - `repository` is the path of the folder the tasks belong to.
        - `commit` is the git commit the tasks belong to.
        - `generated` is the time the plugin wrote the file.
        - `tasks` is the array of open tasks.

        ## What a task record holds

        - `id` is the name of the task. You report this value when the task is done.
        - `kind` is `comment` or `todo`.
        - `path` is the file inside the repository.
        - `startLine` and `endLine` are one based line numbers.
        - `text` is the work to do.
        - `pattern` is `TODO` or `FIXME`. Only a task of the kind `todo` holds it.
        - `author` is the person who wrote the comment. Only a task of the kind `comment` holds it.

        ## A folder that no git repository holds

        The plugin keeps the comments of such a folder in a `.y-review` folder. The `commit`
        value of those tasks is `worktree`, which is not a git commit. Close a task of that
        folder through `done.txt`, the same way as every other task.

        ## What an identifier looks like

        An identifier holds letters, digits, underscores and hyphens only. No other
        character is valid. Copy the value from `tasks.json`, then do not change it.

        ## How to finish a task of the kind comment

        1. Make the change the `text` asks for.
        2. Append the `id` of the task to the `done.txt` file of the folder that holds the task.
        3. Write one identifier on one line.

        The plugin reads the new lines, then it marks the comment as resolved.

        ## How to finish a task of the kind todo

        1. Do the work the comment line asks for.
        2. Remove that comment line from the source file.
        3. Append the `id` of the task to the `done.txt` file of the folder that holds the task.

        The plugin reads the source file again. The plugin reports a task that is still in
        the source.

        ## What the plugin does by itself

        Never delete `done.txt` and never edit it, because the plugin keeps a read position
        in that file. The plugin picks up every new line by itself. You do not run a git
        command, and you do not edit a git note.
    """.trimIndent()

    val TEXT: String = """
        $TITLE

        This folder holds the open tasks of one repository. The plugin of the IDE writes
        the tasks. You read them, you do the work, then you report every task you finish.
    """.trimIndent() + "\n\n" + RULES
}
