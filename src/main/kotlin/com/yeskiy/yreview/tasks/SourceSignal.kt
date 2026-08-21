package com.yeskiy.yreview.tasks

import com.intellij.psi.PsiTreeChangeEvent

/**
 * The signals of the source files that ask the review tree to read its scope again.
 *
 * The platform sends a signal for every change of a file, and it sends two more that name
 * no file at all. The bundled TODO view drops those two, and this object drops them too.
 */
object SourceSignal {

    /**
     * True when a property signal asks for a new read of the scope.
     *
     * A read loads the file of every task, and the platform drops those files again when it
     * needs the memory. The platform reports that drop as [PsiTreeChangeEvent.PROP_UNLOADED_PSI],
     * so a tab that reads the scope for that property starts its own next read. The property
     * [PsiTreeChangeEvent.PROP_FILE_TYPES] arrives a second time through the file type
     * listener of the tab, so the tab reads the scope once and not twice.
     */
    fun readAgain(property: String?): Boolean = property in WATCHED

    private val WATCHED = setOf(
        PsiTreeChangeEvent.PROP_ROOTS,
        PsiTreeChangeEvent.PROP_WRITABLE,
        PsiTreeChangeEvent.PROP_FILE_NAME,
        PsiTreeChangeEvent.PROP_DIRECTORY_NAME,
    )
}
