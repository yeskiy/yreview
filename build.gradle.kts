import org.jetbrains.intellij.platform.gradle.tasks.PrepareSandboxTask

plugins {
    kotlin("jvm") version "2.4.10"
    kotlin("plugin.serialization") version "2.4.10"
    id("org.jetbrains.intellij.platform")
}

group = "com.yeskiy"
version = "0.1.0"

repositories {
    mavenCentral()
    intellijPlatform {
        defaultRepositories()
    }
}

dependencies {
    intellijPlatform {
        intellijIdeaUltimate("2026.2.1")
        bundledPlugin("Git4Idea")
        bundledPlugin("com.intellij.mcpServer")
        bundledPlugin("org.jetbrains.plugins.terminal")
        // Git4Idea alone does not put these on the compile classpath.
        // intellij.platform.vcs.impl holds ChangeDiffRequestProducer.
        // intellij.platform.vcs.dvcs.impl holds AbstractRepositoryManager, a supertype
        // of GitRepositoryManager, so without it every repository lookup fails to resolve.
        bundledModule("intellij.platform.vcs.impl")
        bundledModule("intellij.platform.vcs.dvcs")
        bundledModule("intellij.platform.vcs.dvcs.impl")
        // intellij.platform.collaborationTools holds icons.CollaborationToolsIcons,
        // the speech bubble that the bundled pull request plugins paint in the gutter.
        bundledModule("intellij.platform.collaborationTools")
        // intellij.terminal.frontend holds TerminalToolWindowTabsManager and TerminalView,
        // the reworked terminal engine that the session window runs on.
        bundledModule("intellij.terminal.frontend")
    }
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.11.0")
    testImplementation(kotlin("test"))
}

kotlin {
    jvmToolchain(25)
}

intellijPlatform {
    pluginConfiguration {
        id = "com.yeskiy.yreview"
        name = "Y Review"
        version = project.version.toString()
        ideaVersion {
            sinceBuild = "262"
        }
    }
}

// --- The channel server ---

// The plugin reads this folder name in ChannelServer, and the session runs the jar in it.
val channelFolder = "channel"

/** The jar of the channel-server module. It holds the server and every class under it. */
val channelServerParts = configurations.dependencyScope("channelServerParts")

val channelServer = configurations.resolvable("channelServer") {
    extendsFrom(channelServerParts.get())
}

dependencies {
    add(channelServerParts.name, project(mapOf("path" to ":channel-server", "configuration" to "channelServer")))
}

/**
 * Puts the jar in the folder of the plugin, beside the lib folder.
 *
 * Every sandbox comes from a task of this kind, and the plugin archive copies the folder
 * of the plugin from the sandbox of runIde. One rule therefore reaches all three places.
 */
tasks.withType<PrepareSandboxTask>().configureEach {
    from(channelServer.get()) {
        into(pluginName.map { "$it/$channelFolder" })
    }
}

tasks.test {
    useJUnitPlatform()
    // Two tests read the real jar, so the jar must exist before the tests start.
    inputs.files(channelServer.get())
    systemProperty(
        "y.review.channel.jar",
        layout.projectDirectory.file("channel-server/build/channel/y-review-channel.jar").asFile.absolutePath,
    )
}
