# ChemCP - Molecule Viewer MCP App

An MCP App that renders 2D molecular structure diagrams from SMILES notation using RDKit.js. Displays interactive molecule images with computed molecular properties directly inside AI chat.

## What it does

- **`render_molecule` tool**: Accepts a SMILES string and renders a 2D structure diagram
- **RDKit.js (WASM)**: Client-side molecule rendering via the RDKit JavaScript library
- **Molecular properties**: Computes MW, LogP, H-bond donors/acceptors, TPSA, rings, etc.
- **Interactive UI**: Input field to try SMILES, example molecules, live re-rendering

## Quick start

```bash
npm install
npm run build
npm run serve
```

Server listens on `http://localhost:3001/mcp`.

## Development

```bash
npm run dev    # Build + serve with watch mode
npm run start  # Build then serve (production)
```

## Testing with Claude

1. Start the server: `npm run serve`
2. In a separate terminal, expose via tunnel:
   ```bash
   npx cloudflared tunnel --url http://localhost:3001
   ```
3. Add the tunnel URL as a custom connector in Claude (Settings > Connectors > Add custom connector)
4. Ask Claude: "Show me the molecule for aspirin" or "Render SMILES: CCO"

## Testing with basic-host

```bash
# Terminal 1
npm run serve

# Terminal 2
git clone https://github.com/modelcontextprotocol/ext-apps.git
cd ext-apps/examples/basic-host
npm install
SERVERS='["http://localhost:3001/mcp"]' npm start
# Open http://localhost:8080
```

## Architecture

- **[server.ts](server.ts)**: MCP server using `McpServer` + `registerAppTool`/`registerAppResource` with `StreamableHTTPServerTransport`
- **[src/mcp-app.html](src/mcp-app.html)**: HTML entry point loading RDKit.js from CDN
- **[src/mcp-app.tsx](src/mcp-app.tsx)**: React UI that initializes RDKit WASM, parses SMILES, renders SVG, computes descriptors
- **CSP**: Resource metadata allows `unpkg.com` for loading RDKit.js + WASM

## Example SMILES

| Molecule     | SMILES                                  |
|--------------|-----------------------------------------|
| Ethanol      | `CCO`                                   |
| Benzene      | `c1ccccc1`                              |
| Aspirin      | `CC(=O)Oc1ccccc1C(=O)O`                |
| Caffeine     | `CN1C=NC2=C1C(=O)N(C(=O)N2C)C`         |
| Testosterone | `CC12CCC3C(C1CCC2O)CCC4=CC(=O)CCC34C`  |
| Glucose      | `OC[C@H]1OC(O)[C@H](O)[C@@H](O)[C@@H]1O` |
