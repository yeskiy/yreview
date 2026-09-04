package com.yeskiy.yreview.session

import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import java.util.concurrent.CopyOnWriteArrayList

/**
 * One review session of the tool window, as the picker of the review window shows it.
 *
 * [reach] says how a send arrives at this session. The default keeps every caller that
 * names two arguments working, and a Claude Code session really is reached that way.
 */
data class SessionEntry(
    val key: String,
    val name: String,
    val reach: SessionReach = SessionReach.Channel,
)

/**
 * Names the review sessions of one project.
 *
 * The tool window puts a session here when it opens the tab, and it takes the session out
 * when the tab goes away. The name is the stable name of the tab, without the state, so
 * the picker reads Claude 2 and never Claude 2 (ended).
 *
 * A session in this list does not have to read the bridge yet. The caller of the picker
 * keeps only the entries that the reach of the session allows.
 */
@Service(Service.Level.PROJECT)
class SessionRegistry {

    private val open = CopyOnWriteArrayList<SessionEntry>()

    fun add(key: String, name: String, reach: SessionReach = SessionReach.Channel) {
        remove(key)
        open.add(SessionEntry(key, name, reach))
    }

    /** A rename of a key that already left changes nothing, so a late call is safe. */
    fun rename(key: String, name: String) {
        val at = open.indexOfFirst { it.key == key }
        if (at >= 0) open[at] = open[at].copy(name = name)
    }

    /**
     * A session starts and ends many times behind one tab, and the reach changes with it.
     * The entry keeps its place, so the picker keeps the order of the tabs.
     */
    fun setReach(key: String, reach: SessionReach) {
        val at = open.indexOfFirst { it.key == key }
        if (at >= 0) open[at] = open[at].copy(reach = reach)
    }

    fun remove(key: String) {
        open.removeAll { it.key == key }
    }

    fun entries(): List<SessionEntry> = open.toList()

    fun nameOf(key: String): String? = open.firstOrNull { it.key == key }?.name

    /** Nothing reaches a session that this registry does not hold. */
    fun reachOf(key: String): SessionReach =
        open.firstOrNull { it.key == key }?.reach ?: SessionReach.None

    companion object {
        fun getInstance(project: Project): SessionRegistry = project.service()
    }
}
