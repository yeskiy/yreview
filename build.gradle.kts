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

tasks.test {
    useJUnitPlatform()
}
