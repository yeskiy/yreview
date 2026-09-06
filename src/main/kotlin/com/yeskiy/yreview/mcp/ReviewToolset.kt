package com.yeskiy.yreview.mcp

import com.intellij.diff.DiffContentFactory
import com.intellij.diff.DiffManager
import com.intellij.diff.contents.DiffContent
import com.intellij.diff.requests.SimpleDiffRequest
import com.intellij.diff.util.DiffUserDataKeys
import com.intellij.diff.util.Side
import com.intellij.mcpserver.McpToolset
import com.intellij.mcpserver.annotations.McpDescription
import com.intellij.mcpserver.annotations.McpTool
import com.intellij.mcpserver.annotations.McpToolHintValue
import com.intellij.mcpserver.annotations.McpToolHints
import com.intellij.mcpserver.project
import com.intellij.openapi.application.EDT
import com.intellij.openapi.fileEditor.OpenFileDescriptor
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Pair
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.openapi.vfs.VirtualFile
import com.yeskiy.yreview.store.AnchorResult
import com.yeskiy.yreview.store.CommentBook
import com.yeskiy.yreview.store.FolderStore
import com.yeskiy.yreview.store.NoteRefs
import com.yeskiy.yreview.store.NotesWriteException
import com.yeskiy.yreview.store.Range
import com.yeskiy.yreview.settings.ReviewSettings
import com.yeskiy.yreview.store.ReviewService
import com.yeskiy.yreview.store.StoreKind
import com.yeskiy.yreview.store.StoreRoot
import com.yeskiy.yreview.store.StoredComment
import com.yeskiy.yreview.store.ideGitRunner
import git4idea.repo.GitRepositoryManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlin.coroutines.coroutineContext

/**
 * Gives a Claude Code agent the review comments through the MCP server of the IDE.
 *
 * The IDE finds this class through the com.intellij.mcpServer.mcpToolset extension point,
 * so the tools appear on the port the IDE already listens on. No new process starts.
 *
 * Every tool returns one JSON text. See [ReviewPayloads] for the reason.
 */
class ReviewToolset : McpToolset {

    @McpTool
    @McpToolHints(readOnlyHint = McpToolHintValue.TRUE, openWorldHint = McpToolHintValue.FALSE)
    @McpDescription(
        """
        |Lists the review comments of this project.
        |A person writes these comments in the IDE to ask for a change in the code.
        |Read them first, then do what each comment asks.
        |The answer is a JSON object with one "comments" array. Each item holds these fields:
        |- "id", the value the other review tools need
        |- "path", the file inside its git repository or inside its folder store
        |- "startLine" and "endLine", one based line numbers. 0 means the whole file
        |- "startColumn" and "endColumn", zero based character positions in a line. A comment
        |  holds them only when it covers a part of a line. "endColumn" names the character
        |  after the last character of the comment
        |- "revision", the git commit that the comment belongs to, or "worktree" for a comment
        |  of a folder that no git repository holds
        |- "author", "text", "shared" and "resolved"
        """
    )
    suspend fun review_list_comments(
        @McpDescription("Pass true to list the comments a person marked as resolved. The default lists the open comments.")
        resolved: Boolean = false,
        @McpDescription("Pass true to also list the comments a machine wrote.")
        includeAnalyses: Boolean = false,
        @McpDescription("Pass false to leave out the private comments that stay on this computer.")
        includeLocal: Boolean = true,
    ): String {
        val project = coroutineContext.project
        val refs = ReviewArguments.refsFor(includeAnalyses, includeLocal)
        return withContext(Dispatchers.IO) {
            val rows = reposOf(project).flatMap { repo ->
                repo.book.commits(refs).flatMap { commit ->
                    if (resolved) repo.book.closed(commit, refs) else repo.book.open(commit, refs)
                }.map { it to repo.store.kind }
            }
            ReviewPayloads.list(rows.mapNotNull { (stored, kind) -> ReviewPayloads.rowOf(stored, resolved, kind) })
        }
    }

