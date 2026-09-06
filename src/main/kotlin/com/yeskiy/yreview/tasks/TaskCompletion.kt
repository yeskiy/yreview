package com.yeskiy.yreview.tasks

import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.project.DumbService
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.yeskiy.yreview.bridge.ResolveRequest
import com.yeskiy.yreview.store.CommentBook
import com.yeskiy.yreview.store.NotesWriteException
import com.yeskiy.yreview.store.ReviewService
import com.yeskiy.yreview.store.StoredComment

/** What one batch of reported identifiers did. */
data class CloseReport(val closed: Int, val problems: List<String> = emptyList()) {

    val problem: String? get() = problems.joinToString(" ").ifEmpty { null }

    val quiet: Boolean get() = closed == 0 && problems.isEmpty()

    /**
     * What a person reads after a close. [done] names the count, and a problem follows it.
     *
     * A person who reads a problem alone cannot tell how many tasks closed, and a batch that
     * closed most of its tasks still carries a problem about the rest.
     */
    fun sentence(done: String): String = listOfNotNull(done.ifBlank { null }, problem).joinToString(" ")
}

/**
 * How one batch of reported identifiers splits before the plugin reads anything.
 *
 * A comment identifier needs the git notes only. A TODO identifier needs the index of the
 * IDE, because the plugin reads the source to see whether the line is still there. That
 * read waits for the whole index build, and the caller waits with it.
 *
 * The plugin therefore holds the TODO identifiers back while the IDE builds its index. The
 * comments still close, and the agent reads one sentence and reports the TODO items again.
 *
 * One batch also has a size. Each comment identifier costs a walk over every commit that
 * carries a note, and every walk starts a git process for each note. A batch that an agent
 * outside the IDE wrote therefore stops at [ResolveRequest.MAX_IDS] identifiers, which is
 * the number the channel route already takes, and [overflowProblem] names the rest.
 *
 * That bound is the default of [of], so a route which states nothing takes it. A route that
 * a person drives states [NO_CAP], because a user who checks 250 rows asked for 250.
 */
data class ClosePlan(
    val comments: List<String>,
    val todos: List<String>,
    val deferred: List<String>,
    val dropped: List<String> = emptyList(),
) {

    /** The sentence the agent reads about the identifiers this plan held back. */
    val deferralProblem: String?
        get() = if (deferred.isEmpty()) null else "$INDEX_BUSY ${deferred.joinToString(" ")}"

    /**
     * The sentence about the identifiers the cap left out.
     *
     * The sentence names the count and not the identifiers, because one batch can hold many
     * thousand of them and a person reads this text.
     */
    val overflowProblem: String?
        get() = if (dropped.isEmpty()) null else "$TOO_MANY It left ${dropped.size} out, so report them again."

    companion object {

        const val INDEX_BUSY = "The IDE builds its index, so it cannot read the TODO lines yet. Report these again:"

        const val TOO_MANY = "The plugin closes at most ${ResolveRequest.MAX_IDS} tasks at one time."

        /** The bound of a route that a person drives. A user who checks 250 rows asked for 250. */
        const val NO_CAP = Int.MAX_VALUE

        /**
         * Every list of the plan holds the text the agent sent, in the long form or in the
         * short form. [TaskHandles.namesTodo] reads both, and it touches no git and no
         * index, so this call is safe while the IDE builds its index.
         */
        fun of(ids: List<String>, indexReady: Boolean, limit: Int = ResolveRequest.MAX_IDS): ClosePlan {
            val known = ids.distinct()
            val (todos, comments) = known.take(limit).partition(TaskHandles::namesTodo)
            return ClosePlan(
                comments = comments,
                todos = if (indexReady) todos else emptyList(),
                deferred = if (indexReady) emptyList() else todos,
                dropped = known.drop(limit),
            )
        }
    }
}

private sealed interface CommentOutcome {

    data object Closed : CommentOutcome

    data object Already : CommentOutcome

    data class Problem(val text: String) : CommentOutcome
}

