# y-review channel

This is a Claude Code channel server. A channel pushes text into a Claude Code
session that is already open. This server takes review comments from the IntelliJ
IDEA plugin and puts them into the open session.

The server holds no comment store. The IDEA plugin owns the comments. This server
only carries them.

## How the parts fit together

```
IntelliJ IDEA plugin
  bridge endpoint on 127.0.0.1
        |
        |  GET /events    the plugin pushes a batch down this stream
        |  POST /resolve  the channel reports the fixed comments back
        v
y-review channel (this package, one Node process)
        |
        |  stdio, Model Context Protocol
        v
Claude Code session
```

Claude Code starts this process. This process connects to the bridge. The plugin
never starts this process.

## Build and test

```bash
npm install
npm run build
npm test
npm run lint
```

The build writes `dist/`. The session entry point is `dist/main.js`.

## Settings

The server reads two environment variables. It refuses to start without them.

| Variable | Value | Rule |
|---|---|---|
| `Y_REVIEW_BRIDGE_URL` | The base address of the bridge, for example `http://127.0.0.1:64343` | The scheme must be `http`. The host must be a loopback address. |
| `Y_REVIEW_BRIDGE_TOKEN` | A secret that the plugin makes for each IDE run | At least 16 characters. |

The server rejects an address outside the loopback range. Any local program can
reach a loopback port, therefore the token is the real guard. The plugin makes a
new token for each IDE run and puts it in the MCP configuration that it writes.
Never write a token into a file that git tracks.

## The bridge contract

The plugin hosts the bridge. This section is the full contract. The plugin side
does not exist yet, so `src/fakeBridge.ts` holds a bridge that follows this
contract and the tests run against it.

Both requests carry the token in the `X-Y-Review-Token` header. The bridge must
answer 401 when the token does not match.

### The channel learns about a new batch

The channel sends one request:

```
GET /events
Accept: text/event-stream
X-Y-Review-Token: <token>
```

The bridge answers `200` with the media type `text/event-stream` and holds the
connection open. For each batch the bridge writes one Server-Sent Event:

```
data: {"batchId":"b7f2a91","branch":"main","commit":"4f2c8b1...","comments":[...]}

```

A blank line ends the event. The bridge may send a comment line such as `: open`
to keep the connection alive. The channel ignores a line that does not start with
`data:`.

The channel opens the stream again when the stream closes. The delay between two
attempts is 1000 milliseconds. The channel reports a bad event on its standard
error stream and keeps the stream open.

### What a batch looks like

```json
{
  "batchId": "b7f2a91",
  "branch": "feat/channel-server",
  "commit": "4f2c8b1c9d0e1f2a3b4c5d6e7f8091a2b3c4d5e6",
  "comments": [
    {
      "id": "c3f9a12aabbccddeeff00112233445566778899a",
      "path": "src/main/kotlin/Parser.kt",
      "startLine": 88,
      "endLine": 94,
      "revision": "HEAD",
      "side": "right",
      "text": "This branch never runs when the input is empty. Add the guard before the loop."
    }
  ]
}
```

| Field | Type | Rule |
|---|---|---|
| `batchId` | string | Letters, digits, underscores, and hyphens. 1 to 200 characters. |
| `branch` | string | The branch that the comments belong to. No control character. 1 to 255 characters. |
| `commit` | string | The commit that the working tree is on. |
| `comments` | array | 1 to 200 entries. |
| `comments[].id` | string | The comment id from the plugin. The channel treats it as opaque. Letters, digits, underscores, and hyphens. 1 to 200 characters. |
| `comments[].path` | string | The path of the file, relative to the repository root. |
| `comments[].startLine` | integer | The first line of the range. |
| `comments[].endLine` | integer | The last line of the range. |
| `comments[].revision` | string | The commit that the comment was written against, or the word `HEAD`. |
| `comments[].side` | string | `left` or `right`. This field is optional. The default is `right`. |
| `comments[].text` | string | The comment body. 1 to 20000 characters. |

The channel rejects a batch that carries a field outside this table. The channel
rejects a batch that breaks any rule in this table. A rejected batch does not stop
the stream.

`revision` tells the model which version of the file the comment belongs to. Send
the commit that the plugin recorded in `location.commit`. The word `HEAD` is also
valid, and it means the current working tree.

### The channel reports the fixed comments

When the model calls the `review_resolve` tool, the channel sends one request:

```
POST /resolve
Content-Type: application/json
X-Y-Review-Token: <token>

{"ids":["c3f9a12aabbccddeeff00112233445566778899a"]}
```

The ids are always full ids, never short ids. Any 2xx answer means success. The
channel gives the failure text back to the model on any other answer, and it keeps
the comments open.

## What Claude Code receives

The channel sends one notification for one batch. The method is
`notifications/claude/channel`. The model sees this:

