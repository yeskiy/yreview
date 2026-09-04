package com.yeskiy.yreview

import java.io.File
import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * The platform picks an icon file by its name, and a missing name is a silent fallback.
 * A tool window without a 20x20 file shows a scaled 16x16 drawing in the New UI, and no
 * compiler reports that.
 */
class IconFilesTest {

    private val folder = File("src/main/resources/icons")

    private val names = listOf("yReviewComments", "yReviewSession")

    private val icons = folder.listFiles().orEmpty().filter { it.name.endsWith(".svg") }

    /** Every descriptor file, because an optional feature declares its window in its own file. */
    private val descriptors = File("src/main/resources/META-INF").listFiles().orEmpty()
        .filter { it.name.endsWith(".xml") }

    @Test
    fun `every tool window icon ships four files`() {
        names.forEach { name ->
            listOf("$name.svg", "${name}_dark.svg", "$name@20x20.svg", "$name@20x20_dark.svg").forEach {
                assertTrue(File(folder, it).isFile, "the New UI and Compact Mode both need a file: $it")
            }
        }
    }

    @Test
    fun `the action icon ships a light file and a dark file`() {
        listOf("yReviewAddComment.svg", "yReviewAddComment_dark.svg").forEach {
            assertTrue(File(folder, it).isFile, "an action icon needs both themes: $it")
        }
    }

    @Test
    fun `every icon declares the size its name promises`() {
        icons.forEach { file ->
            val expected = if (file.name.contains("@20x20")) "20" else "16"
            val text = file.readText()
            assertTrue(
                text.contains("width=\"$expected\"") && text.contains("height=\"$expected\""),
                "${file.name} must declare width and height $expected"
            )
        }
    }

    @Test
    fun `every icon uses the platform stroke color`() {
        icons.forEach { file ->
            val expected = if (file.name.contains("_dark")) "#CED0D6" else "#6C707E"
            assertTrue(
                file.readText().contains(expected, ignoreCase = true),
                "${file.name} must paint with $expected, so an active window repaints it correctly"
            )
        }
    }

    /**
     * The descriptor names an icon as a path, and the platform loads that path from the jar.
     * A name without a file gives a window with no drawing, and the log holds the only sign.
     */
    @Test
    fun `every icon the descriptor names ships both themes`() {
        val named = descriptors.flatMap { file ->
            Regex("icon=\"(/icons/[^\"]+[.]svg)\"").findAll(file.readText()).map { it.groupValues[1] }
        }.distinct()
        assertTrue(named.isNotEmpty(), "the descriptors must name at least one icon of the plugin")
        named.forEach { path ->
            val name = path.substringAfterLast('/').removeSuffix(".svg")
            listOf("$name.svg", "${name}_dark.svg").forEach {
                assertTrue(File(folder, it).isFile, "the descriptor names $path, so the folder needs $it")
            }
        }
    }

    /**
     * A tool window button repaints the icon in one contrast color when the window is active.
     * The button fills the path, and it drops a stroke, so a stroked drawing loses its shape.
     */
    @Test
    fun `no icon file carries a stroke attribute`() {
        icons.forEach { file ->
            assertFalse(
                file.readText().contains("stroke"),
                "${file.name} must draw one filled path, because the active button repaints the fill only"
            )
        }
    }
}
