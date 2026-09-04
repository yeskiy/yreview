package com.yeskiy.yreview.diagnostic

import com.intellij.ide.plugins.PluginManager
import com.intellij.ide.plugins.cl.PluginAwareClassLoader
import com.intellij.openapi.application.ApplicationInfo
import com.intellij.openapi.extensions.PluginId
import com.intellij.openapi.project.Project
import com.yeskiy.yreview.settings.ProductName
import com.yeskiy.yreview.settings.ReviewSettings

/** The versions of the machine. No project is needed to read them. */
data class MachineFacts(
    val pluginVersion: String,
    val ideBuild: String,
    val os: String,
    val javaVersion: String,
    val terminalPlugin: Boolean,
    val mcpPlugin: Boolean,
)

/**
 * The machine and the switches of one project, as plain values.
 *
 * A test builds this record without an IDE, so the whole report has a test that runs
 * without a display.
 */
data class ReportFacts(
    val machine: MachineFacts,
    val channel: Boolean,
    val sharing: String,
    val sessionWindow: String,
    val agentCommand: String,
)

/**
 * The text a user pastes into an issue.
 *
 * Every value here is a version, a switch, a count, a route or a state. No comment text,
 * no author and no bridge token reaches this text. [Redact] runs over the whole report as
 * the last step, so a value that a record carries by mistake still goes out.
 */
object DiagnosticReport {

    const val TERMINAL_ID = "org.jetbrains.plugins.terminal"

    const val MCP_ID = "com.intellij.mcpServer"

    const val UNKNOWN = "unknown"

    fun head(facts: MachineFacts): String = listOf(
        "${ProductName.TEXT} diagnostic report",
        line("plugin", facts.pluginVersion),
        line("ide", facts.ideBuild),
        line("os", facts.os),
        line("java", facts.javaVersion),
        line("terminal", state(facts.terminalPlugin)),
        line("mcpServer", state(facts.mcpPlugin)),
    ).joinToString("\n")

    /**
     * The whole report, from plain values.
     *
     * The redaction runs once, over the joined text. One exit therefore covers the head,
     * the switches and every record.
     */
    fun text(
        facts: ReportFacts,
        records: List<SessionRecord>,
        homes: List<String>,
        projectPath: String?,
    ): String = Redact.text(
        listOf(
            head(facts.machine),
            "",
            "Settings",
            line("channel", state(facts.channel)),
            line("sharing", facts.sharing),
            line("session window", facts.sessionWindow),
            line("agent command", facts.agentCommand),
            "",
            "Records, newest first (${records.size} of ${SessionLog.LIMIT})",
            if (records.isEmpty()) "  none" else records.joinToString("\n\n") { it.text() },
        ).joinToString("\n"),
        homes,
        projectPath,
    )

    fun text(project: Project): String = text(
        facts(project),
        SessionLog.getInstance(project).recent(),
        Redact.homes(),
        project.basePath,
    )

    fun facts(project: Project): ReportFacts {
        val settings = ReviewSettings.getInstance(project)
        return ReportFacts(
            machine = machine(),
            channel = settings.channel,
            sharing = settings.sharing.label,
            sessionWindow = choice(settings.sessionWindow),
            agentCommand = settings.command(settings.agentOrDefault()),
        )
    }

    fun machine(): MachineFacts = MachineFacts(
        pluginVersion = version(),
        ideBuild = ApplicationInfo.getInstance().build.asString(),
        os = property("os.name") + " " + property("os.version") + " " + property("os.arch"),
        javaVersion = property("java.version"),
        terminalPlugin = installed(TERMINAL_ID),
        mcpPlugin = installed(MCP_ID),
    )

    private fun line(name: String, value: String) = "  ${name.padEnd(SessionRecord.WIDTH)} $value"

    private fun state(on: Boolean) = if (on) "on" else "off"

    /** A null value means that the user never chose, and then the search for Claude decides. */
    private fun choice(value: Boolean?) = value?.let { state(it) } ?: "not chosen"

    private fun property(name: String) = System.getProperty(name).orEmpty().ifEmpty { UNKNOWN }

    private fun installed(id: String) = PluginManager.isPluginInstalled(PluginId.getId(id))

    private fun version(): String =
        (javaClass.classLoader as? PluginAwareClassLoader)?.pluginDescriptor?.version.orEmpty().ifEmpty { UNKNOWN }
}
