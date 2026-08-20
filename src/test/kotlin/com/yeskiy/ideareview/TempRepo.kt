package com.yeskiy.ideareview

import com.yeskiy.ideareview.store.ProcessGitRunner
import java.io.File
import java.nio.file.Files

class TempRepo : AutoCloseable {
    val dir: File = Files.createTempDirectory("idea-review-test").toFile()
    val git = ProcessGitRunner(dir)
    private val remotes = mutableListOf<File>()

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

    /** Builds a bare repository in a temporary folder and registers it as the named remote. */
    fun addRemote(name: String = "origin"): File {
        val remote = Files.createTempDirectory("idea-review-remote").toFile()
        remotes.add(remote)
        check(ProcessGitRunner(remote).run("init", "-q", "--bare").ok) { "git init --bare failed" }
        check(git.run("remote", "add", name, remote.absolutePath.replace('\\', '/')).ok)
        return remote
    }

    override fun close() {
        dir.deleteRecursively()
        remotes.forEach { it.deleteRecursively() }
    }
}
