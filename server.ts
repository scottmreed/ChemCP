console.log("Starting ChemCP MCP App server...");

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  registerAppTool,
  registerAppResource,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod/v3";
import cors from "cors";
import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const server = new McpServer({
  name: "ChemCP",
  version: "1.0.0",
});

const resourceUri = "ui://chemcp/mcp-app.html";

// Tool: render_molecule
// Takes a SMILES string and returns it to the UI, which uses client-side
// RDKit.js (WASM) to render the 2D molecule structure and compute properties.
registerAppTool(
  server,
  "render_molecule",
  {
    title: "Render Molecule",
    description:
      "Renders an interactive 2D structure diagram of a molecule from its SMILES notation. " +
      "Displays the molecule image along with computed molecular properties " +
      "(molecular weight, LogP, H-bond donors/acceptors, TPSA, etc.). " +
      "Use this whenever a user asks to see, visualize, draw, or display a chemical structure.",
    inputSchema: {
      smiles: z
        .string()
        .describe(
          "SMILES notation of the molecule (e.g. 'CCO' for ethanol, 'c1ccccc1' for benzene, 'CC(=O)Oc1ccccc1C(=O)O' for aspirin)"
        ),
    },
    _meta: { ui: { resourceUri } },
  },
  async ({ smiles }: { smiles: string }) => {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ smiles }),
        },
      ],
    };
  }
);

// Resource: serve the bundled HTML with CSP allowing RDKit CDN
registerAppResource(
  server,
  "ChemCP Molecule Viewer",
  resourceUri,
  {
    description: "Interactive molecule viewer powered by RDKit.js",
  },
  async () => {
    const html = await fs.readFile(
      path.join(__dirname, "dist", "mcp-app.html"),
      "utf-8"
    );
    return {
      contents: [
        {
          uri: resourceUri,
          mimeType: RESOURCE_MIME_TYPE,
          text: html,
          _meta: {
            ui: {
              csp: {
                resourceDomains: ["https://unpkg.com"],
                connectDomains: ["https://unpkg.com"],
              },
            },
          },
        },
      ],
    };
  }
);

// Expose the MCP server over HTTP
const app = express();
app.use(cors());
app.use(express.json());

app.post("/mcp", async (req, res) => {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  res.on("close", () => transport.close());
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`ChemCP server listening on http://localhost:${PORT}/mcp`);
});