    @McpTool
    @McpToolHints(
        readOnlyHint = McpToolHintValue.FALSE,
        destructiveHint = McpToolHintValue.FALSE,
        openWorldHint = McpToolHintValue.FALSE,
    )
    @McpDescription(
        """
        |Marks one review comment as resolved.
        |Call this after you made the change the comment asks for.
        |The comment stays in the store as history. The answer is a JSON object with the id
        |and "resolved": true, or an "error" field when the id is unknown.
        """
    )
    suspend fun review_resolve_comment(
        @McpDescription("The id of the comment. Use a value from review_list_comments.")
        id: String,
    ): String {
        val project = coroutineContext.project
        return withContext(Dispatchers.IO) {
            val hit = locate(project, id)
                ?: return@withContext ReviewPayloads.error("No review comment has the id $id.")
            try {
                hit.repo.book.resolve(hit.stored)
                ReviewPayloads.resolved(hit.stored.id)
            } catch (failure: NotesWriteException) {
                ReviewPayloads.error(failure.message ?: "The resolution was not written.")
            }
        }
    }

    @McpTool
    @McpToolHints(
        readOnlyHint = McpToolHintValue.FALSE,
        destructiveHint = McpToolHintValue.FALSE,
        openWorldHint = McpToolHintValue.FALSE,
    )
    @McpDescription(
        """
        |Writes a new review comment on a range of lines, so a person reads it later.
        |Use this to record a finding you do not want to fix yourself.
        |The plugin anchors the comment to the current commit of the file. A file that no git
        |repository holds keeps its comments in a folder store, and there the revision is "worktree".
        |The answer is a JSON object with the new "id", or an "error" field.
        """
    )
    suspend fun review_add_comment(
        @McpDescription("Path of the file, relative to the root of the project. The tool refuses a path outside the project.")
        path: String,
        @McpDescription("First line of the comment. Line numbers start at 1.")
        startLine: Int,
        @McpDescription("Last line of the comment. Pass the same value as startLine for one line.")
        endLine: Int,
        @McpDescription("The comment text a person reads.")
        text: String,
    ): String {
        val project = coroutineContext.project
        ReviewArguments.rangeProblem(startLine, endLine)?.let { return ReviewPayloads.error(it) }
        if (text.isBlank()) return ReviewPayloads.error("text must not be empty.")
        val relative = ReviewArguments.normalizePath(path)
            ?: return ReviewPayloads.error("The path $path is not a path inside the project.")

        return withContext(Dispatchers.IO) {
            val file = fileInProject(project, relative)
                ?: return@withContext ReviewPayloads.error("The project holds no file at $relative.")

            val service = ReviewService.getInstance(project)
            // The rule of the project decides the store. A file inside a git repository goes
            // to the notes of that repository, and every other file goes to a folder store.
            val anchor = when (val found = service.anchorOf(file)) {
                is AnchorResult.Found -> found.anchor
                AnchorResult.NoCommit ->
                    return@withContext ReviewPayloads.error("The repository of $relative has no commit yet.")
                AnchorResult.NoPlace ->
                    return@withContext ReviewPayloads.error("The project holds no review store for $relative.")
            }

            // The agent writes where a person writes, so it follows the project setting and it
            // takes the same push path. A shared ref reaches the remote, a local ref does not.
            val ref = NoteRefs.refFor(ReviewSettings.getInstance(project).sharing.shareByDefault)
            try {
                val result = service.addComment(anchor, ref, Range(startLine = startLine, endLine = endLine), text)
                ReviewPayloads.added(
                    result.stored.id,
                    anchor.path,
                    anchor.key,
                    ReviewArguments.isShared(anchor.kind, result.stored.ref, result.shareError),
                )
            } catch (failure: NotesWriteException) {
                ReviewPayloads.error(failure.message ?: "The comment was not written.")
            }
        }
    }

