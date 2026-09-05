import org.jetbrains.intellij.platform.gradle.TestFrameworkType
import org.jetbrains.intellij.platform.gradle.tasks.PrepareSandboxTask

plugins {
    kotlin("jvm") version "2.4.10"
    kotlin("plugin.serialization") version "2.4.10"
    id("org.jetbrains.intellij.platform")
    id("org.jetbrains.changelog") version "2.5.0"
}

group = "com.yeskiy"
version = providers.gradleProperty("pluginVersion").get()

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
        // The platform fixtures build a project in memory, so a test reads a real tab.
        testFramework(TestFrameworkType.Platform)
    }
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.11.0")
    testImplementation(kotlin("test"))
    // The test framework of the platform brings no JUnit. BasePlatformTestCase extends
    // junit.framework.TestCase, and this artifact holds that class.
    testImplementation("junit:junit:4.13.2")
    // The fixtures of the platform are JUnit 3 classes, and the rest of the suite is
    // JUnit 5. This engine runs the older classes, so one run holds both kinds.
    testRuntimeOnly("org.junit.vintage:junit-vintage-engine:5.10.1")
}

kotlin {
    jvmToolchain(25)
}

intellijPlatform {
    pluginConfiguration {
        id = "com.yeskiy.yreview"
        name = "Yreview"
        version = project.version.toString()
        ideaVersion {
            sinceBuild = "262"
        }
    }

    pluginVerification {
        ides {
            recommended()
        }
    }

    // The signer and the verifier both read the certificate chain from this file.
    //
    // A chain that stands in the CERTIFICATE_CHAIN variable reaches verifyPluginSignature
    // twice. The task writes it to a temporary file, passes that path after -cert, and then
    // passes the chain itself as one more argument. That argument starts with a hyphen, so
    // the argument parser of the signer reads it as a flag and answers "Invalid argument".
    // A chain in a file reaches the task once, and the verify step then runs.
    //
    // With the variable unset the file stays absent, the plugin falls back to
    // CERTIFICATE_CHAIN, and a build with no secret skips the signing tasks as before.
    signing {
        certificateChainFile =
            layout.projectDirectory.file(providers.environmentVariable("CERTIFICATE_CHAIN_FILE"))
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
