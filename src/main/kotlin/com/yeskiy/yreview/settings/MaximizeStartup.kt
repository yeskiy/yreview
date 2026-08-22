package com.yeskiy.yreview.settings

import com.intellij.openapi.application.EDT
import com.intellij.openapi.project.Project
import com.intellij.openapi.startup.ProjectActivity
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Writes the size of the main splitter again when a project opens.
 *
 * The strip stands in the frame of a project, and such a frame opens with this step. The
 * step writes nothing while the switch stands off, and it writes nothing while the size
 * already stands where the switch wants it. A second project therefore adds no work.
 *
 * The tool window pane lays the splitter out again inside the write, so the write goes to
 * the user interface thread.
 */
class MaximizeStartup : ProjectActivity {

    override suspend fun execute(project: Project) {
        withContext(Dispatchers.EDT) {
            MaximizeSettings.getInstance().start()
        }
    }
}
