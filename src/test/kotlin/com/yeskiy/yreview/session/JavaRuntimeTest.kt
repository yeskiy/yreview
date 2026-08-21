package com.yeskiy.yreview.session

import java.nio.file.Path
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class JavaRuntimeTest {

    private val home = "C:/Program Files/JetBrains/jbr"

    @Test
    fun `the launcher sits in the bin folder of the runtime`() {
        val windows = Path.of(home, "bin", "java.exe")

        assertEquals(windows.toString(), JavaRuntime.of(JavaRuntime.candidates(home)) { it == windows })
    }

    @Test
    fun `the search asks for both file names`() {
        val candidates = JavaRuntime.candidates(home)

        assertEquals(2, candidates.size)
        assertTrue(candidates.any { it.fileName.toString() == "java.exe" })
        assertTrue(candidates.any { it.fileName.toString() == "java" })
    }

    @Test
    fun `a folder without a launcher answers nothing`() {
        assertNull(JavaRuntime.of(JavaRuntime.candidates(home)) { false })
    }

    @Test
    fun `no home folder answers nothing`() {
        assertEquals(emptyList(), JavaRuntime.candidates(null))
        assertNull(JavaRuntime.locate(home = null))
    }

    @Test
    fun `the running IDE always names its own runtime`() {
        // This test runs on a Java runtime, so the search must find the launcher of it.
        val found = JavaRuntime.locate()

        assertTrue(found != null && found.isNotBlank(), "the search found no launcher at ${System.getProperty(JavaRuntime.HOME_PROPERTY)}")
    }
}
