# ChemCP - Molecule Viewer MCP App

An [MCP App](https://modelcontextprotocol.io/docs/extensions/apps) that renders interactive 2D molecular structure diagrams from SMILES notation using [RDKit.js](https://github.com/rdkit/rdkit-js). Ask your AI assistant to show you any molecule, and ChemCP displays the structure with computed properties — right inside the chat.

## What you get

- **2D structure diagrams** rendered from any valid SMILES string
- **Molecular properties** — molecular weight, LogP, H-bond donors/acceptors, TPSA, rotatable bonds, rings, and more
- **Interactive UI** — type your own SMILES, click example molecules, all without leaving the conversation
- Powered by **RDKit** (the same cheminformatics toolkit used by pharma and biotech)

For more functionality try: [ChemIllusion](https://chemillusion.com)

## Prerequisites

- **Node.js 18+** — [download here](https://nodejs.org/)
- **Claude Desktop** (recommended) or **Claude.ai** paid plan (Pro/Max/Team) — the interactive molecule viewer requires a host that supports [MCP Apps](https://modelcontextprotocol.io/docs/extensions/apps)

> **Note**: Claude Desktop has full MCP Apps support. Claude.ai custom connectors are experimental and may have CSP limitations that prevent RDKit.js from loading. If you see "RDKit.js failed to load" in Claude.ai, use Claude Desktop instead.

---

## Setup: Claude Desktop

Claude Desktop supports local MCP servers out of the box. No tunnels or remote hosting needed.

### Step 1: Install ChemCP

```bash
npm install -g chemcp
```

Verify it installed:

```bash
chemcp --help
```

(It will start the MCP server on stdio — you can Ctrl+C to stop it.)

### Step 2: Configure Claude Desktop

Open your Claude Desktop config file:

| OS      | Path                                                         |
|---------|--------------------------------------------------------------|
| macOS   | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json`                |

Add ChemCP to the `mcpServers` section:

```json
{
  "mcpServers": {
    "chemcp": {
      "command": "npx",
      "args": ["chemcp"]
    }
  }
}
```

> **Tip**: If you already have other MCP servers configured, just add the `"chemcp"` entry alongside them inside the existing `"mcpServers"` object.

### Step 3: Restart Claude Desktop

Quit and reopen Claude Desktop. You should see ChemCP listed in the MCP tools (click the hammer icon at the bottom of the chat input).

### Step 4: Try it out

Type a message like:

- *"Show me the molecule for aspirin"*
- *"Render the structure of caffeine"*
- *"Display SMILES: CC(=O)Oc1ccccc1C(=O)O"*

Claude will call the `render_molecule` tool, and an interactive molecule viewer will appear in the conversation showing the 2D structure and molecular properties.

---

## Setup: Claude.ai (Web) — Experimental

> **⚠️ Experimental**: Claude.ai custom connectors have experimental MCP Apps support. CSP restrictions may prevent RDKit.js from loading. **Use Claude Desktop for the best experience.**

Claude.ai supports remote MCP servers via [custom connectors](https://support.anthropic.com/en/articles/11175166-getting-started-with-custom-connectors-using-remote-mcp). This requires a paid Claude plan (Pro, Max, or Team).

### Step 1: Install and start the server

```bash
npm install -g chemcp
```

Start in HTTP mode:

```bash
chemcp --http
```

This starts the server on `http://localhost:3001/mcp`.

### Step 2: Expose with a tunnel

In a **separate terminal**, create a public tunnel to your local server:

```bash
npx cloudflared tunnel --url http://localhost:3001
```

Copy the generated URL (e.g., `https://random-name.trycloudflare.com`).

### Step 3: Add as a custom connector in Claude.ai

1. Go to [claude.ai](https://claude.ai)
2. Click your profile picture (bottom-left)
3. Go to **Settings** > **Connectors**
4. Click **Add custom connector**
5. Paste your tunnel URL + `/mcp` (e.g., `https://random-name.trycloudflare.com/mcp`)
6. Give it a name like "ChemCP"
7. Save

### Step 4: Try it out

Start a new chat and ask Claude to show you a molecule:

- *"Show me the structure of ibuprofen"*
- *"What does benzene look like? Render it for me"*
- *"Render SMILES: CN1C=NC2=C1C(=O)N(C(=O)N2C)C"*

The interactive molecule viewer will render directly in the chat.

---

## Example prompts

Once connected, try these:

| Prompt | What happens |
|--------|-------------|
| *"Show me aspirin"* | Renders aspirin's 2D structure + properties |
| *"Render SMILES: CCO"* | Renders ethanol from its SMILES code |
| *"What's the structure of testosterone?"* | Claude provides the SMILES and renders it |
| *"Compare the structures of caffeine and theobromine"* | Renders both molecules side by side |

## Example SMILES

| Molecule     | SMILES                                     |
|--------------|--------------------------------------------|
| Ethanol      | `CCO`                                      |
| Benzene      | `c1ccccc1`                                 |
| Aspirin      | `CC(=O)Oc1ccccc1C(=O)O`                   |
| Caffeine     | `CN1C=NC2=C1C(=O)N(C(=O)N2C)C`            |
| Testosterone | `CC12CCC3C(C1CCC2O)CCC4=CC(=O)CCC34C`     |
| Glucose      | `OC[C@H]1OC(O)[C@H](O)[C@@H](O)[C@@H]1O` |

---

## Troubleshooting

### "I don't see the molecule viewer, just text"

The interactive UI only works in hosts that support **MCP Apps**:
- **Claude Desktop** (latest version)
- **Claude.ai** (web, with custom connector)

If you're using Claude Code (CLI) or another MCP client that doesn't support MCP Apps, the tool will still return the SMILES data as text, but the visual rendering won't appear.

### "Tool not found" or ChemCP not listed

- **Claude Desktop**: Make sure you restarted the app after editing the config file. Check that `npx chemcp` works in your terminal.
- **Claude.ai**: Make sure the tunnel is still running and the connector URL ends with `/mcp`.

### "RDKit.js failed to load from CDN"

**Claude.ai custom connectors**: CSP limitations may prevent RDKit.js from loading when using custom connectors. **Solution: Use Claude Desktop instead**, which has full MCP Apps support.

**Claude Desktop**: If RDKit.js fails to load, this usually means:
- No internet connection (RDKit.js loads from `unpkg.com`, ~8 MB)
- CDN is blocked by your network firewall
- First load timeout — reload the chat and try again

### Node.js version

ChemCP requires Node.js 18 or higher. Check with:

```bash
node --version
```

---

## For developers

### Local development

```bash
git clone https://github.com/scottmreed/ChemCP.git
cd ChemCP
npm install
npm run build
npm run serve:http    # HTTP mode for testing
```

### Project structure

| File | Purpose |
|------|---------|
| `server.ts` | MCP server — registers `render_molecule` tool and serves the UI resource |
| `src/mcp-app.html` | HTML entry point, loads RDKit.js from CDN |
| `src/mcp-app.tsx` | React UI — initializes RDKit WASM, renders SVG from SMILES, computes descriptors |
| `bin/chemcp.js` | npm bin entry point |
| `dist/` | Built output (compiled server + bundled single-file HTML) |

### How it works

1. Claude calls the `render_molecule` tool with a SMILES string
2. The server returns the SMILES to the MCP App UI
3. The UI loads **RDKit.js** (WebAssembly) in the browser
4. RDKit parses the SMILES and renders a 2D SVG structure diagram
5. Molecular descriptors (MW, LogP, TPSA, etc.) are computed client-side
6. Everything displays in a sandboxed iframe inside the chat

### Testing with the basic-host

The [ext-apps](https://github.com/modelcontextprotocol/ext-apps) repository includes a test host for MCP App development:

```bash
# Terminal 1 — run ChemCP in HTTP mode
npm run serve:http

# Terminal 2 — run the test host
git clone https://github.com/modelcontextprotocol/ext-apps.git
cd ext-apps/examples/basic-host
npm install
SERVERS='["http://localhost:3001/mcp"]' npm start
# Open http://localhost:8080
```

---

## Links

- [npm package](https://www.npmjs.com/package/chemcp)
- [MCP Registry](https://registry.modelcontextprotocol.io)
- [MCP Apps documentation](https://modelcontextprotocol.io/docs/extensions/apps)
- [RDKit.js](https://github.com/rdkit/rdkit-js)
- [ChemIllusion](https://chemillusion.com) — for more complex molecule interactions
