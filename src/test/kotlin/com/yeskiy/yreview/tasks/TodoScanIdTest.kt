package com.yeskiy.yreview.tasks

import com.intellij.openapi.command.WriteCommandAction
import com.intellij.psi.PsiDocumentManager
import com.intellij.psi.search.PsiTodoSearchHelper
import com.intellij.testFramework.fixtures.BasePlatformTestCase

/**
 * The scan gives each TODO item of a real file its identifier.
 *
 * Every method name starts with the word test, because the fixtures of the platform are
 * JUnit 3 classes and that framework finds a test by this prefix.
 */
class TodoScanIdTest : BasePlatformTestCase() {

    fun `test two todo items on one line get two identifiers`() {
        myFixture.configureByText("Main.java", "/* TODO: a */ /* TODO: a */ /* TODO: b */\nclass Main {}\n")

        val found = scan()

        assertEquals(3, found.size)
        assertEquals(3, found.map { it.id }.distinct().size)
        assertTrue(found.all { it.startLine == 1 })
    }

    fun `test new lines above a todo item keep its identifier`() {
        myFixture.configureByText("Main.java", "class Main {}\n// TODO: drop this\n")
        val before = scan().single()

        WriteCommandAction.runWriteCommandAction(project) {
            myFixture.editor.document.insertString(0, "import java.util.List;\nimport java.util.Map;\n")
        }
        PsiDocumentManager.getInstance(project).commitAllDocuments()
        val after = scan().single()

        assertEquals(2, before.startLine)
        assertEquals(4, after.startLine)
        assertEquals(before.id, after.id)
    }

    private fun scan(): List<ReviewTask> {
        val root = myFixture.file.virtualFile.parent
        return TaskScan.fileTodos(
            PsiTodoSearchHelper.getInstance(project),
            myFixture.file,
            root,
            listOf(root.path),
            "worktree",
            "",
        )
    }
}
