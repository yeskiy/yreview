package com.yeskiy.yreview.session

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class SessionPlanTest {

    private val project = "E:/work/demo"
    private val token = "0123456789abcdef0123"
    private val ready = BridgeLookup.Available("http://127.0.0.1:52431", token)
    private val serverPath = "C:/Users/one/plugins/y-review/channel/main.mjs"
    private val found = ChannelServer.Answer.Found(serverPath)
    private val node = NodeInstall("C:/Program Files/nodejs/node.exe")
    private val config = "/tmp/claude-y-review-mcp-1.json"

    private fun plan(
        bridge: BridgeLookup = ready,
        server: ChannelServer.Answer = found,
        node: NodeInstall = this.node,
        configFile: String? = config,
    ) = SessionPlan.of(project, bridge, "claude", server, node, configFile)

    @Test
    fun `the plan runs the command in the project directory`() {
        assertEquals(ClaudeCommand.shellCommand("claude", config), plan().command)
        assertEquals(project, plan().workingDirectory)
    }

    @Test
    fun `the plan appends the two flags of the channel`() {
        val line = plan().command.last()

        assertTrue(line.contains(ClaudeCommand.CONFIG_FLAG), line)
        assertTrue(line.contains(config), line)
        assertTrue(line.contains(ClaudeCommand.CHANNEL_FLAG), line)
        assertTrue(line.contains(ClaudeCommand.CHANNEL_VALUE), line)
    }

    @Test
    fun `the plan runs the command of the settings`() {
        val custom = SessionPlan.of(project, ready, "C:/tools/claude.exe", found, node, config)

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
        assertFalse(plan.command.last().contains(ClaudeCommand.CHANNEL_FLAG))
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
        assertFalse(plan.command.last().contains(ClaudeCommand.CHANNEL_FLAG))
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

        assertEquals(ClaudeCommand.shellCommand("claude"), plan.command)
        assertFalse(plan.command.last().contains(ClaudeCommand.CONFIG_FLAG))
        assertFalse(plan.command.last().contains(ClaudeCommand.CHANNEL_FLAG))
        assertTrue(plan.bridgeReady)
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
        assertFalse(plan.command.last().contains(ClaudeCommand.CHANNEL_FLAG))
    }

    @Test
    fun `a channel server that is no file never carries the flags`() {
        // A caller that writes no configuration file must never produce a --mcp-config flag.
        val plan = plan(server = ChannelServer.Answer.Missing(serverPath), configFile = config)

        assertFalse(plan.command.last().contains(ClaudeCommand.CONFIG_FLAG), plan.command.last())
    }

    @Test
    fun `a machine without node starts the session without the flags`() {
        val plan = plan(node = NodeInstall.NOTHING, configFile = null)

        assertEquals(ClaudeCommand.shellCommand("claude"), plan.command)
        assertFalse(plan.command.last().contains(ClaudeCommand.CHANNEL_FLAG))
        assertTrue(plan.bridgeReady)
    }

    @Test
    fun `a machine without node reads it in the status text`() {
        val plan = plan(node = NodeInstall.NOTHING, configFile = null)

        assertTrue(plan.status.contains("Node was not found on this machine"), plan.status)
        assertTrue(plan.status.contains("The session starts without the channel."), plan.status)
    }

    @Test
    fun `a machine without node never carries the flags`() {
        val plan = plan(node = NodeInstall.NOTHING, configFile = config)

        assertFalse(plan.command.last().contains(ClaudeCommand.CONFIG_FLAG), plan.command.last())
    }

    @Test
    fun `the six cases each carry their own words`() {
        val texts = listOf(
            plan().status,
            plan(bridge = BridgeLookup.Unavailable("The bridge file does not exist yet.")).status,
            plan(bridge = BridgeLookup.ChannelOff).status,
            plan(server = ChannelServer.Answer.Unknown, configFile = null).status,
            plan(server = ChannelServer.Answer.Missing(serverPath), configFile = null).status,
            plan(node = NodeInstall.NOTHING, configFile = null).status,
        )

        assertEquals(texts.size, texts.distinct().size)
    }

    @Test
    fun `the plan converts a wsl project path`() {
        assertEquals(project, SessionPlan.of("/mnt/e/Projects/Opened/y-review", ready).workingDirectory)
    }
}
