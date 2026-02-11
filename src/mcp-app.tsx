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
  get_morgan_fp(params?: string): string;
  get_morgan_fp_as_binary_text(params?: string): string;
  get_pattern_fp(): string;
  get_pattern_fp_as_binary_text(): string;
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

interface FingerprintData {
  binary: string; // Binary string representation
  type: 'morgan' | 'pattern';
}

const EXAMPLES = [
  { smiles: "CCO", name: "Ethanol" },
  { smiles: "c1ccccc1", name: "Benzene" },
  { smiles: "CC(=O)Oc1ccccc1C(=O)O", name: "Aspirin" },
  { smiles: "CN1C=NC2=C1C(=O)N(C(=O)N2C)C", name: "Caffeine" },
  { smiles: "CC12CCC3C(C1CCC2O)CCC4=CC(=O)CCC34C", name: "Testosterone" },
  { smiles: "OC[C@H]1OC(O)[C@H](O)[C@@H](O)[C@@H]1O", name: "Glucose" },
];

const COMPARISON_EXAMPLES = [
  {
    reference: { smiles: "CC(=O)Oc1ccccc1C(=O)O", name: "Aspirin" },
    comparison: { smiles: "Oc1ccccc1C(=O)O", name: "Salicylic Acid" },
    expectedSimilarity: 0.65
  },
  {
    reference: { smiles: "CN1C=NC2=C1C(=O)N(C(=O)N2C)C", name: "Caffeine" },
    comparison: { smiles: "Cn1cnc2c1c(=O)[nH]c(=O)n2C", name: "Theobromine" },
    expectedSimilarity: 0.85
  },
  {
    reference: { smiles: "c1ccccc1", name: "Benzene" },
    comparison: { smiles: "CCO", name: "Ethanol" },
    expectedSimilarity: 0.1
  },
];

// Tanimoto similarity calculation for binary fingerprints
function calculateTanimoto(fp1: string, fp2: string): number {
  let intersection = 0;
  let union = 0;

  for (let i = 0; i < fp1.length; i++) {
    const bit1 = fp1[i] === '1' ? 1 : 0;
    const bit2 = fp2[i] === '1' ? 1 : 0;

    if (bit1 === 1 || bit2 === 1) union++;
    if (bit1 === 1 && bit2 === 1) intersection++;
  }

  return union === 0 ? 0 : intersection / union;
}

// Generate fingerprint using RDKit.js
const generateFingerprint = (mol: RDKitMol, type: 'morgan' | 'pattern'): string | null => {
  try {
    if (type === 'morgan') {
      // Morgan fingerprint (ECFP4): radius=2, nBits=2048
      const params = JSON.stringify({ radius: 2, nBits: 2048 });
      return mol.get_morgan_fp_as_binary_text(params);
    } else {
      // RDKit pattern (topological) fingerprint
      return mol.get_pattern_fp_as_binary_text();
    }
  } catch (e) {
    console.error(`Failed to generate ${type} fingerprint:`, e);
    return null;
  }
};


