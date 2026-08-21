package com.yeskiy.yreview.tasks

import com.intellij.psi.PsiTreeChangeEvent
import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * The property signals the review tree reads the scope again for.
 *
 * The bundled TODO view acts on four properties and drops two. These tests hold the same
 * four, so a later edit cannot put the two dropped properties back without a red test.
 */
class SourceSignalTest {

    @Test
    fun `a new set of source roots asks for a read`() {
        assertTrue(SourceSignal.readAgain(PsiTreeChangeEvent.PROP_ROOTS))
    }

    @Test
    fun `a file that changed its write permission asks for a read`() {
        assertTrue(SourceSignal.readAgain(PsiTreeChangeEvent.PROP_WRITABLE))
    }

    @Test
    fun `a file with a new name asks for a read`() {
        assertTrue(SourceSignal.readAgain(PsiTreeChangeEvent.PROP_FILE_NAME))
    }

    @Test
    fun `a folder with a new name asks for a read`() {
        assertTrue(SourceSignal.readAgain(PsiTreeChangeEvent.PROP_DIRECTORY_NAME))
    }

    @Test
    fun `a cache of files the platform dropped asks for no read`() {
        assertFalse(SourceSignal.readAgain(PsiTreeChangeEvent.PROP_UNLOADED_PSI))
    }

    @Test
    fun `a change of the file types asks for no read`() {
        assertFalse(SourceSignal.readAgain(PsiTreeChangeEvent.PROP_FILE_TYPES))
    }

    @Test
    fun `a signal with no property name asks for no read`() {
        assertFalse(SourceSignal.readAgain(null))
    }

    @Test
    fun `a property the platform adds later asks for no read`() {
        assertFalse(SourceSignal.readAgain("propSomethingNew"))
    }
}
