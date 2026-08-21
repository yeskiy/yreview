package com.yeskiy.yreview.tasks

import com.intellij.openapi.application.ReadAction
import com.intellij.openapi.command.WriteCommandAction
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.editor.Document
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.openapi.vfs.ReadonlyStatusHandler
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.psi.PsiComment
import com.intellij.psi.PsiDocumentManager
import com.intellij.psi.PsiFile
import com.intellij.psi.PsiManager
import com.intellij.psi.util.PsiTreeUtil

/** A part of a file, from [start] up to [end]. The character at [end] stays. */
data class TextCut(val start: Int, val end: Int)

/**
 * The part of a file that one delete of a TODO removes.
 *
 * A comment that stands alone on its line goes with the whole line. The white space in
 * front of it and the line break behind it go too, so no blank line stays behind.
 *
 * A comment that follows code on the same line takes the white space in front of it, and
 * the code stays. A comment that stands in front of code takes the white space behind it,
 * so the code keeps the indent of the line.
 */
object TodoCut {

    fun of(text: CharSequence, start: Int, end: Int): TextCut {
        val lineStart = lineStart(text, start)
        val lineEnd = lineEnd(text, end)
        val before = text.subSequence(lineStart, start)
        val after = text.subSequence(end, lineEnd)
        return when {
            before.isBlank() && after.isBlank() -> TextCut(lineStart, lineBreak(text, lineEnd))
            before.isBlank() -> TextCut(start, spaceEnd(text, end, lineEnd))
            else -> TextCut(spaceStart(text, lineStart, start), end)
        }
    }

    /**
     * The cuts of one file, from the last one to the first one.
     *
     * A delete removes the last cut first, so the offsets of the cuts in front of it stay
     * good. Two TODO rows can sit in one comment, and two cuts that lie over each other
     * become one cut.
     */
    fun apart(cuts: List<TextCut>): List<TextCut> =
        cuts.sortedByDescending { it.start }
            .fold(emptyList()) { kept, cut ->
                val last = kept.lastOrNull()
                if (last == null || cut.end <= last.start) {
                    kept + cut
                } else {
                    kept.dropLast(1) + TextCut(cut.start, maxOf(last.end, cut.end))
                }
            }

    private fun lineStart(text: CharSequence, offset: Int): Int = text.lastIndexOf('\n', offset - 1) + 1

    private fun lineEnd(text: CharSequence, offset: Int): Int =
        text.indexOf('\n', offset).let { if (it < 0) text.length else it }

    private fun lineBreak(text: CharSequence, lineEnd: Int): Int =
        if (lineEnd < text.length) lineEnd + 1 else lineEnd

    /** Where the run of spaces in front of [start] begins. */
    private fun spaceStart(text: CharSequence, lineStart: Int, start: Int): Int =
        (start downTo lineStart).first { it == lineStart || !text[it - 1].isWhitespace() }

    /** Where the run of spaces behind [end] stops. */
    private fun spaceEnd(text: CharSequence, end: Int, lineEnd: Int): Int =
        (end..lineEnd).first { it == lineEnd || !text[it].isWhitespace() }
}

/** What one delete of TODO items did. */
data class TodoReport(
    val removed: Int,
    val missing: List<String> = emptyList(),
    val problems: List<String> = emptyList(),
) {

    val problem: String? get() = problems.joinToString(" ").ifEmpty { null }
}

/** One TODO the plugin found again, and the part of the file that the delete removes. */
private data class TodoEdit(val file: PsiFile, val document: Document, val cut: TextCut)

/**
 * Deletes TODO items from the source files.
 *
 * A TODO lives in a comment of the source file, and not in a git note. The plugin reads
 * the line of the row, finds the comment element on it, and removes that comment. The row
 * leaves the tree when the reader runs again.
 *
 * The plugin compares the text of the comment with the text of the row before it writes.
 * A row whose text moved away therefore stays, and the report names it.
 *
 * The caller runs [delete] on the user interface thread, because the plugin writes a
 * document. One write command holds every edit, so one undo step puts them all back.
 */
