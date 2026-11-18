package com.yeskiy.yreview.bench

import com.yeskiy.yreview.store.CommentBook
import com.yeskiy.yreview.store.FolderNotes
import com.yeskiy.yreview.store.FolderStore
import com.yeskiy.yreview.store.GitResult
import com.yeskiy.yreview.store.GitRunner
import com.yeskiy.yreview.store.NoteRefs
import com.yeskiy.yreview.store.NoteStore
import com.yeskiy.yreview.store.ProcessGitRunner
import com.yeskiy.yreview.store.Range
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.io.File
import java.io.RandomAccessFile
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicLong
import kotlin.random.Random

/** The sizes of the fixture. The defaults match a big real project. */
data class BenchSize(
    val modules: Int = 30,
    val packages: Int = 10,
    val filesPerPackage: Int = 10,
    val todoEvery: Int = 10,
    val rounds: Int = 5,
    val commentsPerRound: Int = 80,
    val changedPerRound: Int = 40,
    val dirtyFiles: Int = 20,
    val folderComments: Int = 50,
    val outsideFiles: Int = 20,
    val outsideComments: Int = 30,
)

/** A note store in memory. The fixture writes each note to git in one process at the end. */
class MemoryNotes : NoteStore {

    val notes = mutableMapOf<String, MutableMap<String, MutableList<String>>>()

    override fun readLines(ref: String, commit: String): List<String> = notes[ref]?.get(commit).orEmpty()

    override fun readOrRefuse(ref: String, commit: String): List<String> = readLines(ref, commit)

    override fun append(ref: String, commit: String, line: String) {
        notes.getOrPut(ref) { mutableMapOf() }.getOrPut(commit) { mutableListOf() }.add(line)
    }

    override fun rewrite(ref: String, commit: String, lines: List<String>) {
        notes.getOrPut(ref) { mutableMapOf() }[commit] = lines.toMutableList()
    }

    override fun commitsWithNotes(ref: String): List<String> = notes[ref]?.keys?.toList().orEmpty()

    override fun commitsOrRefuse(ref: String): List<String> = commitsWithNotes(ref)

    /** Writes every note with `git notes add -f -F`, one process per ref and commit. */
    fun writeTo(git: GitRunner, scratch: File) {
        notes.forEach { (ref, commits) ->
            commits.forEach { (commit, lines) ->
                val file = File(scratch, "note-${commit.take(12)}.txt").apply { writeText(lines.joinToString("\n", postfix = "\n")) }
                git.must("notes", "--ref", ref, "add", "-f", "-F", file.absolutePath, commit)
                file.delete()
            }
        }
    }
}

/** A git runner that counts its calls by command, for the parts that take a runner. */
class CountingGit(private val inner: GitRunner) : GitRunner {

    val calls = AtomicInteger()

    val nanos = AtomicLong()

    val commands = ConcurrentHashMap<String, AtomicInteger>()

    override fun run(vararg args: String): GitResult {
        val start = System.nanoTime()
        try {
            return inner.run(*args)
        } finally {
            nanos.addAndGet(System.nanoTime() - start)
            calls.incrementAndGet()
            commands.getOrPut(GitTrace.label(args.toList())) { AtomicInteger() }.incrementAndGet()
        }
    }

    fun reset() {
        calls.set(0)
        nanos.set(0)
        commands.clear()
    }

    fun summary(): String = "${calls.get()} git, ${nanos.get() / 1_000_000} ms (" +
        commands.entries.sortedBy { it.key }.joinToString { "${it.key} ${it.value.get()}" } + ")"
}

/** One top-level git process from the trace2 event stream. */
data class TracedGit(val sid: String, val argv: List<String>, val millis: Double)

/**
 * Reads the GIT_TRACE2_EVENT file that every git child of the test JVM appends to.
 * A child process of git has a "/" in its session id, so it counts under its parent.
 */
class GitTrace(private val file: File) {

    fun mark(): Long = file.length()

    fun since(mark: Long): List<TracedGit> {
        val text = RandomAccessFile(file, "r").use { raf ->
            raf.seek(mark)
            ByteArray((raf.length() - mark).toInt()).also { raf.readFully(it) }.toString(Charsets.UTF_8)
        }
        val events = text.lineSequence().mapNotNull { line -> runCatching { Json.parseToJsonElement(line).jsonObject }.getOrNull() }.toList()
        val starts = events.filter { it.text("event") == "start" && !it.text("sid").orEmpty().contains('/') }
        val ends = events.filter { it.text("event") == "exit" || it.text("event") == "atexit" }
            .groupBy { it.text("sid").orEmpty() }
            .mapValues { (_, list) -> list.maxOf { it["t_abs"]?.jsonPrimitive?.doubleOrNull ?: 0.0 } }
        return starts.map { start ->
            val sid = start.text("sid").orEmpty()
            TracedGit(sid, start["argv"]?.jsonArray?.map { it.jsonPrimitive.content }.orEmpty().drop(1), (ends[sid] ?: 0.0) * 1000)
        }
    }

    private fun JsonObject.text(key: String): String? = this[key]?.jsonPrimitive?.contentOrNull

