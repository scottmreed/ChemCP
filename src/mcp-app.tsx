import React, { useState, useEffect, useRef, useCallback } from "react";
import { createRoot } from "react-dom/client";
import { useApp } from "@modelcontextprotocol/ext-apps/react";

// RDKit.js MinimalLib type declarations (loaded from CDN)
declare global {
  interface Window {
    initRDKitModule: () => Promise<RDKitModule>;
  }
}

interface RDKitModule {
  get_mol(input: string): RDKitMol | null;
  version(): string;
}

interface RDKitMol {
  is_valid(): boolean;
  get_svg(width?: number, height?: number): string;
  get_svg_with_highlights(details: string): string;
  get_smiles(): string;
  get_descriptors(): string;
  get_inchi(): string;
  delete(): void;
}

interface MolProperties {
  canonicalSmiles: string;
  inchi: string;
  exactMW: string;
  avgMW: string;
  logP: string;
  hbDonors: string;
  hbAcceptors: string;
  tpsa: string;
  rotBonds: string;
  rings: string;
  aromaticRings: string;
  heavyAtoms: string;
  fractionCSP3: string;
}

const EXAMPLES = [
  { smiles: "CCO", name: "Ethanol" },
  { smiles: "c1ccccc1", name: "Benzene" },
  { smiles: "CC(=O)Oc1ccccc1C(=O)O", name: "Aspirin" },
  { smiles: "CN1C=NC2=C1C(=O)N(C(=O)N2C)C", name: "Caffeine" },
  { smiles: "CC12CCC3C(C1CCC2O)CCC4=CC(=O)CCC34C", name: "Testosterone" },
  { smiles: "OC[C@H]1OC(O)[C@H](O)[C@@H](O)[C@@H]1O", name: "Glucose" },
];

// Color scheme options for molecule rendering
const COLOR_SCHEMES = {
  default: { name: "Default", atomColors: {} },
  blackWhite: { 
    name: "Black & White",
    atomColors: { 6: [0, 0, 0], 7: [0, 0, 0], 8: [0, 0, 0], 9: [0, 0, 0], 15: [0, 0, 0], 16: [0, 0, 0], 17: [0, 0, 0], 35: [0, 0, 0] }
  },
  vibrant: {
    name: "Vibrant",
    atomColors: { 6: [0.2, 0.2, 0.2], 7: [0, 0, 1], 8: [1, 0, 0], 9: [0, 1, 0], 15: [1, 0.5, 0], 16: [1, 1, 0], 17: [0, 1, 0], 35: [0.5, 0, 0.5] }
  },
  pastel: {
    name: "Pastel",
    atomColors: { 6: [0.5, 0.5, 0.5], 7: [0.4, 0.4, 1], 8: [1, 0.4, 0.4], 9: [0.6, 1, 0.6], 15: [1, 0.7, 0.4], 16: [1, 1, 0.4], 17: [0.6, 1, 0.6], 35: [0.8, 0.4, 0.8] }
  },
};

type ColorSchemeKey = keyof typeof COLOR_SCHEMES;

