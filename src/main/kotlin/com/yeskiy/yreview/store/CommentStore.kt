package com.yeskiy.yreview.store

/** One record, the ref that holds it, and the key of the note it was read from. */
data class StoredComment(val id: String, val ref: String, val commit: String, val comment: Comment)

/** One note, named by the ref that holds it and by the commit it belongs to. */
private data class NoteKey(val ref: String, val commit: String)

class CommentBook(
    private val gateway: NoteStore,
    private val author: String,
    private val clock: () -> Long = { System.currentTimeMillis() / 1000 },
) {

    fun add(
        ref: String,
        commit: String,
        path: String,
        range: Range,
        text: String,
    ): StoredComment {
        val comment = Comment(
            timestamp = clock().toString(),
            author = author,
            description = text,
            location = Location(commit = commit, path = path, range = range),
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
        return write(stored.ref, stored.commit, update)
    }

    fun list(commit: String, refs: List<String> = NoteRefs.ALL): List<StoredComment> =
        refs.flatMap { ref ->
            gateway.readLines(ref, commit).mapNotNull { line ->
                runCatching { CommentJson.decode(line) }
                    .getOrNull()
                    ?.let { StoredComment(it.id(), ref, commit, it) }
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

    /** The records with these identifiers, searched over every commit that carries a note. */
    fun findAll(ids: Set<String>, refs: List<String> = NoteRefs.ALL): List<StoredComment> =
        commits(refs).flatMap { commit -> list(commit, refs).filter { it.id in ids } }

    /**
     * Drops these records from the notes and reports how many lines went.
     *
     * One record is one line of the note of its commit. The method reads that note, keeps
     * every other line byte for byte, and writes the note again. A resolve record that
     * points at a deleted record goes with it, so no line of the note is left dangling.
     */
    fun remove(records: List<StoredComment>): Int =
        records.groupBy({ NoteKey(it.ref, it.commit) }, { it.id })
            .map { (key, ids) -> removeFrom(key, ids.toSet()) }
            .sum()

    private fun removeFrom(key: NoteKey, ids: Set<String>): Int {
        val lines = gateway.readLines(key.ref, key.commit)
        val kept = lines.filterNot { drops(it, ids) }
        if (kept.size == lines.size) return 0
        gateway.rewrite(key.ref, key.commit, kept)
        return lines.size - kept.size
    }

    private fun drops(line: String, ids: Set<String>): Boolean {
        val comment = runCatching { CommentJson.decode(line) }.getOrNull() ?: return false
        return comment.id() in ids || comment.original.orEmpty() in ids
    }

    private fun closedIds(all: List<StoredComment>): Set<String> =
        all.mapNotNull { stored -> stored.comment.original.takeIf { stored.comment.resolved == true } }.toSet()

    private fun write(ref: String, commit: String, comment: Comment): StoredComment {
        gateway.append(ref, commit, CommentJson.encode(comment))
        return StoredComment(comment.id(), ref, commit, comment)
    }
}