    companion object {

        fun fromEnv(): GitTrace? = System.getenv("GIT_TRACE2_EVENT")?.takeIf { it.isNotBlank() }?.let { GitTrace(File(it)) }

        /** The git command word, which is the first argument that is no option and no "-c" value. */
        fun label(args: List<String>): String =
            args.filterIndexed { i, arg -> !arg.startsWith("-") && args.getOrNull(i - 1) != "-c" }.firstOrNull() ?: "?"

        fun summary(list: List<TracedGit>): String = "${list.size} git, ${list.sumOf { it.millis }.toLong()} ms in git (" +
            list.groupBy { label(it.argv) }.entries.sortedBy { it.key }.joinToString { "${it.key} ${it.value.size}" } + ")"
    }
}

fun GitRunner.must(vararg args: String): String =
    run(*args).also { check(it.ok) { "git ${args.joinToString(" ")} failed: ${it.stderr}" } }.stdout

/** Builds the fixture on disk. Every path that it returns is a full path with forward slashes. */
class BenchFixture(val base: File, private val size: BenchSize = BenchSize()) {

    val work = File(base, "work")

    val repo = File(work, "repo")

    val loose = File(work, "loose")

    val outside = File(base, "outside")

    val home = File(base, "home")

    val heads = mutableListOf<String>()

    val sourceFiles = mutableListOf<String>()

    private val random = Random(SEED)

    private fun runner(dir: File): GitRunner = ProcessGitRunner(dir, checkCanceled = {})

    fun build() {
        listOf(repo, loose, outside, home).forEach { it.mkdirs() }
        buildRepository()
        buildFolderStore()
        buildOutside()
    }

    private fun init(dir: File): GitRunner = runner(dir).also { git ->
        git.must("init", "-q", "-b", "main")
        git.must("config", "user.email", "bench@example.com")
        git.must("config", "user.name", "Bench")
        git.must("config", "core.autocrlf", "false")
        git.must("config", "gc.auto", "0")
    }

    private fun buildRepository() {
        val git = init(repo)
        (0 until size.modules).forEach { m ->
            (0 until size.packages).forEach { p ->
                (0 until size.filesPerPackage).forEach { f ->
                    val n = sourceFiles.size
                    val path = "src/m$m/p$p/F$f.txt"
                    File(repo, path).apply { parentFile.mkdirs() }.writeText(source(path, n))
                    sourceFiles += path
                }
            }
        }
        git.must("add", "-A")
        git.must("commit", "-q", "-m", "initial")
        val notes = MemoryNotes()
        val book = CommentBook(notes, author = "bench")
        (1..size.rounds).forEach { round ->
            if (round > 1) {
                sourceFiles.shuffled(random).take(size.changedPerRound).forEach { insertTop(File(repo, it), round) }
                git.must("add", "-A")
                git.must("commit", "-q", "-m", "round $round")
            }
            val head = git.must("rev-parse", "HEAD").trim().also { heads += it }
            repeat(size.commentsPerRound) { k ->
                val path = sourceFiles[random.nextInt(sourceFiles.size)]
                val line = 5 + random.nextInt(30)
                val text = File(repo, path).readLines()[line - 1]
                val ref = if (k % 5 < 3) NoteRefs.LOCAL else NoteRefs.DISCUSS
                book.add(ref, head, path, Range(startLine = line, endLine = line), "bench comment $round.$k", text.takeIf { k % 2 == 0 })
            }
        }
        notes.writeTo(git, base)
        sourceFiles.shuffled(random).take(size.dirtyFiles).forEach { insertTop(File(repo, it), 99) }
    }

    private fun buildFolderStore() {
        val book = CommentBook(FolderNotes(work.toPath()), author = "bench")
        (0 until size.folderComments).forEach { i ->
            val path = "loose/L$i.txt"
            File(work, path).writeText((1..20).joinToString("\n", postfix = "\n") { "loose line $it of $i" })
            book.add(NoteRefs.LOCAL, FolderStore.WORKTREE, path, Range(startLine = 3, endLine = 3), "folder comment $i")
        }
    }

    private fun buildOutside() {
        val git = init(outside)
        (0 until size.outsideFiles).forEach { i ->
            File(outside, "O$i.txt").writeText((1..30).joinToString("\n", postfix = "\n") { "outside line $it of $i" } + "TODO outside $i\n")
        }
        git.must("add", "-A")
        git.must("commit", "-q", "-m", "outside")
        val head = git.must("rev-parse", "HEAD").trim()
        val notes = MemoryNotes()
        val book = CommentBook(notes, author = "bench")
        (0 until size.outsideComments).forEach { i ->
            book.add(NoteRefs.LOCAL, head, "O${i % 3}.txt", Range(startLine = 2 + i % 20, endLine = 2 + i % 20), "outside comment $i")
        }
        notes.writeTo(git, base)
    }

    /** Forty lines, and a TODO line in every tenth file. */
    private fun source(path: String, n: Int): String =
        (1..LINES).joinToString("\n", postfix = "\n") { line ->
            if (line == TODO_LINE && n % size.todoEvery == 0) "TODO bench item $n in $path" else "line $line of $path"
        }

    private fun insertTop(file: File, round: Int) {
        file.writeText("inserted $round a\ninserted $round b\ninserted $round c\n" + file.readText())
    }

    companion object {
        const val SEED = 20261118

        const val LINES = 40

        const val TODO_LINE = 20
    }
}
