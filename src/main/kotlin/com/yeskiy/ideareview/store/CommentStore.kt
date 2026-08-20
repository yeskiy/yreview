package com.yeskiy.ideareview.store

data class StoredComment(val id: String, val ref: String, val comment: Comment)

class CommentBook(
    private val gateway: NotesGateway,
    private val author: String,
    private val clock: () -> Long = { System.currentTimeMillis() / 1000 },
) {

    fun add(
        ref: String,
        commit: String,
        path: String,
        startLine: Int,
        endLine: Int,
        text: String,
    ): StoredComment {
        val comment = Comment(
            timestamp = clock().toString(),
            author = author,
            description = text,
            location = Location(
                commit = commit,
                path = path,
                range = Range(startLine = startLine, endLine = endLine),
            ),
        )
        return write(ref, commit, comment)
    }

    fun resolve(stored: StoredComment): StoredComment {
        val update = Comment(
            timestamp = clock().toString(),
            author = author,
            original = stored.id,
            resolved = true,
            location = stored.comment.location,
        )
        val commit = stored.comment.location?.commit
            ?: error("a comment without a location cannot be resolved")
        return write(stored.ref, commit, update)
    }

    fun list(commit: String, refs: List<String> = NoteRefs.ALL): List<StoredComment> =
        refs.flatMap { ref ->
            gateway.readLines(ref, commit).mapNotNull { line ->
                runCatching { CommentJson.decode(line) }
                    .getOrNull()
                    ?.let { StoredComment(it.id(), ref, it) }
            }
        }

    fun open(commit: String, refs: List<String> = NoteRefs.ALL): List<StoredComment> {
        val all = list(commit, refs)
        val closed = closedIds(all)
        return all.filter { it.comment.original == null && it.id !in closed }
    }

    /** The comments that a later record marked as resolved. */
    fun closed(commit: String, refs: List<String> = NoteRefs.ALL): List<StoredComment> {
        val all = list(commit, refs)
        val closed = closedIds(all)
        return all.filter { it.comment.original == null && it.id in closed }
    }

    /** Every commit that carries a note in one of [refs]. */
    fun commits(refs: List<String> = NoteRefs.ALL): List<String> =
        refs.flatMap { gateway.commitsWithNotes(it) }.distinct()

    /** The record with this id, searched over every commit that carries a note. */
    fun find(id: String, refs: List<String> = NoteRefs.ALL): StoredComment? =
        commits(refs).firstNotNullOfOrNull { commit ->
            list(commit, refs).firstOrNull { it.id == id }
        }

    private fun closedIds(all: List<StoredComment>): Set<String> =
        all.mapNotNull { stored -> stored.comment.original.takeIf { stored.comment.resolved == true } }.toSet()

    private fun write(ref: String, commit: String, comment: Comment): StoredComment {
        gateway.append(ref, commit, CommentJson.encode(comment))
        return StoredComment(comment.id(), ref, comment)
    }
}
