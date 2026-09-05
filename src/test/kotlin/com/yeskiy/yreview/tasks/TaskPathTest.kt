package com.yeskiy.yreview.tasks

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * A note record comes from another person, so the path inside it can hold a step that
 * climbs out of the repository. A task opens no file outside the root of its own note.
 */
class TaskPathTest {

    private val root = "E:/work/demo-repo"

    @Test
    fun `a file of the repository stands under the root`() {
        assertTrue(TaskPath.isUnder(root, "$root/src/main/Parser.kt"))
        assertTrue(TaskPath.isUnder(root, "$root/README.md"))
    }

    @Test
    fun `a path that climbs out of the root stands outside`() {
        assertFalse(TaskPath.isUnder(root, "$root/../secret.txt"))
        assertFalse(TaskPath.isUnder(root, "$root/../../../../Windows/win.ini"))
        assertFalse(TaskPath.isUnder(root, "$root/src/../../secret.txt"))
    }

    @Test
    fun `a climb that comes back stays under the root`() {
        assertTrue(TaskPath.isUnder(root, "$root/src/../src/Parser.kt"))
    }

    @Test
    fun `the root itself is no file of a task`() {
        assertFalse(TaskPath.isUnder(root, root))
        assertFalse(TaskPath.isUnder(root, "$root/"))
    }

    @Test
    fun `a path of another disk stands outside`() {
        assertFalse(TaskPath.isUnder(root, "C:/Windows/win.ini"))
        assertFalse(TaskPath.isUnder(root, "/etc/passwd"))
    }

    @Test
    fun `a name that only starts like the root stands outside`() {
        assertFalse(TaskPath.isUnder(root, "E:/work/demo-repo-other/Parser.kt"))
    }

    @Test
    fun `a root that names nothing holds no file`() {
        assertFalse(TaskPath.isUnder("", "E:/work/demo-repo/Parser.kt"))
    }

    @Test
    fun `both separators name one path`() {
        assertTrue(TaskPath.isUnder("""E:\work\demo-repo""", """E:\work\demo-repo\src\Parser.kt"""))
    }

    @Test
    fun `a posix path keeps the separator it starts with`() {
        assertEquals("/home/alice/repo", TaskPath.resolve("/home/alice/./repo/"))
        assertTrue(TaskPath.isUnder("/home/alice/repo", "/home/alice/repo/src/Parser.kt"))
        assertFalse(TaskPath.isUnder("/home/alice/repo", "/home/alice/repo/../secret.txt"))
    }

    @Test
    fun `a climb over the top of a path leaves nothing`() {
        assertEquals("", TaskPath.resolve("E:/../.."))
        assertEquals("", TaskPath.resolve(".."))
        assertFalse(TaskPath.isUnder("E:/../..", "E:/work/demo-repo/Parser.kt"))
    }
}