/**
 * Closes the tasks an agent reports as finished.
 *
 * Both routes end here. The channel sends the identifiers over the bridge, and an agent
 * outside Claude Code appends them to done.txt.
 *
 * A comment becomes a resolve record in the git notes. A TODO has no record, because the
 * agent closes it when the agent removes the line. The plugin only reports a TODO that is
 * still in the source.
 *
 * An identifier that arrives twice writes nothing the second time. The done file keeps its
 * whole history, so the same line reaches this class again after a restart of the IDE.
 *
 * [close] bounds one batch at [ResolveRequest.MAX_IDS] identifiers. Both agent routes take
 * that bound, because neither one has a person behind it. The tool window states
 * [ClosePlan.NO_CAP], because a user picked every row and waits behind a progress window
 * that takes a cancel.
 */
@Service(Service.Level.PROJECT)
class TaskCompletion(private val project: Project) {

    fun close(ids: List<String>, limit: Int = ResolveRequest.MAX_IDS): CloseReport {
        val plan = ClosePlan.of(ids, indexReady = !DumbService.getInstance(project).isDumb, limit = limit)
        val outcomes = closeComments(plan.comments)
        val stillOpen = openTodoIds(plan.todos)
        return CloseReport(
            closed = outcomes.count { it is CommentOutcome.Closed } + plan.todos.size - stillOpen.size,
            problems = outcomes.filterIsInstance<CommentOutcome.Problem>().map { it.text } +
                stillOpen.map { "The line of the task $it is still in the source." } +
                listOfNotNull(plan.deferralProblem, plan.overflowProblem),
        )
    }

    /**
     * Closes the comments of one batch.
     *
     * The method reads every record of every store once, then it matches every reported
     * value in memory. One walk therefore serves the whole batch. A walk for each value
     * would run one git process for each note, over and over.
     */
    private fun closeComments(given: List<String>): List<CommentOutcome> {
        if (given.isEmpty()) return emptyList()
        val service = ReviewService.getInstance(project)
        val found = service.storeRoots().flatMap { store ->
            service.bookForRoot(store.root).tasks().map { store.root to it }
        }
        val ids = found.map { it.second.id }
        return given.map { text -> outcomeOf(service, found, ids, text) }
    }

    /** [given] is the text the agent sent. Every sentence names it, and never the long value. */
    private fun outcomeOf(
        service: ReviewService,
        found: List<Pair<VirtualFile, StoredComment>>,
        ids: List<String>,
        given: String,
    ): CommentOutcome {
        val key = TaskHandles.keyOf(given) ?: return CommentOutcome.Problem("$UNKNOWN $given.")
        return when (val match = TaskHandles.match(key, ids)) {
            is HandleMatch.None -> CommentOutcome.Problem("$UNKNOWN $given.")
            is HandleMatch.Many -> CommentOutcome.Problem("The id $given names ${match.count} tasks. $AMBIGUOUS")
            is HandleMatch.One -> resolveOne(service, found.first { it.second.id == match.id }, given)
        }
    }

    private fun resolveOne(
        service: ReviewService,
        hit: Pair<VirtualFile, StoredComment>,
        given: String,
    ): CommentOutcome {
        if (isClosed(service.bookForRoot(hit.first), hit.second)) return CommentOutcome.Already
        return try {
            service.resolveComment(hit.first, hit.second)
            CommentOutcome.Closed
        } catch (failure: NotesWriteException) {
            CommentOutcome.Problem("The IDE could not resolve $given. ${failure.message}")
        }
    }

    private fun isClosed(book: CommentBook, stored: StoredComment): Boolean =
        book.closed(stored.commit).any { it.id == stored.id }

    /**
     * The TODO items of the batch that are still in the source.
     *
     * The scan reads the whole project once, and the match then runs in memory. A value
     * that names no open TODO line simply closed, because the agent removed that line.
     */
    private fun openTodoIds(given: List<String>): List<String> {
        if (given.isEmpty()) return emptyList()
        val open = TaskScan.openTodoIds(project).toList()
        return given.filter { text ->
            val key = TaskHandles.keyOf(text)
            key != null && TaskHandles.match(key, open) is HandleMatch.One
        }
    }

    companion object {

        const val UNKNOWN = "The IDE holds no open task with the id"

        const val AMBIGUOUS = "Send the whole 40 character id instead."

        fun getInstance(project: Project): TaskCompletion = project.service()
    }
}
