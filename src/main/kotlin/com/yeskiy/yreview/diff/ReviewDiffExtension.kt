package com.yeskiy.yreview.diff

import com.intellij.diff.DiffContext
import com.intellij.diff.DiffExtension
import com.intellij.diff.FrameDiffTool
import com.intellij.diff.requests.DiffRequest
import com.intellij.diff.tools.util.side.TwosideTextDiffViewer
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.project.Project
import com.intellij.openapi.vcs.changes.actions.diff.ChangeDiffRequestProducer
import com.intellij.openapi.vfs.VirtualFile
import com.yeskiy.yreview.gutter.CommentGutter
import git4idea.repo.GitRepositoryManager

/**
 * Records the review anchor on both diff editors, then paints the comments of each side.
 * The action itself reaches the popup menu through the Diff.EditorPopupMenu group, which
 * is the same group the built-in Annotate action joins. A diff that carries no change
 * sets no anchor, so the action is disabled.
 */
class ReviewDiffExtension : DiffExtension() {

    override fun onViewerCreated(viewer: FrameDiffTool.DiffViewer, context: DiffContext, request: DiffRequest) {
        if (viewer !is TwosideTextDiffViewer) return
        val project = context.project ?: return
        val change = request.getUserData(ChangeDiffRequestProducer.CHANGE_KEY) ?: return
        val file = change.virtualFile ?: change.afterRevision?.file?.virtualFile ?: return
        val repository = GitRepositoryManager.getInstance(project).getRepositoryForFileQuick(file) ?: return

        val facts = ChangeRevisionFacts(change, repository.currentRevision, repository.root.path)
        attach(project, viewer.editor1, DiffSide.LEFT, facts, repository.root)
        attach(project, viewer.editor2, DiffSide.RIGHT, facts, repository.root)
    }

    /**
     * The gutter reads the user data of the editor, so the data goes in first. A side that
     * has no revision behind it gets no gutter, because it has no comments to draw.
     */
    private fun attach(
        project: Project,
        editor: Editor?,
        side: DiffSide,
        facts: RevisionFacts,
        root: VirtualFile,
    ) {
        if (editor == null) return
        val anchor = DiffAnchorResolver.resolve(facts, side)
        editor.putUserData(REVIEW_ANCHOR, anchor)
        editor.putUserData(REVIEW_ROOT, root)
        if (anchor != null) CommentGutter.getInstance(project).attach(editor)
    }
}
