plugins {
    kotlin("jvm")
    kotlin("plugin.serialization")
}

repositories {
    mavenCentral()
}

/**
 * The channel server runs in a process of its own, and that process holds no class of the
 * IDE. Every class it needs therefore travels inside one jar. Ktor stays out, because a
 * server that speaks over standard input and standard output loads no Ktor class.
 */
dependencies {
    implementation("io.modelcontextprotocol:kotlin-sdk-server:0.15.0") {
        exclude(group = "io.ktor")
    }
    implementation(kotlin("stdlib"))
    // The Model Context Protocol library writes through kotlin-logging. This provider drops
    // every record, so no log file can ever hold the bridge token.
    runtimeOnly("org.slf4j:slf4j-nop:2.0.17")
    testImplementation(kotlin("test"))
    testImplementation("io.modelcontextprotocol:kotlin-sdk-client:0.15.0") {
        exclude(group = "io.ktor")
    }
    testImplementation("io.modelcontextprotocol:kotlin-sdk-testing:0.15.0") {
        exclude(group = "io.ktor")
    }
}

kotlin {
    jvmToolchain(25)
}

val mainClassName = "com.yeskiy.yreview.channel.MainKt"

/** One file holds the server and every class under it, so one classpath entry runs it. */
val channelJar = tasks.register<Jar>("channelJar") {
    group = "build"
    description = "Writes the channel server and its libraries as one jar."
    archiveFileName = "y-review-channel.jar"
    destinationDirectory = layout.buildDirectory.dir("channel")
    duplicatesStrategy = DuplicatesStrategy.EXCLUDE
    manifest { attributes("Main-Class" to mainClassName) }
    from(sourceSets.main.get().output)
    from(
        configurations.runtimeClasspath.map { classpath ->
            classpath.map { if (it.isDirectory) it else zipTree(it) }
        },
    )
    // A merged jar keeps no signature of a single library, and it declares no module.
    exclude("META-INF/*.SF", "META-INF/*.DSA", "META-INF/*.RSA", "META-INF/INDEX.LIST")
    exclude("META-INF/versions/**", "module-info.class")
}

tasks.build {
    dependsOn(channelJar)
}

tasks.test {
    useJUnitPlatform()
}

/** The plugin build reads this to place the jar beside the lib folder of the plugin. */
configurations.consumable("channelServer")

artifacts {
    add("channelServer", channelJar)
}
