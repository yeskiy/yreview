package com.yeskiy.yreview.session

import java.nio.file.Path
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class ChannelServerTest {

    private val real = "E:/work/demo/channel/dist/main.js"

    private val always: (Path) -> Boolean = { true }

    private val never: (Path) -> Boolean = { false }

    @Test
    fun `an empty setting reports that nobody named a server`() {
        assertEquals(ChannelServer.Answer.NotSet, ChannelServer.locate("", always))
        assertEquals(ChannelServer.Answer.NotSet, ChannelServer.locate("   ", always))
    }

    @Test
    fun `a path that is a file is found`() {
        assertEquals(ChannelServer.Answer.Found(Path.of(real).toString()), ChannelServer.locate(real, always))
    }

    @Test
    fun `a path that is no file is missing`() {
        assertEquals(ChannelServer.Answer.Missing(real), ChannelServer.locate(real, never))
    }

    @Test
    fun `the setting loses the spaces around it`() {
        assertEquals(ChannelServer.Answer.Missing(real), ChannelServer.locate("  $real  ", never))
    }

    @Test
    fun `the settings page reports a path that is no file`() {
        val problem = ChannelServer.problem(real, never)

        assertNotNull(problem)
        assertTrue(problem.contains(real))
    }

    @Test
    fun `the settings page reports nothing for an empty field or a real file`() {
        assertNull(ChannelServer.problem("", never))
        assertNull(ChannelServer.problem(real, always))
    }

    @Test
    fun `the help text names the file the build writes`() {
        assertEquals("main.js", ChannelServer.FILE_NAME)
        assertTrue(ChannelServer.PATH_SHAPE.endsWith("channel/dist/main.js"))
    }
}
