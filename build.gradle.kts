import org.gradle.process.ExecOperations
import org.jetbrains.intellij.platform.gradle.tasks.PrepareSandboxTask
import javax.inject.Inject

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

/**
 * Runs one npm command in the folder of a package.
 *
 * The build needs npm, because the plugin ships the channel server. A machine without npm
 * gets a message that names the reason, and not a process failure of the operating system.
 */
abstract class NpmTask : DefaultTask() {

    @get:Inject
    abstract val execOperations: ExecOperations

    @get:Internal
    abstract val packageDirectory: DirectoryProperty

    @get:Input
    abstract val arguments: ListProperty<String>

    @TaskAction
    fun run() {
        val npm = onPath() ?: throw GradleException(MISSING)
        execOperations.exec {
            commandLine(listOf(npm) + arguments.get())
            workingDir(packageDirectory.get().asFile)
        }
    }

    /** Every installer of Node writes npm to the PATH. Windows adds an extension to it. */
    private fun onPath(): String? =
        System.getenv("PATH").orEmpty()
            .split(File.pathSeparator)
            .filter { it.isNotBlank() }
            .flatMap { folder -> NAMES.map { File(folder, it) } }
            .firstOrNull { it.isFile }
            ?.absolutePath

    private companion object {
        val NAMES = listOf("npm.cmd", "npm.exe", "npm")

        const val MISSING = "npm was not found on the PATH. " +
            "The plugin ships the channel server, and npm writes that file. " +
            "Install Node, then start the build again."
    }
}

// The plugin reads this folder name in ChannelServer, and the session runs the file in it.
val channelFolder = "channel"

val channelDirectory = layout.projectDirectory.dir("channel")

val installChannel = tasks.register<NpmTask>("installChannel") {
    group = "build"
    description = "Installs the dependencies of the channel server."
    packageDirectory = channelDirectory
    arguments = listOf("ci")
    inputs.file(channelDirectory.file("package.json"))
    inputs.file(channelDirectory.file("package-lock.json"))
    // npm writes this file, and it goes away with the node_modules folder.
    outputs.file(channelDirectory.file("node_modules/.package-lock.json"))
}

val bundleChannel = tasks.register<NpmTask>("bundleChannel") {
    group = "build"
    description = "Writes the channel server as one file that the plugin ships."
    dependsOn(installChannel)
    packageDirectory = channelDirectory
    arguments = listOf("run", "bundle")
    inputs.dir(channelDirectory.dir("src"))
    inputs.file(channelDirectory.file("package.json"))
    inputs.file(channelDirectory.file("package-lock.json"))
    outputs.file(channelDirectory.file("bundle/main.mjs"))
}

/**
 * Puts the bundle in the folder of the plugin, beside the lib folder.
 *
 * Every sandbox comes from a task of this kind, and the plugin archive copies the folder
 * of the plugin from the sandbox of runIde. One rule therefore reaches all three places.
 */
tasks.withType<PrepareSandboxTask>().configureEach {
    from(bundleChannel) {
        into(pluginName.map { "$it/$channelFolder" })
    }
}

tasks.test {
    useJUnitPlatform()
    // The contract test runs the bundle, so the bundle must exist before the tests start.
    dependsOn(bundleChannel)
}
