package com.yeskiy.yreview.store

import com.intellij.notification.NotificationAction
import com.intellij.notification.NotificationGroupManager
import com.intellij.notification.NotificationType
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.yeskiy.yreview.ui.ReviewNotice
import java.util.concurrent.ConcurrentHashMap

/** Which repositories the plugin may ask about the fetch refspec. One question for each repository and session. */
class RefspecAsks(declined: Collection<String> = emptyList()) {

    private val refused = ConcurrentHashMap.newKeySet<String>().apply { addAll(declined) }

    private val asked = ConcurrentHashMap.newKeySet<String>()

    /** True for the first call for [root] in this session, and never after "Do not ask again". */
    fun mayAsk(root: String): Boolean = root !in refused && asked.add(root)

    fun decline(root: String) {
        refused.add(root)
    }

    fun declined(): List<String> = refused.sorted()
}

/** Asks the user before the plugin adds the notes fetch refspec to the git configuration file. */
@Service(Service.Level.PROJECT)
@State(name = "YReviewRefspecPrompt", storages = [Storage("y-review.xml")])
class RefspecPrompt(private val project: Project) : PersistentStateComponent<RefspecPrompt.State> {

    class State {
        @JvmField
        var declined: MutableList<String> = mutableListOf()
    }

    @Volatile
    private var asks = RefspecAsks()

    override fun getState(): State = State().also { it.declined = asks.declined().toMutableList() }

    override fun loadState(state: State) {
        asks = RefspecAsks(state.declined)
    }

    /** Shows one question for [root]. [add] runs on a pooled thread after the user clicks Add. */
    fun offer(root: String, name: String, add: () -> ShareResult) {
        if (!asks.mayAsk(root)) return
        NotificationGroupManager.getInstance()
            .getNotificationGroup(ReviewNotice.GROUP)
            .createNotification(
                "The remote of $name does not fetch the shared review comments. " +
                    "Add the fetch refspec ${NotesSharing.FETCH_REFSPEC} to the git configuration of $name?",
                NotificationType.INFORMATION,
            )
            .addAction(NotificationAction.createSimpleExpiring("Add") { runAdd(add) })
            .addAction(NotificationAction.createSimpleExpiring("Do not ask again") { asks.decline(root) })
            .notify(project)
    }

    private fun runAdd(add: () -> ShareResult) {
        ApplicationManager.getApplication().executeOnPooledThread {
            val result = add()
            if (!result.ok) ReviewNotice.warn(project, "The plugin did not add the fetch refspec. ${result.message}")
        }
    }

    companion object {
        fun getInstance(project: Project): RefspecPrompt = project.service()
    }
}
