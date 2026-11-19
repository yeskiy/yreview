package com.yeskiy.yreview.tasks

import com.intellij.openapi.diagnostic.logger
import com.intellij.openapi.progress.ProgressManager
import com.intellij.openapi.progress.coroutineToIndicator
import com.intellij.openapi.project.Project
import com.intellij.openapi.project.waitForSmartMode
import com.intellij.openapi.startup.ProjectActivity
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.util.concurrent.CancellationException

/** Fills the shared scan result after the index is ready, so the first open of the tool window finds it. */
class ScanWarmup : ProjectActivity {

    override suspend fun execute(project: Project) {
        project.waitForSmartMode()
        try {
            withContext(Dispatchers.IO) {
                coroutineToIndicator {
                    if (!holdsReviewData(ScanStamp.of(project))) return@coroutineToIndicator
                    TaskScanService.getInstance(project).read(false) { ProgressManager.checkCanceled() }
                }
            }
        } catch (canceled: CancellationException) {
            throw canceled
        } catch (failure: Exception) {
            LOG.warn("The scan at project open failed", failure)
        }
    }

    /** True when a repository has a review ref or the project has a folder store. It reads files only. */
    private fun holdsReviewData(stamp: ScanStamp): Boolean = stamp.tips.values.any { it.isNotEmpty() } || stamp.folders.isNotEmpty()

    private companion object {
        val LOG = logger<ScanWarmup>()
    }
}
