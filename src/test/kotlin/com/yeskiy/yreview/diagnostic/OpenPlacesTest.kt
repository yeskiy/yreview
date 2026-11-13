package com.yeskiy.yreview.diagnostic

import com.intellij.testFramework.fixtures.BasePlatformTestCase

/**
 * A report can come from a dialog that names no project. The folder of each open project
 * must still go out of the text. JUnit 3 finds a test by the prefix test.
 */
class OpenPlacesTest : BasePlatformTestCase() {

    fun testTheOpenProjectIsAPlace() {
        val base = project.basePath!!.replace('\\', '/')

        assertTrue(OpenPlaces.projects().map { it.replace('\\', '/') }.contains(base))
    }

    fun testATextWithNoNamedProjectLosesTheOpenProject() {
        val base = project.basePath!!.replace('\\', '/')

        val text = Redact.text("the write failed in $base/src/a.kt", emptyList(), null)

        assertFalse(text, text.contains(base))
        assertTrue(text, text.contains("${Redact.PROJECT_MARK}/src/a.kt"))
    }
}
