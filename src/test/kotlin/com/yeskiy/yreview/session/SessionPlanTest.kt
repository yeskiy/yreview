package com.yeskiy.yreview.session

import com.yeskiy.yreview.bridge.OpenCodeClient
import com.yeskiy.yreview.bridge.SessionKey
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class SessionPlanTest {

    private val project = "E:/work/demo-repo"
    private val token = "0123456789abcdef0123"
    private val ready = BridgeLookup.Available("http://127.0.0.1:52431", token)
    private val serverPath = "C:/Users/one/plugins/y-review/channel/y-review-channel.jar"
    private val found = ChannelServer.Answer.Found(serverPath)
    private val javaPath = "C:/Program Files/JetBrains/jbr/bin/java.exe"
    private val config = "/tmp/y-review-mcp-1.json"

    private fun plan(
        bridge: BridgeLookup = ready,
        agent: AgentSpec = AgentCatalog.of(AgentId.CLAUDE),
        command: String = "claude",
        server: ChannelServer.Answer = found,
        javaPath: String? = this.javaPath,
        configFile: String? = config,
        sessionKey: String? = null,
    ) = SessionPlan.of(project, bridge, agent, command, server, javaPath, configFile, sessionKey)

    private fun shell(configFile: String? = null) = ShellCommand.shellCommand(
        AgentLaunch.arguments(AgentCatalog.of(AgentId.CLAUDE), "claude", configFile)
    )

    @Test
    fun `the plan runs the command in the project directory`() {
        assertEquals(shell(config), plan().command)
        assertEquals(project, plan().workingDirectory)
    }

    @Test
    fun `the plan appends the two flags of the channel`() {
        val line = plan().command.last()

        assertTrue(line.contains(AgentLaunch.CONFIG_FLAG), line)
        assertTrue(line.contains(config), line)
        assertTrue(line.contains(AgentLaunch.CHANNEL_FLAG), line)
        assertTrue(line.contains(AgentLaunch.CHANNEL_VALUE), line)
    }

    @Test
    fun `the plan runs the command of the settings`() {
        val custom = plan(command = "C:/tools/claude.exe")

        assertTrue(custom.command.last().contains("C:/tools/claude.exe"), custom.command.last())
    }

    @Test
    fun `the plan hands the bridge to the session as two variables`() {
        assertEquals(
            mapOf(
                BridgeDiscovery.URL_VARIABLE to "http://127.0.0.1:52431",
                BridgeDiscovery.TOKEN_VARIABLE to token
            ),
            plan().environment
        )
    }

    @Test
    fun `the token never reaches the command line`() {
        val plan = plan()
        assertFalse(plan.command.any { it.contains(token) })
        assertFalse(plan.status.contains(token))
    }

    @Test
    fun `a missing bridge still starts the session`() {
        val plan = plan(bridge = BridgeLookup.Unavailable("The bridge file does not exist yet."))

        assertTrue(plan.environment.isEmpty())
        assertFalse(plan.bridgeReady)
        assertFalse(plan.command.last().contains(AgentLaunch.CHANNEL_FLAG))
    }

    @Test
    fun `a missing bridge is stated in the status text`() {
        val plan = plan(bridge = BridgeLookup.Unavailable("The bridge file does not exist yet."))

        assertTrue(plan.status.contains("The bridge file does not exist yet."))
        assertTrue(plan.status.contains("not available"))
    }

    @Test
    fun `a ready bridge is stated in the status text`() {
        assertTrue(plan().bridgeReady)
        assertTrue(plan().status.contains("http://127.0.0.1:52431"))
    }

    @Test
    fun `a closed channel starts the session without the bridge`() {
        val plan = plan(bridge = BridgeLookup.ChannelOff)

        assertEquals(project, plan.workingDirectory)
        assertTrue(plan.environment.isEmpty())
        assertFalse(plan.bridgeReady)
        assertFalse(plan.command.last().contains(AgentLaunch.CHANNEL_FLAG))
    }

    @Test
    fun `a closed channel names the switch in the status text`() {
        val plan = plan(bridge = BridgeLookup.ChannelOff)

        assertTrue(plan.status.contains("The review channel is off in the settings."), plan.status)
        assertTrue(plan.status.contains("The session starts without the channel."), plan.status)
    }

    @Test
    fun `a closed channel never asks the user to wait`() {
        val plan = plan(bridge = BridgeLookup.ChannelOff)

        assertFalse(plan.status.contains("yet"), plan.status)
        assertFalse(plan.status.contains("not available"), plan.status)
    }

    @Test
    fun `an unknown plugin folder starts the session without the flags`() {
        val plan = plan(server = ChannelServer.Answer.Unknown, configFile = null)

        assertEquals(shell(), plan.command)
        assertFalse(plan.command.last().contains(AgentLaunch.CONFIG_FLAG))
        assertFalse(plan.command.last().contains(AgentLaunch.CHANNEL_FLAG))
        assertFalse(plan.bridgeReady)
    }

    @Test
    fun `an unknown plugin folder names the plugin in the status text`() {
        val plan = plan(server = ChannelServer.Answer.Unknown, configFile = null)

        assertTrue(plan.status.contains("plugin"), plan.status)
        assertTrue(plan.status.contains("The session starts without the channel."), plan.status)
        assertFalse(plan.status.contains("yet"), plan.status)
    }

    @Test
    fun `a channel server that is no file is named in the status text`() {
        val plan = plan(server = ChannelServer.Answer.Missing(serverPath), configFile = null)

        assertTrue(plan.status.contains(serverPath), plan.status)
        assertTrue(plan.status.contains("The session starts without the channel."), plan.status)
        assertFalse(plan.command.last().contains(AgentLaunch.CHANNEL_FLAG))
    }

    @Test
    fun `a channel server that is no file never carries the flags`() {
        // A caller that writes no configuration file must never produce a --mcp-config flag.
        val plan = plan(server = ChannelServer.Answer.Missing(serverPath), configFile = config)

        assertFalse(plan.command.last().contains(AgentLaunch.CONFIG_FLAG), plan.command.last())
    }

    @Test
    fun `an IDE without a java runtime starts the session without the flags`() {
        val plan = plan(javaPath = null, configFile = null)

        assertEquals(shell(), plan.command)
        assertFalse(plan.command.last().contains(AgentLaunch.CHANNEL_FLAG))
        assertFalse(plan.bridgeReady)
    }

    @Test
    fun `an IDE without a java runtime reads it in the status text`() {
        val plan = plan(javaPath = null, configFile = null)

        assertTrue(plan.status.contains("The IDE names no Java runtime"), plan.status)
        assertTrue(plan.status.contains("The session starts without the channel."), plan.status)
    }

    @Test
    fun `an IDE without a java runtime never carries the flags`() {
        val plan = plan(javaPath = null, configFile = config)

        assertFalse(plan.command.last().contains(AgentLaunch.CONFIG_FLAG), plan.command.last())
    }

    @Test
    fun `no status text names Node`() {
        // The plugin ships a jar, and the IDE runs it. No status text may ask for Node.
        val texts = listOf(
            plan().status,
            plan(bridge = BridgeLookup.Unavailable("The bridge file does not exist yet.")).status,
            plan(bridge = BridgeLookup.ChannelOff).status,
            plan(server = ChannelServer.Answer.Unknown, configFile = null).status,
            plan(server = ChannelServer.Answer.Missing(serverPath), configFile = null).status,
            plan(javaPath = null, configFile = null).status,
        )

        texts.forEach { assertFalse(it.contains("Node"), it) }
    }

    @Test
    fun `the six cases each carry their own words`() {
        val texts = listOf(
            plan().status,
            plan(bridge = BridgeLookup.Unavailable("The bridge file does not exist yet.")).status,
            plan(bridge = BridgeLookup.ChannelOff).status,
            plan(server = ChannelServer.Answer.Unknown, configFile = null).status,
            plan(server = ChannelServer.Answer.Missing(serverPath), configFile = null).status,
            plan(javaPath = null, configFile = null).status,
        )

        assertEquals(texts.size, texts.distinct().size)
    }

    @Test
    fun `the plan converts a wsl project path`() {
        assertEquals(project, SessionPlan.of("/mnt/e/work/demo-repo", ready).workingDirectory)
    }

    @Test
    fun `the plan hands the session key to the session`() {
        assertEquals(
            "aaaaaaaaaaaaaaaa",
            plan(sessionKey = "aaaaaaaaaaaaaaaa").environment[SessionKey.VARIABLE],
        )
    }

    @Test
    fun `a plan without a key carries no key variable`() {
        assertFalse(plan().environment.containsKey(SessionKey.VARIABLE))
    }

    @Test
    fun `an agent without a channel runs plain`() {
        val opencode = plan(agent = AgentCatalog.of(AgentId.OPENCODE), command = "opencode")

        assertEquals(listOf("opencode"), AgentLaunch.arguments(AgentCatalog.of(AgentId.OPENCODE), "opencode", config))
        assertFalse(opencode.command.last().contains(AgentLaunch.CHANNEL_FLAG), opencode.command.last())
        assertFalse(opencode.command.last().contains(AgentLaunch.CONFIG_FLAG), opencode.command.last())
    }

    @Test
    fun `the status of an agent that takes no message names the agent and the way out`() {
        val antigravity = plan(agent = AgentCatalog.of(AgentId.ANTIGRAVITY), command = "agy")

        assertEquals(
            "Antigravity CLI does not accept a message into a running session. " +
                "Use the Copy button, then paste the prompt in the session.",
            antigravity.status,
        )
        assertFalse(antigravity.bridgeReady)
    }

    @Test
    fun `the status of a command of the user names no product`() {
        // Another agent is an entry of a menu, so the status must name no product.
        val custom = plan(agent = AgentCatalog.of(AgentId.CUSTOM), command = "my-agent")

        assertEquals(
            "The plugin puts no message into a command of your own. " +
                "Use the Copy button, then paste the prompt in the session.",
            custom.status,
        )
    }

    @Test
    fun `the status of an agent with a port of its own does not say that a message never arrives`() {
        // OpenCode takes a send over a loopback port, so the status must not tell the user
        // that a message never arrives. This session carries no channel all the same.
        val opencode = plan(agent = AgentCatalog.of(AgentId.OPENCODE), command = "opencode")

        assertFalse(opencode.bridgeReady)
        assertFalse(opencode.status.contains("does not accept a message"), opencode.status)
        assertTrue(opencode.status.contains(ready.url), opencode.status)
    }

    @Test
    fun `an agent without a channel still reaches the bridge through the environment`() {
        // The IDE server carries the review tools, so the address still travels.
        val opencode = plan(agent = AgentCatalog.of(AgentId.OPENCODE), command = "opencode")

        assertEquals(ready.url, opencode.environment[BridgeDiscovery.URL_VARIABLE])
        assertEquals(token, opencode.environment[BridgeDiscovery.TOKEN_VARIABLE])
    }

    @Test
    fun `an agent with no command yet says so`() {
        val custom = plan(agent = AgentCatalog.of(AgentId.CUSTOM), command = "")

        assertEquals(
            "This agent has no command yet. Name one in Settings, Tools, Yreview.",
            custom.status,
        )
    }

    @Test
    fun `opencode listens on the port the plugin gave it`() {
        val line = openCode().command.last()

        assertTrue(line.contains("--hostname"), line)
        assertTrue(line.contains("127.0.0.1"), line)
        assertTrue(line.contains("--port"), line)
        assertTrue(line.contains("47821"), line)
    }

    @Test
    fun `the opencode password travels in the environment only`() {
        val opencode = openCode()

        assertEquals("s3cret", opencode.environment[OpenCodeClient.PASSWORD_VARIABLE])
        assertFalse(opencode.command.last().contains("s3cret"), opencode.command.last())
    }

    @Test
    fun `the registration of opencode travels in the environment`() {
        assertEquals(config, openCode().environment["OPENCODE_CONFIG"])
    }

    @Test
    fun `a session with no port carries no password variable`() {
        assertFalse(plan().environment.containsKey(OpenCodeClient.PASSWORD_VARIABLE))
    }

    @Test
    fun `codex carries its dotted keys only while the whole server stands`() {
        val whole = plan(agent = AgentCatalog.of(AgentId.CODEX), command = "codex").command.last()
        val noBridge = plan(
            bridge = BridgeLookup.ChannelOff,
            agent = AgentCatalog.of(AgentId.CODEX),
            command = "codex",
        ).command.last()

        assertTrue(whole.contains("mcp_servers.y-review.command="), whole)
        assertFalse(noBridge.contains("mcp_servers.y-review"), noBridge)
    }

    private fun openCode() = SessionPlan.of(
        project, ready, AgentCatalog.of(AgentId.OPENCODE), "opencode",
        found, javaPath, config, null, 47821, "s3cret",
    )
}