function ChemCPApp() {
  const [smiles, setSmiles] = useState("");
  const [inputSmiles, setInputSmiles] = useState("");
  const [svgHtml, setSvgHtml] = useState("");
  const [properties, setProperties] = useState<MolProperties | null>(null);
  const [error, setError] = useState("");
  const [rdkitLoading, setRdkitLoading] = useState(true);
  const [rdkitError, setRdkitError] = useState("");
  const [compareSmiles, setCompareSmiles] = useState("");
  const [compareInputSmiles, setCompareInputSmiles] = useState("");
  const [compareSvgHtml, setCompareSvgHtml] = useState("");
  const [compareProperties, setCompareProperties] = useState<MolProperties | null>(null);
  const [fingerprintType, setFingerprintType] = useState<'morgan' | 'pattern'>('morgan');
  const [tanimotoScore, setTanimotoScore] = useState<number | null>(null);
  const [showComparison, setShowComparison] = useState(false);
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
  const renderMolecule = useCallback((smilesStr: string, isComparison: boolean = false) => {
    const RDKit = rdkitRef.current;
    if (!RDKit || !smilesStr.trim()) return;

    setError("");

    let mol: RDKitMol | null = null;
    try {
      mol = RDKit.get_mol(smilesStr);
      if (!mol || !mol.is_valid()) {
        const errorMsg = `Invalid SMILES: "${smilesStr}"`;
        setError(errorMsg);
        if (isComparison) {
          setCompareSvgHtml("");
          setCompareProperties(null);
        } else {
          setSvgHtml("");
          setProperties(null);
        }
        if (mol) mol.delete();
        return;
      }

      // Render SVG
      let svg: string;
      try {
        const drawOptions: any = { width: 450, height: 300 };
        svg = mol.get_svg_with_highlights(JSON.stringify(drawOptions));
      } catch {
        // Fallback if get_svg_with_highlights doesn't accept size options
        try {
          svg = mol.get_svg(450, 300);
        } catch {
          svg = mol.get_svg();
        }
      }
      if (isComparison) {
        setCompareSvgHtml(svg);
      } else {
        setSvgHtml(svg);
      }

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

      // Generate fingerprint for similarity comparison
      let fingerprint: string | null = null;
      try {
        fingerprint = generateFingerprint(mol, fingerprintType);
      } catch (e) {
        console.warn('Failed to generate fingerprint:', e);
      }

      // Calculate Tanimoto similarity if we have both molecules and this is a comparison
      if (isComparison && fingerprint && compareSmiles) {
        // This is a comparison molecule, calculate similarity with main molecule
        try {
          const mainMol = rdkitRef.current?.get_mol(smiles);
          if (mainMol && mainMol.is_valid()) {
            const mainFingerprint = generateFingerprint(mainMol, fingerprintType);
            if (mainFingerprint && fingerprint) {
              const similarity = calculateTanimoto(mainFingerprint, fingerprint);
              setTanimotoScore(similarity);
            }
            mainMol.delete();
          }
        } catch (e) {
          console.warn('Failed to calculate similarity:', e);
        }
      }

      if (isComparison) {
        setCompareProperties(props);
      } else {
        setProperties(props);
      }

      mol.delete();
    } catch (e) {
      const errorMsg = `Error rendering molecule: ${e instanceof Error ? e.message : e}`;
      setError(errorMsg);
      if (isComparison) {
        setCompareSvgHtml("");
        setCompareProperties(null);
      } else {
        setSvgHtml("");
        setProperties(null);
      }
      if (mol) {
        try { mol.delete(); } catch { /* ignore */ }
      }
    }
  }, []);

  // Re-render when SMILES changes
  useEffect(() => {
    if (smiles && !rdkitLoading && rdkitRef.current) {
      renderMolecule(smiles);
    }
  }, [smiles, rdkitLoading, renderMolecule]);

  // Re-render when comparison SMILES changes
  useEffect(() => {
    if (compareSmiles && !rdkitLoading && rdkitRef.current) {
      renderMolecule(compareSmiles, true);
    }
  }, [compareSmiles, rdkitLoading, renderMolecule, fingerprintType]);

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

  const handleCompareSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (compareInputSmiles.trim()) {
      setCompareSmiles(compareInputSmiles.trim());
    }
  };

  const clearComparison = () => {
    setCompareSmiles("");
    setCompareInputSmiles("");
    setCompareSvgHtml("");
    setCompareProperties(null);
    setTanimotoScore(null);
  };

  const toggleComparison = () => {
    setShowComparison(!showComparison);
    if (showComparison) {
      clearComparison();
    }
  };

  const loadComparisonExample = (referenceSmiles: string, comparisonSmiles: string) => {
    setSmiles(referenceSmiles);
    setInputSmiles(referenceSmiles);
    setCompareSmiles(comparisonSmiles);
    setCompareInputSmiles(comparisonSmiles);
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

      {svgHtml && (
        <div className="comparison-toggle">
          <button
            type="button"
            className="comparison-toggle-btn"
            onClick={toggleComparison}
          >
            {showComparison ? 'Hide Comparison' : 'Compare Molecules'}
          </button>
        </div>
      )}

      {showComparison && (
        <div className="comparison-section">
          <h3>Molecular Similarity Comparison</h3>

          <div className="fingerprint-selector">
            <label htmlFor="fingerprint-type">Fingerprint Type:</label>
            <select
              id="fingerprint-type"
              value={fingerprintType}
              onChange={(e) => setFingerprintType(e.target.value as 'morgan' | 'pattern')}
              className="fingerprint-select"
            >
              <option value="morgan">Morgan (ECFP4) - Recommended</option>
              <option value="pattern">Pattern (Topological)</option>
            </select>
          </div>

          <div className="comparison-examples">
            <p>Try example comparisons:</p>
            <div className="example-btns">
              {COMPARISON_EXAMPLES.map((example, index) => (
                <button
                  key={index}
                  className="example-btn"
                  onClick={() => loadComparisonExample(example.reference.smiles, example.comparison.smiles)}
                  title={`Compare ${example.reference.name} vs ${example.comparison.name} (~${example.expectedSimilarity} similarity)`}
                >
                  {example.reference.name} vs {example.comparison.name}
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleCompareSubmit} className="input-section">
            <input
              type="text"
              value={compareInputSmiles}
              onChange={(e) => setCompareInputSmiles(e.target.value)}
              placeholder="Enter SMILES to compare (e.g., CCO, c1ccccc1)"
              className="smiles-input"
            />
            <button
              type="submit"
              className="render-btn"
              disabled={!compareInputSmiles.trim()}
            >
              Compare
            </button>
            {compareSmiles && (
              <button
                type="button"
                className="clear-btn"
                onClick={clearComparison}
              >
                Clear
              </button>
            )}
          </form>

          {compareSvgHtml && compareProperties && (
            <div className="comparison-display">
              {tanimotoScore !== null && (
                <div className="similarity-score">
                  <h4>Tanimoto Similarity: {tanimotoScore.toFixed(3)}</h4>
                  <div className="similarity-bar">
                    <div
                      className="similarity-fill"
                      style={{
                        width: `${tanimotoScore * 100}%`,
                        backgroundColor: tanimotoScore > 0.7 ? '#22c55e' : tanimotoScore > 0.3 ? '#eab308' : '#ef4444'
                      }}
                    />
                  </div>
                  <div className="similarity-labels">
                    <span>0.0</span>
                    <span>0.5</span>
                    <span>1.0</span>
                  </div>
                </div>
              )}

              <div className="molecules-comparison">
                <div className="molecule-panel">
                  <h4>Reference Molecule</h4>
                  <div className="molecule-svg" dangerouslySetInnerHTML={{ __html: svgHtml }} />
                  <div className="canonical-smiles">{properties?.canonicalSmiles}</div>
                </div>

                <div className="molecule-panel">
                  <h4>Comparison Molecule</h4>
                  <div className="molecule-svg" dangerouslySetInnerHTML={{ __html: compareSvgHtml }} />
                  <div className="canonical-smiles">{compareProperties.canonicalSmiles}</div>
                </div>
              </div>
            </div>
          )}
        </div>
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
