package com.yeskiy.ideareview

import com.yeskiy.ideareview.store.ProcessGitRunner
import java.io.File
import java.nio.file.Files

class TempRepo : AutoCloseable {
    val dir: File = Files.createTempDirectory("idea-review-test").toFile()
    val git = ProcessGitRunner(dir)

    init {
        check(git.run("init", "-q").ok) { "git init failed" }
        check(git.run("config", "user.email", "test@example.com").ok)
        check(git.run("config", "user.name", "Test").ok)
    }

    fun commit(fileName: String, content: String): String {
        File(dir, fileName).writeText(content)
        check(git.run("add", fileName).ok)
        check(git.run("commit", "-q", "-m", "add $fileName").ok)
        return git.run("rev-parse", "HEAD").stdout.trim()
    }

    override fun close() {
        dir.deleteRecursively()
    }
}
