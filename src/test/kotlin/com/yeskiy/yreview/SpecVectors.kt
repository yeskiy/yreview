package com.yeskiy.yreview

import com.yeskiy.yreview.bridge.DiscoveryFile
import com.yeskiy.yreview.diagnostic.Redact
import com.yeskiy.yreview.handoff.HandoffPlace
import com.yeskiy.yreview.session.AgentCatalog
import com.yeskiy.yreview.session.McpRoute
import com.yeskiy.yreview.session.Naming
import com.yeskiy.yreview.store.CommentJson
import com.yeskiy.yreview.store.GitResult
import com.yeskiy.yreview.store.GitRunner
import com.yeskiy.yreview.store.NotesGateway
import com.yeskiy.yreview.store.StoreKind
import com.yeskiy.yreview.store.id
import com.yeskiy.yreview.tasks.HandleKey
import com.yeskiy.yreview.tasks.HandleMatch
import com.yeskiy.yreview.tasks.ReviewTask
import com.yeskiy.yreview.tasks.TaskHandles
import com.yeskiy.yreview.tasks.TaskIds
import com.yeskiy.yreview.tasks.TaskKind
import com.yeskiy.yreview.tasks.TodoIds
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.nio.file.Path

/** Computes the outputs of each case of `spec/vectors/`. The writer and the test share it. */
internal object SpecVectors {

    val DIR: Path = Path.of("spec", "vectors")

    val json = Json { prettyPrint = true }

    fun strings(values: List<String>) = JsonArray(values.map { JsonPrimitive(it) })

    // --- records.json ---

    fun record(name: String, line: String): JsonObject {
        val comment = runCatching { CommentJson.decode(line) }.getOrNull()
        return buildJsonObject {
            put("name", name)
            put("line", line)
            put("canonical", comment?.let { CommentJson.encode(it) })
            put("id", comment?.id())
        }
    }

    // --- todo-ids.json ---

    fun repositoryOf(basePath: String?, rootPath: String) = buildJsonObject {
        put("basePath", basePath)
        put("rootPath", rootPath)
        put("repository", TodoIds.repositoryOf(basePath, rootPath))
    }

    fun normal(text: String) = buildJsonObject {
        put("text", text)
        put("normal", TaskIds.normalTodoText(text))
    }

    fun forTodo(repository: String, path: String, text: String, order: Int) = buildJsonObject {
        put("repository", repository)
        put("path", path)
        put("text", text)
        put("order", order)
        put("id", TaskIds.forTodo(repository, path, text, order))
    }

    fun assign(repository: String, path: String, texts: List<String>) = buildJsonObject {
        put("repository", repository)
        put("path", path)
        put("texts", strings(texts))
        put("ids", strings(TodoIds.assign(repository, texts.mapIndexed { index, text -> todo(path, text, index + 1) }).map { it.id }))
    }

    fun legacy(path: String, line: Int) = buildJsonObject {
        put("path", path)
        put("line", line)
        put("id", TaskIds.legacyTodo(path, line))
    }

    private fun todo(path: String, text: String, line: Int) =
        ReviewTask(id = "", kind = TaskKind.TODO, path = path, startLine = line, endLine = line, text = text)

    // --- handles.json and match.json ---

    fun handle(id: String) = buildJsonObject {
        put("id", id)
        put("handle", TaskHandles.of(id))
    }

    fun keyOf(text: String) = buildJsonObject {
        put("text", text)
        put("key", keyJson(TaskHandles.keyOf(text)))
    }

    fun match(name: String, text: String, ids: List<String>) = buildJsonObject {
        put("name", name)
        put("text", text)
        put("ids", strings(ids))
        put("result", TaskHandles.keyOf(text)?.let { matchJson(TaskHandles.match(it, ids)) } ?: JsonNull)
    }

    private fun keyJson(key: HandleKey?): JsonElement = when (key) {
        null -> JsonNull
        is HandleKey.Exact -> buildJsonObject { put("kind", "exact"); put("id", key.id) }
        is HandleKey.CommentPrefix -> buildJsonObject { put("kind", "comment"); put("prefix", key.prefix) }
        is HandleKey.TodoPrefix -> buildJsonObject { put("kind", "todo"); put("prefix", key.prefix); put("order", key.line) }
    }

    private fun matchJson(match: HandleMatch): JsonElement = when (match) {
        is HandleMatch.One -> buildJsonObject { put("kind", "one"); put("id", match.id) }
        HandleMatch.None -> buildJsonObject { put("kind", "none") }
        is HandleMatch.Many -> buildJsonObject { put("kind", "many"); put("count", match.count) }
    }

    // --- notes.json ---

    fun note(name: String, stdout: String): JsonObject {
        val git = object : GitRunner {
            override fun run(vararg args: String) = GitResult(0, stdout, "")
        }
        val lines = NotesGateway(git).readOrRefuse("refs/notes/y-review/local", "HEAD")
        return buildJsonObject {
            put("name", name)
            put("stdout", stdout)
            put("lines", strings(lines))
            put("ids", JsonArray(lines.map { line -> runCatching { CommentJson.decode(line).id() }.getOrNull()?.let { JsonPrimitive(it) } ?: JsonNull }))
        }
    }

    // --- names.json ---

    fun discovery(path: String) = buildJsonObject {
        put("path", path)
        put("name", DiscoveryFile.fileName(path))
    }

    fun window(path: String) = buildJsonObject {
        put("path", path)
        put("name", HandoffPlace.of(StoreKind.GIT, Path.of("root"), Path.of("gitdir"), path)!!.fileName.toString())
    }

    // --- redact.json ---

    fun redact(name: String, input: String, homes: List<String>, projects: List<String>, repositories: List<String>) =
        buildJsonObject {
            put("name", name)
            put("input", input)
            put("homes", strings(homes))
            put("projects", strings(projects))
            put("repositories", strings(repositories))
            put("output", Redact.text(input, homes, projects, repositories))
        }

    // --- agents.json ---

    fun agents() = JsonArray(
        AgentCatalog.ALL.map { agent ->
            buildJsonObject {
                put("id", agent.id.name.lowercase())
                put("label", agent.label)
                put("short", agent.short)
                put("commands", strings(agent.commands))
                put("push", agent.push.name.lowercase())
                put("mcp", mcpJson(agent.mcp))
                put("naming", namingJson(agent.naming))
                put("hint", agent.hint)
                put(
                    "desktop",
                    agent.desktop?.let { desktop ->
                        buildJsonObject {
                            put("label", desktop.label)
                            put("sharesConfig", desktop.sharesConfig)
                            put("note", desktop.note)
                        }
                    } ?: JsonNull,
                )
            }
        },
    )

    private fun mcpJson(route: McpRoute): JsonElement = when (route) {
        is McpRoute.Flag -> buildJsonObject { put("kind", "flag"); put("flag", route.flag); put("prefix", route.prefix) }
        is McpRoute.Variable -> buildJsonObject { put("kind", "variable"); put("name", route.name) }
        McpRoute.Keys -> buildJsonObject { put("kind", "keys") }
        McpRoute.AddCommand -> buildJsonObject { put("kind", "addCommand") }
        is McpRoute.UserFile -> buildJsonObject { put("kind", "userFile"); put("path", route.path) }
        McpRoute.None -> buildJsonObject { put("kind", "none") }
    }

    private fun namingJson(naming: Naming): JsonElement = when (naming) {
        is Naming.Agent -> buildJsonObject { put("kind", "agent"); put("command", naming.command) }
        Naming.User -> buildJsonObject { put("kind", "user") }
    }
}