function ChemCPApp() {
  const [smiles, setSmiles] = useState("");
  const [inputSmiles, setInputSmiles] = useState("");
  const [svgHtml, setSvgHtml] = useState("");
  const [properties, setProperties] = useState<MolProperties | null>(null);
  const [error, setError] = useState("");
  const [rdkitLoading, setRdkitLoading] = useState(true);
  const [rdkitError, setRdkitError] = useState("");
  const [colorScheme, setColorScheme] = useState<ColorSchemeKey>("default");
  const rdkitRef = useRef<RDKitModule | null>(null);

  const { app, isConnected } = useApp({
    appInfo: { name: "ChemCP", version: "1.0.0" },
    capabilities: {
      toolInput: true,
      toolResult: true,
    },
    onAppCreated: (createdApp) => {
      createdApp.ontoolresult = (result) => {
        if (result.content && result.content.length > 0) {
          const content = result.content[0];
          if (content.type === "text") {
            try {
              const data = JSON.parse(content.text);
              if (data.smiles) {
                setSmiles(data.smiles);
                setInputSmiles(data.smiles);
              }
            } catch {
              setError("Failed to parse tool result");
            }
          }
        }
      };

      createdApp.ontoolinput = (params) => {
        // Tool is being called, we'll get the result shortly
        setError("");
        setSvgHtml("");
        setProperties(null);
      };
    },
  });

  // Initialize RDKit WASM module by dynamically loading the script
  useEffect(() => {
    let cancelled = false;
    let scriptAdded = false;

    const loadRDKit = async () => {
      if (cancelled) return;

      // Check if already loaded
      if (typeof window.initRDKitModule === "function") {
        try {
          const mod = await window.initRDKitModule();
          if (!cancelled) {
            rdkitRef.current = mod;
            setRdkitLoading(false);
          }
          return;
        } catch (e) {
          if (!cancelled) {
            setRdkitError(
              `Failed to initialize RDKit: ${e instanceof Error ? e.message : e}`
            );
            setRdkitLoading(false);
          }
          return;
        }
      }

      // Dynamically load the script
      if (!scriptAdded) {
        scriptAdded = true;
        const script = document.createElement("script");
        script.src = "https://unpkg.com/@rdkit/rdkit/dist/RDKit_minimal.js";
        script.async = true;

        script.onload = async () => {
          if (cancelled) return;
          // Wait a bit for the global to be available
          let attempts = 0;
          const checkInit = async () => {
            if (cancelled) return;
            if (typeof window.initRDKitModule === "function") {
              try {
                const mod = await window.initRDKitModule();
                if (!cancelled) {
                  rdkitRef.current = mod;
                  setRdkitLoading(false);
                }
              } catch (e) {
                if (!cancelled) {
                  setRdkitError(
                    `Failed to initialize RDKit: ${e instanceof Error ? e.message : e}`
                  );
                  setRdkitLoading(false);
                }
              }
            } else {
              attempts++;
              if (attempts < 50) {
                setTimeout(checkInit, 100);
              } else {
                if (!cancelled) {
                  setRdkitError("RDKit initialization timed out");
                  setRdkitLoading(false);
                }
              }
            }
          };
          checkInit();
        };

        script.onerror = () => {
          if (!cancelled) {
            setRdkitError(
              "Failed to load RDKit.js from unpkg.com. Please check your internet connection or try again later."
            );
            setRdkitLoading(false);
          }
        };

        document.head.appendChild(script);
      }
    };

    loadRDKit();
    return () => {
      cancelled = true;
    };
  }, []);

  // Render a molecule from SMILES using RDKit
  const renderMolecule = useCallback((smilesStr: string, scheme: ColorSchemeKey) => {
    const RDKit = rdkitRef.current;
    if (!RDKit || !smilesStr.trim()) return;

    setError("");

    let mol: RDKitMol | null = null;
    try {
      mol = RDKit.get_mol(smilesStr);
      if (!mol || !mol.is_valid()) {
        setError(`Invalid SMILES: "${smilesStr}"`);
        setSvgHtml("");
        setProperties(null);
        if (mol) mol.delete();
        return;
      }

      // Render SVG with color scheme
      let svg: string;
      try {
        const drawOptions: any = { width: 450, height: 300 };
        
        // Apply custom atom colors if not default scheme
        if (scheme !== "default" && COLOR_SCHEMES[scheme].atomColors) {
          drawOptions.atomColourPalette = COLOR_SCHEMES[scheme].atomColors;
        }
        
        svg = mol.get_svg_with_highlights(JSON.stringify(drawOptions));
      } catch {
        // Fallback if get_svg_with_highlights doesn't accept size options
        try {
          svg = mol.get_svg(450, 300);
        } catch {
          svg = mol.get_svg();
        }
      }
      setSvgHtml(svg);

      // Get canonical SMILES
      const canonical = mol.get_smiles();

      // Get InChI
      let inchi = "";
      try {
        inchi = mol.get_inchi();
      } catch {
        // Not all builds support InChI
      }

      // Get molecular descriptors
      let props: MolProperties = {
        canonicalSmiles: canonical,
        inchi,
        exactMW: "",
        avgMW: "",
        logP: "",
        hbDonors: "",
        hbAcceptors: "",
        tpsa: "",
        rotBonds: "",
        rings: "",
        aromaticRings: "",
        heavyAtoms: "",
        fractionCSP3: "",
      };

      try {
        const desc = JSON.parse(mol.get_descriptors());
        props = {
          ...props,
          exactMW: desc.exactmw
            ? parseFloat(desc.exactmw).toFixed(3)
            : "",
          avgMW: desc.amw ? parseFloat(desc.amw).toFixed(3) : "",
          logP: desc.CrippenClogP
            ? parseFloat(desc.CrippenClogP).toFixed(2)
            : "",
          hbDonors: desc.NumHBD ?? desc.lipinskiHBD ?? "",
          hbAcceptors: desc.NumHBA ?? desc.lipinskiHBA ?? "",
          tpsa: desc.TPSA ? parseFloat(desc.TPSA).toFixed(1) : "",
          rotBonds: desc.NumRotatableBonds ?? "",
          rings: desc.NumRings ?? "",
          aromaticRings: desc.NumAromaticRings ?? "",
          heavyAtoms: desc.NumHeavyAtoms ?? "",
          fractionCSP3: desc.FractionCSP3
            ? parseFloat(desc.FractionCSP3).toFixed(2)
            : "",
        };
      } catch {
        // Descriptors unavailable, just show SMILES
      }

      setProperties(props);
      mol.delete();
    } catch (e) {
      setError(`Error rendering molecule: ${e instanceof Error ? e.message : e}`);
      setSvgHtml("");
      setProperties(null);
      if (mol) {
        try { mol.delete(); } catch { /* ignore */ }
      }
    }
  }, []);

  // Re-render when SMILES or color scheme changes
  useEffect(() => {
    if (smiles && !rdkitLoading && rdkitRef.current) {
      renderMolecule(smiles, colorScheme);
    }
  }, [smiles, colorScheme, rdkitLoading, renderMolecule]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputSmiles.trim()) {
      setSmiles(inputSmiles.trim());
    }
  };

  const loadExample = (exampleSmiles: string) => {
    setInputSmiles(exampleSmiles);
    setSmiles(exampleSmiles);
  };

  // RDKit still loading
  if (rdkitLoading) {
    return (
      <div className="container">
        <div className="header">
          <h1 className="title">ChemCP</h1>
          <p className="subtitle">Molecule Viewer from ChemIllusion</p>
        </div>
        <div className="loading">
          <div className="spinner" />
          <p>Loading RDKit.js...</p>
        </div>
      </div>
    );
  }

  // RDKit failed to load
  if (rdkitError) {
    return (
      <div className="container">
        <div className="header">
          <h1 className="title">ChemCP</h1>
          <p className="subtitle">Molecule Viewer from ChemIllusion</p>
        </div>
        <div className="error">{rdkitError}</div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="header">
        <h1 className="title">ChemCP</h1>
        <p className="subtitle">Molecule Viewer</p>
      </div>

      <form onSubmit={handleSubmit} className="input-section">
        <input
          type="text"
          value={inputSmiles}
          onChange={(e) => setInputSmiles(e.target.value)}
          placeholder="Enter SMILES (e.g., CCO, c1ccccc1)"
          className="smiles-input"
        />
        <button
          type="submit"
          className="render-btn"
          disabled={!inputSmiles.trim()}
        >
          Render
        </button>
      </form>

      {svgHtml && (
        <div className="color-scheme-section">
          <label htmlFor="color-scheme">Color Scheme:</label>
          <select
            id="color-scheme"
            value={colorScheme}
            onChange={(e) => setColorScheme(e.target.value as ColorSchemeKey)}
            className="color-scheme-select"
          >
            {Object.entries(COLOR_SCHEMES).map(([key, scheme]) => (
              <option key={key} value={key}>
                {scheme.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {error && <div className="error">{error}</div>}

      {svgHtml && (
        <div
          className="molecule-svg"
          dangerouslySetInnerHTML={{ __html: svgHtml }}
        />
      )}

      {properties && (
        <>
          <div className="canonical-smiles">
            {properties.canonicalSmiles}
          </div>

          <div className="properties">
            <h3>Molecular Properties</h3>
            <div className="props-grid">
              {properties.exactMW && (
                <div className="prop-row">
                  <span className="prop-label">Exact MW</span>
                  <span className="prop-value">{properties.exactMW}</span>
                </div>
              )}
              {properties.avgMW && (
                <div className="prop-row">
                  <span className="prop-label">Avg MW</span>
                  <span className="prop-value">{properties.avgMW}</span>
                </div>
              )}
              {properties.logP && (
                <div className="prop-row">
                  <span className="prop-label">CLogP</span>
                  <span className="prop-value">{properties.logP}</span>
                </div>
              )}
              {properties.hbDonors && (
                <div className="prop-row">
                  <span className="prop-label">HB Donors</span>
                  <span className="prop-value">{properties.hbDonors}</span>
                </div>
              )}
              {properties.hbAcceptors && (
                <div className="prop-row">
                  <span className="prop-label">HB Acceptors</span>
                  <span className="prop-value">{properties.hbAcceptors}</span>
                </div>
              )}
              {properties.tpsa && (
                <div className="prop-row">
                  <span className="prop-label">TPSA</span>
                  <span className="prop-value">
                    {properties.tpsa} &#8491;&sup2;
                  </span>
                </div>
              )}
              {properties.rotBonds && (
                <div className="prop-row">
                  <span className="prop-label">Rot. Bonds</span>
                  <span className="prop-value">{properties.rotBonds}</span>
                </div>
              )}
              {properties.rings && (
                <div className="prop-row">
                  <span className="prop-label">Rings</span>
                  <span className="prop-value">{properties.rings}</span>
                </div>
              )}
              {properties.aromaticRings && (
                <div className="prop-row">
                  <span className="prop-label">Aromatic Rings</span>
                  <span className="prop-value">{properties.aromaticRings}</span>
                </div>
              )}
              {properties.heavyAtoms && (
                <div className="prop-row">
                  <span className="prop-label">Heavy Atoms</span>
                  <span className="prop-value">{properties.heavyAtoms}</span>
                </div>
              )}
              {properties.fractionCSP3 && (
                <div className="prop-row">
                  <span className="prop-label">Frac. CSP3</span>
                  <span className="prop-value">{properties.fractionCSP3}</span>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {!svgHtml && !error && (
        <div className="examples">
          <p>Try an example molecule:</p>
          <div className="example-btns">
            {EXAMPLES.map((ex) => (
              <button
                key={ex.smiles}
                className="example-btn"
                onClick={() => loadExample(ex.smiles)}
              >
                {ex.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="chemillusion-link">
        <p>
          For more complex molecule interactions, try{" "}
          <a
            href="https://chemillusion.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            ChemIllusion
          </a>
        </p>
      </div>
    </div>
  );
}

// Mount
const container = document.getElementById("root");
if (container) {
  const root = createRoot(container);
  root.render(<ChemCPApp />);
}
