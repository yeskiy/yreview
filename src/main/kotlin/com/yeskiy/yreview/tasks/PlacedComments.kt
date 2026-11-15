package com.yeskiy.yreview.tasks

import com.yeskiy.yreview.store.Carry
import com.yeskiy.yreview.store.CommentBook
import com.yeskiy.yreview.store.DiffCache
import com.yeskiy.yreview.store.FolderStore
import com.yeskiy.yreview.store.GitRunner
import com.yeskiy.yreview.store.LineMap
import com.yeskiy.yreview.store.NoteRefs
import com.yeskiy.yreview.store.NoteStore
import com.yeskiy.yreview.store.NotesGateway
import com.yeskiy.yreview.store.StoredComment
import java.nio.file.Files
import java.nio.file.Path

/** One open comment and its place in the working tree. */
data class Placed(val stored: StoredComment, val carry: Carry)

/** The open comments of one store with the line map applied. The editor and the task views both read this. */
object PlacedComments {

    fun of(
        git: GitRunner,
        root: String,
        head: String?,
        path: String? = null,
        notes: NoteStore? = null,
        checkCanceled: () -> Unit = {},
    ): List<Placed> {
        val book = CommentBook(notes ?: NoteScan.read(git, root, NoteRefs.ALL, checkCanceled) ?: NotesGateway(git), author = "")
        return book.commits(NoteRefs.ALL)
            .flatMap { book.open(it, NoteRefs.ALL) }
            .filter { shows(it, root) && (path == null || it.comment.location?.path == path) }
            .groupBy { it.commit }
            .flatMap { (commit, comments) -> place(git, root, head, commit, comments) }
    }

    private fun shows(stored: StoredComment, root: String): Boolean {
        val location = stored.comment.location ?: return false
        return stored.comment.description?.isNotBlank() == true && TaskPath.isRelativeUnder(root, location.path)
    }

    /** A comment of HEAD starts no diff. A file is read from disk only when a diff changed it or a comment holds text. */
    private fun place(git: GitRunner, root: String, head: String?, commit: String, comments: List<StoredComment>): List<Placed> {
        val atHead = head == null || head == FolderStore.WORKTREE || commit == head || commit == FolderStore.WORKTREE
        val paths = comments.mapNotNull { it.comment.location?.path }.distinct()
        val diffs = if (atHead || head == null) emptyMap() else DiffCache.diffs(git, root, head, commit, paths)
        val read = paths.filter { path ->
            diffs?.get(path)?.deleted == false || comments.any { it.comment.location?.let { at -> at.path == path && at.text != null } == true }
        }
        val current = read.associateWith { linesOnDisk(root, it) }
        return comments.mapNotNull { stored ->
            val location = stored.comment.location ?: return@mapNotNull null
            Placed(
                stored,
                LineMap.carry(
                    diffs?.get(location.path), location.range, current[location.path].orEmpty(),
                    text = location.text, head = atHead, refused = diffs == null,
                ),
            )
        }
    }

    /** Bytes that are not UTF-8 become a replacement character, so such a file never reads as empty. */
    private fun linesOnDisk(root: String, path: String): List<String> =
        runCatching { LineMap.lines(String(Files.readAllBytes(Path.of(root, path)), Charsets.UTF_8)) }.getOrDefault(emptyList())
}
