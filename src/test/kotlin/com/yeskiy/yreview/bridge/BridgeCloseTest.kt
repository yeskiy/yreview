package com.yeskiy.yreview.bridge

import com.intellij.testFramework.fixtures.BasePlatformTestCase
import java.nio.file.Files

/**
 * What a start of the bridge does after the project closed.
 *
 * A start runs on a pooled thread, so a caller can queue one just before the project
 * closes. Such a start must open no port and write no file. A file that names a project
 * which is gone stays on the disk until the IDE exits, and a session of another project
 * would then send its comments to a bridge that belongs to nothing.
 *
 * Each test builds a bridge of its own. The fixture of the platform hands every light test
 * one project, so a close of the bridge that the project holds would reach every later
 * test of the run.
 *
 * Every method name starts with the word test, because the fixtures of the platform are
 * JUnit 3 classes and that framework finds a test by this prefix.
 */
class BridgeCloseTest : BasePlatformTestCase() {

    private var bridge: BridgeService? = null

    override fun tearDown() {
        try {
            bridge?.stop()
            Files.deleteIfExists(discoveryFile())
        } finally {
            super.tearDown()
        }
    }

    fun `test a start that runs after the close opens no port`() {
        val closed = bridge()
        closed.dispose()

        assertNull("a project that closed must open no port", closed.start())
        assertNull("a project that closed must name no address", closed.address)
    }

    fun `test a start that runs after the close writes no file for a session`() {
        val closed = bridge()
        Files.deleteIfExists(discoveryFile())
        closed.dispose()

        closed.start()

        assertFalse(
            "a project that closed must leave no file that names its bridge",
            Files.exists(discoveryFile()),
        )
    }

    fun `test a start before the close still opens a port`() {
        assertNotNull("a project that is open must reach its bridge", bridge().start())
    }

    private fun bridge(): BridgeService = BridgeService(project).also { bridge = it }

    private fun discoveryFile() = DiscoveryFile.forProject(project.basePath!!).path
}
