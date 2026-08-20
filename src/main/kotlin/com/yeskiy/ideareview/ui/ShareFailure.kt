package com.yeskiy.ideareview.ui

import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.Messages

object ShareFailure {

    fun report(project: Project, title: String, gitMessage: String) {
        Messages.showErrorDialog(
            project,
            "The plugin wrote the comment, but the push to origin failed.\n" +
                "The comment stays in this repository, and the tool window marks the row as not shared.\n\n" +
                gitMessage,
            title,
        )
    }
}