```
<channel source="y-review" branch="feat/channel-server" commit="4f2c8b1c..." count="2" batch_id="b7f2a91">
[c3f9a12] src/main/kotlin/Parser.kt:88-94 @HEAD
This branch never runs when the input is empty. Add the guard before the loop.

[a7710de] src/main/kotlin/Lexer.kt:12-12 @4f2c8b1 (left side of the diff)
This was already wrong before the change. Fix it in the same pass.
</channel>
```

Rules for the body:

1. One blank line divides two comments.
2. The id in the brackets is the first 7 characters of the comment id.
3. The revision reads `HEAD` when it equals the batch `commit`, or when the plugin
   sent the word `HEAD`. Any other revision reads as its first 7 characters.
4. The mark `(left side of the diff)` appears only when `side` is `left`.

The `meta` map carries `branch`, `commit`, `count`, and `batch_id`. Claude Code
turns each entry into an attribute on the tag. Claude Code drops a key that holds a
character other than a letter, a digit, or an underscore. For this reason the
channel removes such a key before it sends the event. The channel also removes a
double quote and a control character from each value, because each value becomes an
attribute value.

## The review_resolve tool

The model calls `review_resolve` with the ids of the comments that it fixed. The
tool takes one field, `ids`, an array of strings.

The model reads a short id in the event, therefore the tool accepts a short id. The
channel maps a short id back to the full id, and it sends only full ids to the
bridge. The channel keeps the open batches in memory for this reason, and for no
other reason. It keeps at most 32 batches and drops the oldest batch first.

The tool call fails in these cases:

1. No open comment matches any given id.
2. Several open comments match a given id. The message asks for more characters.
3. The bridge refuses the report. The comments stay open, so the model can try again.

## Start a session with this channel

Write an MCP configuration file. The key of the entry must be `y-review`,
because the `source` attribute on the tag comes from the server name.
`mcp.y-review.example.json` holds the shape:

```json
{
  "mcpServers": {
    "y-review": {
      "command": "node",
      "args": ["<absolute path>/channel/dist/main.js"],
      "env": {
        "Y_REVIEW_BRIDGE_URL": "http://127.0.0.1:64343",
        "Y_REVIEW_BRIDGE_TOKEN": "<the token that the plugin made>"
      }
    }
  }
}
```

Then start the session:

```bash
claude --mcp-config ./channel/mcp.y-review.json --dangerously-load-development-channels server:y-review
```

An entry in the MCP configuration is not enough. A session receives channel events
only when the command line names the server.

Facts from the installed command line tool, version 2.1.237:

| Flag | Argument | Help text in the binary |
|---|---|---|
| `--channels <servers...>` | `server:<name>` or `plugin:<name>@<marketplace>` | MCP servers whose channel notifications (inbound push) should register this session. Space-separated server names. |
| `--dangerously-load-development-channels <servers...>` | the same | Load channel servers not on the approved allowlist. For local channel development only. Shows a confirmation dialog at startup. |

The binary describes `server:<name>` as a manually configured MCP server. Use
`--dangerously-load-development-channels` while this server is not on the approved
list. Neither flag appears in `claude --help`, because channels are a research
preview. Keep the flag in one place, because the syntax can change.

### What a live run shows

We ran this server against the command line tool, version 2.1.237.

1. An interactive session receives the events. The terminal prints a one line
   summary such as `← y-review: [c3f9a12] src/main/kotlin/Parser.kt:88-94 @HEAD ...`.
2. A `claude -p` run receives no event, even after a second turn. Start an
   interactive session, or a session that stays open.
3. The startup notice can say `server:y-review · no MCP server configured with
   that name` and the events still arrive. Do not treat that line as a failure.

The tool keeps a rule that decides whether it registers a channel. One part of that
rule matters for this package: the tool skips a channel when the connection
negotiates a modern protocol revision, because that revision has no path for an
unsolicited notification. Version 1.30.0 of `@modelcontextprotocol/sdk` does not
answer the `server/discover` probe, therefore the connection stays on the legacy
revision and the channel works. Check this again after an upgrade of the SDK. The
debug log line for the connection must read `"protocolEra":"legacy"`.

## Try it without the IDE

Start the fake bridge in one terminal:

```bash
node dist/fakeBridge.js
```

It prints the address and the token. Put both in the MCP configuration file. Start
Claude Code with the command line above. Paste one batch as one line of JSON into
the terminal that runs the fake bridge, then press Enter. The batch reaches the
model. The fake bridge prints the ids that the model reports back.

## Files

| Path | Job |
|---|---|
| `src/main.ts` | Reads the settings, connects the stdio transport, starts the bridge client. |
| `src/app.ts` | Joins the bridge client and the channel server. |
| `src/channel.ts` | The MCP server, the channel capability, the instructions, the `review_resolve` tool. |
| `src/bridge.ts` | The Server-Sent Events client and the resolve request. |
| `src/format.ts` | The body text and the `meta` map. |
| `src/schema.ts` | The batch contract as a schema. |
| `src/config.ts` | The environment variables and the loopback check. |
| `src/fakeBridge.ts` | A bridge that follows the contract, for the tests and for a manual run. |
