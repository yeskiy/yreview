package com.yeskiy.yreview.session

import com.intellij.openapi.Disposable
import com.intellij.openapi.diagnostic.thisLogger
import com.intellij.openapi.project.Project
import com.intellij.terminal.ui.TerminalWidget
import org.jetbrains.plugins.terminal.LocalTerminalDirectRunner
import org.jetbrains.plugins.terminal.ShellStartupOptions
import org.jetbrains.plugins.terminal.startup.TerminalProcessType

/**
 * Starts one terminal widget for a review session. The widget belongs to the caller, so it
 * can live in any tool window. The bundled cloud terminal and the gateway dialog take the
 * same route, which is why a tool window other than Terminal works here.
 */
object ReviewTerminal {

    /**
     * The process type is not a shell. The plugin owns every argument of the command line,
     * so the terminal must not add a shell integration argument of its own.
     */
    fun open(project: Project, plan: SessionPlan, parent: Disposable): TerminalWidget? = runCatching {
        LocalTerminalDirectRunner.createTerminalRunner(project).startShellTerminalWidget(
            parent,
            ShellStartupOptions.Builder()
                .workingDirectory(plan.workingDirectory)
                .shellCommand(plan.command)
                .envVariables(plan.environment)
                .processType(TerminalProcessType.NON_SHELL)
                .build(),
            true
        )
    }.onFailure { thisLogger().warn("The review session terminal did not start.", it) }.getOrNull()
}
