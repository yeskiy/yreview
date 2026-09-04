package com.yeskiy.yreview.diagnostic

import com.intellij.openapi.project.Project
import com.intellij.troubleshooting.TroubleInfoCollector
import com.yeskiy.yreview.settings.ProductName

/**
 * Puts the report into troubleshooting.txt of the standard log archive.
 *
 * The IDE builds that archive under Help, Collect Logs and Diagnostic Data. It calls every
 * collector of this extension point, and it writes the joined text into one file. A user
 * who knows that action therefore needs no action of this plugin.
 *
 * The IDE shows a warning about sensitive data before it builds the archive. The same
 * redaction runs here as on the clipboard route.
 */
class ReviewTroubleInfo : TroubleInfoCollector {

    override fun collectInfo(project: Project): String = DiagnosticReport.text(project)

    /** The archive and the dialog both group the text by this name. */
    override fun toString(): String = ProductName.TEXT
}