    @McpTool
    @McpToolHints(
        readOnlyHint = McpToolHintValue.FALSE,
        destructiveHint = McpToolHintValue.FALSE,
        openWorldHint = McpToolHintValue.FALSE,
    )
    @McpDescription(
        """
        |Shows one review comment to the person at the IDE.
        |The IDE opens the file at that line. When the comment belongs to an older commit,
        |the IDE opens the diff between that commit and the working tree instead.
        |Call this when you want the person to look at the code you discuss.
        |The answer names what the IDE opened, "file" or "diff", or holds an "error" field.
        """
    )
    suspend fun review_open_comment(
        @McpDescription("The id of the comment. Use a value from review_list_comments.")
        id: String,
    ): String {
        val project = coroutineContext.project
        val prepared = withContext(Dispatchers.IO) {
            val hit = locate(project, id) ?: return@withContext null
            val location = hit.stored.comment.location ?: return@withContext null
            val root = hit.repo.store.root
            val file = root.findFileByRelativePath(location.path)
                ?: LocalFileSystem.getInstance().refreshAndFindFileByPath("${root.path}/${location.path}")
            // A folder store carries no commit, so its key equals the head and the IDE opens
            // the file itself. A git comment of an older commit opens as a diff.
            val atHead = location.commit == hit.repo.head
            val older =
                if (atHead || hit.repo.store.kind != StoreKind.GIT) null
                else revisionText(project, root, location.commit, location.path)
            Prepared(
                id = hit.stored.id,
                path = location.path,
                line = (location.range?.startLine ?: 1).coerceAtLeast(1),
                revision = location.commit,
                file = file,
                olderText = older,
            )
        } ?: return ReviewPayloads.error("No review comment has the id $id.")

        return withContext(Dispatchers.EDT) { show(project, prepared) }
    }

    /**
     * One store the tools read, and the key of its current state.
     *
     * [head] is the current commit of a git repository. A folder store holds no commit, so
     * its key is the constant the folder records carry.
     */
    private class Repo(val store: StoreRoot, val head: String?, val book: CommentBook)

    private class Hit(val repo: Repo, val stored: StoredComment)

    private class Prepared(
        val id: String,
        val path: String,
        val line: Int,
        val revision: String,
        val file: VirtualFile?,
        val olderText: String?,
    )

    private fun show(project: Project, prepared: Prepared): String {
        if (prepared.olderText == null) {
            val file = prepared.file
                ?: return ReviewPayloads.error("The working tree holds no file at ${prepared.path}.")
            OpenFileDescriptor(project, file, prepared.line - 1, 0).navigate(true)
            return ReviewPayloads.opened(prepared.id, "file", prepared.path, prepared.line, prepared.revision)
        }

        val factory = DiffContentFactory.getInstance()
        val left: DiffContent = prepared.file
            ?.let { factory.create(project, prepared.olderText, it) }
            ?: factory.create(project, prepared.olderText)
        val right: DiffContent = prepared.file?.let { factory.create(project, it) } ?: factory.createEmpty()

        val request = SimpleDiffRequest(
            prepared.path,
            left,
            right,
            "${prepared.revision.take(SHORT_REVISION)} (the comment)",
            "Working tree",
        )
        request.putUserData(DiffUserDataKeys.SCROLL_TO_LINE, Pair.create(Side.LEFT, prepared.line - 1))
        DiffManager.getInstance().showDiff(project, request)
        return ReviewPayloads.opened(prepared.id, "diff", prepared.path, prepared.line, prepared.revision)
    }

    /**
     * Every store of the project, the git repositories and the folder stores alike.
     *
     * The lookup never moves a folder store into the git notes. That move writes a note and
     * it moves a folder on the disk, and a tool of this set answers a question of an agent.
     * A user who opens the tool window starts the move.
     */
    private fun reposOf(project: Project): List<Repo> {
        val service = ReviewService.getInstance(project)
        val heads = GitRepositoryManager.getInstance(project).repositories
            .associate { it.root.path to it.currentRevision }
        return service.storeRoots(migrate = false).map { store ->
            val head = if (store.kind == StoreKind.GIT) heads[store.root.path] else FolderStore.WORKTREE
            Repo(store, head, service.bookFor(store))
        }
    }

    private fun locate(project: Project, id: String): Hit? =
        reposOf(project).firstNotNullOfOrNull { repo ->
            repo.book.find(id)?.let { Hit(repo, it) }
        }

    /** Reads the file at one commit. Returns null when the revision or the path is not usable. */
    private fun revisionText(project: Project, root: VirtualFile, commit: String, path: String): String? {
        if (!ReviewArguments.isRevision(commit)) return null
        return ideGitRunner(project, root).run("show", "$commit:$path").takeIf { it.ok }?.stdout
    }

    /** Resolves a project relative path that [ReviewArguments.normalizePath] already checked. */
    private fun fileInProject(project: Project, relative: String): VirtualFile? =
        LocalFileSystem.getInstance()
            .refreshAndFindFileByPath("${project.basePath ?: return null}/$relative")
            ?.takeIf { it.isValid && !it.isDirectory }

    private companion object {
        const val SHORT_REVISION = 12
    }
}
