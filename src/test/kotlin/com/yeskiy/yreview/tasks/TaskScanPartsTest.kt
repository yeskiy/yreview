package com.yeskiy.yreview.tasks

import com.intellij.testFramework.fixtures.BasePlatformTestCase

/** The folder part and the outside part of the scan run at the same time. JUnit 3 finds a test by the prefix test. */
class TaskScanPartsTest : BasePlatformTestCase() {

    fun testTheFolderPartAndTheOutsidePartRunAtTheSameTime() {
        TaskScan.partDelay = 300
        try {
            val start = System.nanoTime()
            TaskScan.read(project, null)
            val millis = (System.nanoTime() - start) / 1_000_000
            assertTrue("the scan took $millis ms", millis < 550)
        } finally {
            TaskScan.partDelay = 0
        }
    }
}
