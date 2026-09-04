package com.yeskiy.yreview.diagnostic

import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.diagnostic.logger
import com.intellij.openapi.project.Project
import java.util.concurrent.ConcurrentLinkedDeque

/**
 * What the plugin did in one project, in memory and bounded.
 *
 * The records go away with the project. The deque holds [LIMIT] records, and the next
 * record drops the oldest one, so a long session never grows the memory of the IDE. One
 * line of every record also reaches the log of the IDE, so a user who restarts the IDE
 * still holds the history there.
 *
 * The plugin writes no diagnostic file of its own. Help, Collect Logs and Diagnostic Data
 * already gathers the log of the IDE for the user.
 */
@Service(Service.Level.PROJECT)
class SessionLog(private val project: Project) {

    private val records = ConcurrentLinkedDeque<SessionRecord>()

    fun record(record: SessionRecord) {
        records.addLast(record)
        while (records.size > LIMIT) records.pollFirst()
        logger.info("The review plugin made a record.\n" + clean(record))
    }

    /** The log of the IDE reaches a maintainer as well, so the same rules run here. */
    private fun clean(record: SessionRecord): String =
        Redact.text(record.text(), Redact.homes(), project.basePath)

    /** The newest record comes first, because a reader looks at the last run. */
    fun recent(): List<SessionRecord> = records.toList().reversed()

    companion object {

        /**
         * The number of records the log keeps.
         *
         * One session start, the sends of that session and the failures of that session fit
         * in this window many times over. Every record is one short block of text, so the
         * whole log stays under about 25 kilobytes.
         */
        const val LIMIT = 50

        private val logger = logger<SessionLog>()

        fun getInstance(project: Project): SessionLog = project.service()
    }
}
