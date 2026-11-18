package com.yeskiy.yreview.tasks

import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.testFramework.LightVirtualFile
import com.intellij.testFramework.fixtures.BasePlatformTestCase
import com.yeskiy.yreview.store.AnchorResult
import com.yeskiy.yreview.store.FolderStore
import com.yeskiy.yreview.store.ReviewAnchor
import com.yeskiy.yreview.store.StoreKind
import java.io.File
import java.nio.file.Files

/** The open files outside the project, grouped by their store root. JUnit 3 finds a test by the prefix test. */
class OutsideRootsTest : BasePlatformTestCase() {

    private val folders = mutableListOf<File>()

    override fun tearDown() {
        try {
            folders.forEach { it.deleteRecursively() }
        } finally {
            super.tearDown()
        }
    }

    private fun folder(): File = Files.createTempDirectory("y-review-outside").toFile().also { folders.add(it) }

    private fun vfs(file: File): VirtualFile = LocalFileSystem.getInstance().refreshAndFindFileByIoFile(file)!!

    private fun write(dir: File, name: String): VirtualFile =
        vfs(File(dir, name).also { it.parentFile.mkdirs(); it.writeText("x\n") })

    /** A fake resolver: each file of [roots] gets the store of its root, every other file gets no place. */
    private fun anchors(vararg roots: Pair<VirtualFile, StoreKind>): (VirtualFile) -> AnchorResult = { file ->
        roots.firstOrNull { (root, _) -> file.path.startsWith(root.path + "/") }
            ?.let { (root, kind) ->
                val key = if (kind == StoreKind.GIT) "a".repeat(40) else FolderStore.WORKTREE
                AnchorResult.Found(ReviewAnchor(kind, root, key, file.path.removePrefix(root.path + "/")))
            }
            ?: AnchorResult.NoPlace
    }

    fun testAFileUnderAnInsideRootGivesNoOutsideRoot() {
        val inside = vfs(folder())
        val file = write(File(inside.path), "a/f.txt")

        val found = OutsideRoots.of(listOf(file), listOf(inside.path), anchors(inside to StoreKind.FOLDER), null)

        assertEquals(emptyList<OutsideRoot>(), found)
    }

    fun testTwoLooseFilesOfOneStoreGiveOneRootWithTwoFiles() {
        val store = vfs(folder())
        val one = write(File(store.path), "one.txt")
        val two = write(File(store.path), "b/two.txt")

        val found = OutsideRoots.of(listOf(one, two), emptyList(), anchors(store to StoreKind.FOLDER), null)

        assertEquals(1, found.size)
        assertEquals(store.path, found[0].root)
        assertEquals(StoreKind.FOLDER, found[0].kind)
        assertEquals(FolderStore.WORKTREE, found[0].commit)
        assertEquals(listOf(one, two), found[0].files)
    }

    fun testAFileOfARepositoryOutsideGivesAGitRootWithItsLabel() {
        val repository = vfs(folder())
        val file = write(File(repository.path), "f.txt")
        val home = repository.parent.path

        val found = OutsideRoots.of(listOf(file), emptyList(), anchors(repository to StoreKind.GIT), home)

        assertEquals(1, found.size)
        assertEquals(StoreKind.GIT, found[0].kind)
        assertEquals("a".repeat(40), found[0].commit)
        assertEquals("${repository.name} (~/${repository.name})", found[0].label)
    }

    fun testAFileThatTheResolverRefusesGivesNothing() {
        val file = write(folder(), "f.txt")

        assertEquals(emptyList<OutsideRoot>(), OutsideRoots.of(listOf(file), emptyList(), { AnchorResult.HomeFile }, null))
    }

    fun testAFileThatIsNotOnTheLocalDiskGivesNothing() {
        val file = LightVirtualFile("f.txt", "x\n")

        val found = OutsideRoots.of(listOf(file), emptyList(), { error("no resolve for a light file") }, null)

        assertEquals(emptyList<OutsideRoot>(), found)
    }

    fun testTheRootsComeSortedByRootAndAFileCountsOnce() {
        val first = vfs(folder())
        val second = vfs(folder())
        val (low, high) = listOf(first, second).sortedBy { it.path }
        val a = write(File(high.path), "a.txt")
        val b = write(File(low.path), "b.txt")

        val found = OutsideRoots.of(
            listOf(a, b, a),
            emptyList(),
            anchors(low to StoreKind.FOLDER, high to StoreKind.FOLDER),
            null,
        )

        assertEquals(listOf(low.path, high.path), found.map { it.root })
        assertEquals(listOf(listOf(b), listOf(a)), found.map { it.files })
    }

    private val todo = TodoRule("\\btodo\\b.*", Regex("\\btodo\\b.*", RegexOption.IGNORE_CASE))

    fun testTheTextReaderGivesOneItemForEachTodoLine() {
        val hits = TodoLines.of("first\nTODO fix this \r\n  todo: two\r", listOf(todo))

        assertEquals(listOf(TodoLine(2, 0, "TODO fix this", todo.rule), TodoLine(3, 2, "todo: two", todo.rule)), hits)
    }

    fun testTheTextReaderEndsAPartAfterACommentCloser() {
        val hits = TodoLines.of("/* TODO: a */ /* TODO: b */", listOf(todo))

        assertEquals(listOf("TODO: a", "TODO: b"), hits.map { it.text })
    }

    fun testTheTextReaderDropsAMatchInsideAnEarlierMatch() {
        val fixme = TodoRule("\\bfixme\\b.*", Regex("\\bfixme\\b.*", RegexOption.IGNORE_CASE))

        val hits = TodoLines.of("// TODO a FIXME b", listOf(fixme, todo))

        assertEquals(listOf(TodoLine(1, 3, "TODO a FIXME b", todo.rule)), hits)
    }
}
