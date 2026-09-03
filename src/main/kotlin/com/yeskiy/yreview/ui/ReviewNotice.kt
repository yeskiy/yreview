package com.yeskiy.yreview.ui

import com.intellij.notification.NotificationGroupManager
import com.intellij.notification.NotificationType
import com.intellij.openapi.project.Project
import com.yeskiy.yreview.settings.ProductName

/** Short messages about the review bridge. A balloon does not stop the work in the editor. */
object ReviewNotice {

    const val GROUP = ProductName.TEXT

    fun say(project: Project, text: String) = show(project, text, NotificationType.INFORMATION)

    fun warn(project: Project, text: String) = show(project, text, NotificationType.WARNING)

    private fun show(project: Project, text: String, type: NotificationType) {
        NotificationGroupManager.getInstance()
            .getNotificationGroup(GROUP)
            .createNotification(text, type)
            .notify(project)
    }
}
