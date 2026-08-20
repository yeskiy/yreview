package com.yeskiy.ideareview.diff

import com.intellij.diff.DiffContext
import com.intellij.diff.DiffExtension
import com.intellij.diff.FrameDiffTool
import com.intellij.diff.requests.DiffRequest
import com.intellij.diff.tools.util.side.TwosideTextDiffViewer
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.vcs.changes.actions.diff.ChangeDiffRequestProducer
import com.intellij.openapi.vfs.VirtualFile
import git4idea.repo.GitRepositoryManager

/**
 * Records the review anchor on both diff editors. The action itself reaches the popup menu
 * through the Diff.EditorPopupMenu group, which is the same group the built-in Annotate
 * action joins. A diff that carries no change sets no anchor, so the action is disabled.
 */
class ReviewDiffExtension : DiffExtension() {

    override fun onViewerCreated(viewer: FrameDiffTool.DiffViewer, context: DiffContext, request: DiffRequest) {
        if (viewer !is TwosideTextDiffViewer) return
        val project = context.project ?: return
        val change = request.getUserData(ChangeDiffRequestProducer.CHANGE_KEY) ?: return
        val file = change.virtualFile ?: change.afterRevision?.file?.virtualFile ?: return
        val repository = GitRepositoryManager.getInstance(project).getRepositoryForFileQuick(file) ?: return

        val facts = ChangeRevisionFacts(change, repository.currentRevision, repository.root.path)
        attach(viewer.editor1, DiffSide.LEFT, facts, repository.root)
        attach(viewer.editor2, DiffSide.RIGHT, facts, repository.root)
    }

    private fun attach(editor: Editor?, side: DiffSide, facts: RevisionFacts, root: VirtualFile) {
        if (editor == null) return
        editor.putUserData(REVIEW_ANCHOR, DiffAnchorResolver.resolve(facts, side))
        editor.putUserData(REVIEW_ROOT, root)
    }
}