@Service(Service.Level.PROJECT)
class TodoRemoval(private val project: Project) {

    fun delete(tasks: List<ReviewTask>): TodoReport {
        val todos = tasks.filter { it.kind == TaskKind.TODO }.distinctBy { TaskChecks.keyOf(it) }
        if (todos.isEmpty()) return TodoReport(0)
        PsiDocumentManager.getInstance(project).commitAllDocuments()
        val locked = locked(todos.mapNotNull { fileOf(it) }.distinct())
        val open = todos.filterNot { fileOf(it) in locked }
        val found = ReadAction.computeBlocking<List<Pair<ReviewTask, TodoEdit?>>, RuntimeException> {
            open.map { it to editOf(it) }
        }
        val edits = found.mapNotNull { it.second }
        if (edits.isNotEmpty()) write(edits)
        return TodoReport(
            removed = edits.size,
            missing = found.filter { it.second == null }.map { place(it.first) },
            problems = if (locked.isEmpty()) emptyList() else listOf(lockedMessage(locked)),
        )
    }

    private fun write(edits: List<TodoEdit>) {
        val manager = PsiDocumentManager.getInstance(project)
        WriteCommandAction.runWriteCommandAction(
            project,
            COMMAND,
            null,
            Runnable {
                edits.groupBy { it.document }.forEach { (document, group) ->
                    TodoCut.apart(group.map { it.cut }).forEach { document.deleteString(it.start, it.end) }
                    manager.commitDocument(document)
                }
            },
            *edits.map { it.file }.distinct().toTypedArray(),
        )
    }

    private fun editOf(task: ReviewTask): TodoEdit? {
        val file = fileOf(task) ?: return null
        val psi = PsiManager.getInstance(project).findFile(file) ?: return null
        val document = PsiDocumentManager.getInstance(project).getDocument(psi) ?: return null
        val line = task.startLine - 1
        if (line < 0 || line >= document.lineCount) return null
        val comment = commentOn(psi, document, line)?.takeIf { holds(it, task) } ?: return null
        return TodoEdit(
            psi,
            document,
            TodoCut.of(document.charsSequence, comment.textRange.startOffset, comment.textRange.endOffset),
        )
    }

    /** The comment element of one line, or null when the line holds no comment any more. */
    private fun commentOn(psi: PsiFile, document: Document, line: Int): PsiComment? =
        (document.getLineStartOffset(line) until document.getLineEndOffset(line))
            .firstNotNullOfOrNull { PsiTreeUtil.getParentOfType(psi.findElementAt(it), PsiComment::class.java, false) }

    /** True while the comment still holds the first line of the text that the tree read. */
    private fun holds(comment: PsiComment, task: ReviewTask): Boolean =
        TaskLabels.firstLine(task.text).let { it.isNotEmpty() && comment.text.contains(it) }

    /** The files the plugin may not write. The handler asks the user about a read-only file first. */
    private fun locked(files: List<VirtualFile>): Set<VirtualFile> =
        if (files.isEmpty()) {
            emptySet()
        } else {
            ReadonlyStatusHandler.getInstance(project).ensureFilesWritable(files).readonlyFiles.toSet()
        }

    private fun fileOf(task: ReviewTask): VirtualFile? =
        if (task.filePath.isEmpty()) null else LocalFileSystem.getInstance().findFileByPath(task.filePath)

    private fun place(task: ReviewTask): String = "${task.path}:${TaskLabels.lines(task)}"

    private fun lockedMessage(files: Set<VirtualFile>): String =
        "The plugin cannot write ${files.joinToString(", ") { it.name }}. " +
            "Clear the read-only flag of that file, then delete the row again."

    companion object {
        /** The name of the undo step. The editor shows it in the Edit menu. */
        const val COMMAND = "Delete the TODO Item"

        fun getInstance(project: Project): TodoRemoval = project.service()
    }
}
