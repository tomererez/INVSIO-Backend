// =============================================================================
// CalibrationPanel.jsx
// =============================================================================
// Config-Driven Calibration System UI
// Side-by-side config comparison with delta highlighting, history, and safety rails

import React, { useState, useEffect, useCallback } from 'react';
import {
    Settings,
    History,
    Download,
    Upload,
    Save,
    RotateCcw,
    AlertTriangle,
    CheckCircle,
    XCircle,
    ChevronDown,
    ChevronRight,
    RefreshCw,
    Eye,
    Copy,
    Info,
    X
} from 'lucide-react';

const API_BASE = 'http://localhost:3000/api';

// =============================================================================
// SIGNAL EXPLANATIONS (How each signal is calculated in our code)
// =============================================================================

const SIGNAL_EXPLANATIONS = {
    exchange_divergence: {
        title: "Exchange Divergence",
        description: "Compares behavior between Binance (retail) and Bybit (whale) to detect smart money movements.",
        calculation: [
            "1. Calculate OI changes for both exchanges",
            "2. Compare price action vs OI direction",
            "3. Detect scenarios: whale_distribution, whale_accumulation, retail_fomo, etc.",
            "4. Higher weight when Bybit leads and Binance follows"
        ],
        codeFile: "marketMetrics.js",
        codeLines: "600-735",
        keyFunction: "analyzeExchangeDivergence(binanceData, bybitData, timeframe)"
    },
    market_regime: {
        title: "Market Regime",
        description: "Identifies the current market phase (accumulation, distribution, trending) based on price and OI patterns.",
        calculation: [
            "1. Analyze OI trends (rising/falling) vs price trends",
            "2. Detect cycle phases: accumulation, distribution, covering",
            "3. Classify sub-types: healthy_bull, long_trap, short_squeeze, etc.",
            "4. Map regime to bias: distribution → SHORT, accumulation → LONG"
        ],
        codeFile: "marketMetrics.js",
        codeLines: "800-950",
        keyFunction: "analyzeMarketRegime(priceChange, oiChange, funding, timeframe)"
    },
    structure: {
        title: "Market Structure",
        description: "Technical analysis of support/resistance levels and break of structure (BoS) events.",
        calculation: [
            "1. Identify recent swing highs and lows",
            "2. Detect Break of Structure (BoS) events",
            "3. Check if price is at support/resistance levels",
            "4. Bullish BoS → LONG, Bearish BoS → SHORT"
        ],
        codeFile: "marketMetrics.js",
        codeLines: "1100-1200",
        keyFunction: "analyzeMarketStructure(candles)"
    },
    technical: {
        title: "Technical Analysis",
        description: "Classical technical indicators including trend direction, momentum, and volatility.",
        calculation: [
            "1. Calculate EMA20/EMA50 crossovers",
            "2. Measure momentum from 24h price change",
            "3. Assess volatility and drawdown",
            "4. Combine for technicalBias: LONG/SHORT/WAIT"
        ],
        codeFile: "marketMetrics.js",
        codeLines: "1250-1400",
        keyFunction: "calculateTechnicalMetrics(snapshot, history)"
    },
    cvd: {
        title: "Cumulative Volume Delta (CVD)",
        description: "Measures net buying vs selling pressure by tracking aggressive orders hitting the bid/ask.",
        calculation: [
            "1. Fetch CVD data per timeframe (30m, 1h, 4h, 1d)",
            "2. Calculate CVD slope (normalized rate of change)",
            "3. Gate: Exclude if slope < slopeWeak threshold",
            "4. Detect: accumulation, distribution, divergence, confirmation",
            "5. Apply resolution gating for scalping timeframes"
        ],
        codeFile: "marketMetrics.js",
        codeLines: "221-310 (interpretCVD)",
        keyFunction: "interpretCVD(cvdData, priceChange, timeframe)"
    },
    vwap: {
        title: "Volume Weighted Average Price (VWAP)",
        description: "Daily session-based fair value indicator with fixed ±1%/±2% bands.",
        calculation: [
            "1. VWAP calculated from 00:00 UTC daily",
            "2. Measure price deviation from VWAP",
            "3. Inner band (±1%): weak signal",
            "4. Outer band (±2%): strong signal",
            "5. Above VWAP → SHORT bias, Below → LONG bias"
        ],
        codeFile: "marketMetrics.js",
        codeLines: "362-398 (interpretVWAP)",
        keyFunction: "interpretVWAP(vwapData)"
    },
    funding: {
        title: "Funding Rate",
        description: "Measures crowding in perpetual futures positions. Extreme funding suggests reversal potential.",
        calculation: [
            "1. Fetch current funding rate",
            "2. Calculate Z-score against historical average",
            "3. Classify: normal, high, critical_high",
            "4. High positive → SHORT (too many longs)",
            "5. High negative → LONG (too many shorts)"
        ],
        codeFile: "marketMetrics.js",
        codeLines: "1050-1100",
        keyFunction: "calculateFundingAdvanced(fundingRates)"
    }
};

// =============================================================================
// DELTA CALCULATION HELPERS
// =============================================================================

function calculateDelta(oldVal, newVal) {
    if (typeof oldVal !== 'number' || typeof newVal !== 'number' || oldVal === 0) {
        return null;
    }
    return ((newVal - oldVal) / oldVal) * 100;
}

function getDeltaColor(delta) {
    if (delta === null || delta === 0) return 'text-slate-400';
    if (delta > 0) return 'text-emerald-400';
    return 'text-red-400';
}

function getDeltaBg(delta) {
    if (delta === null || Math.abs(delta) < 0.1) return '';
    if (delta > 0) return 'bg-emerald-500/10';
    return 'bg-red-500/10';
}

// =============================================================================
// FORMAT HELPERS
// =============================================================================

/**
 * Check if a path is a weight (should be displayed as percentage)
 */
function isWeightPath(path) {
    return path.includes('weights.signals') || path.includes('penalties');
}

/**
 * Format a value for display
 * Weights/penalties are shown as percentages (0.35 → 35%)
 * Other values shown as-is
 */
function formatDisplayValue(value, path) {
    if (typeof value !== 'number') return String(value);

    if (isWeightPath(path)) {
        return `${(value * 100).toFixed(1)}%`;
    }
    return value.toFixed(4).replace(/\.?0+$/, '');
}

/**
 * Convert display value to storage value
 * For weights: 35% → 0.35
 */
function parseInputValue(inputValue, path) {
    const num = parseFloat(inputValue);
    if (isNaN(num)) return 0;

    if (isWeightPath(path)) {
        return num / 100;  // Convert from percentage
    }
    return num;
}

/**
 * Format input field value
 * For weights: show 35 (user types percentage)
 */
function formatInputValue(value, path) {
    if (typeof value !== 'number') return '';

    if (isWeightPath(path)) {
        return (value * 100).toFixed(1);  // 0.35 → 35.0
    }
    return value.toString();
}

// =============================================================================
// SIGNAL EXPLANATION MODAL COMPONENT
// =============================================================================

function SignalExplanationModal({ signalKey, onClose }) {
    const explanation = SIGNAL_EXPLANATIONS[signalKey];
    const [codeSnippet, setCodeSnippet] = useState(null);
    const [loadingCode, setLoadingCode] = useState(false);
    const [codeError, setCodeError] = useState(null);
    const [copied, setCopied] = useState(false);

    // Parse line range from codeLines (e.g., "221-310" or "600-735")
    const parseLineRange = (codeLines) => {
        const match = codeLines.match(/(\d+)-(\d+)/);
        if (match) {
            return { start: parseInt(match[1]), end: parseInt(match[2]) };
        }
        // Single line or just start
        const single = parseInt(codeLines);
        if (!isNaN(single)) {
            return { start: single, end: single + 50 };
        }
        return null;
    };

    const fetchCodeSnippet = async () => {
        if (!explanation) return;

        setLoadingCode(true);
        setCodeError(null);

        try {
            const range = parseLineRange(explanation.codeLines);
            if (!range) {
                setCodeError('Invalid line range');
                return;
            }

            const res = await fetch(
                `${API_BASE}/config/code-snippet?file=${explanation.codeFile}&startLine=${range.start}&endLine=${range.end}`
            );
            const data = await res.json();

            if (data.success) {
                setCodeSnippet(data);
            } else {
                setCodeError(data.error || 'Failed to fetch code');
            }
        } catch (err) {
            setCodeError(err.message);
        } finally {
            setLoadingCode(false);
        }
    };

    const copyToClipboard = async () => {
        if (codeSnippet?.code) {
            await navigator.clipboard.writeText(codeSnippet.code);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const downloadSnippet = () => {
        if (codeSnippet?.code) {
            const blob = new Blob([codeSnippet.code], { type: 'text/javascript' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${signalKey}_${codeSnippet.file}_L${codeSnippet.startLine}-${codeSnippet.endLine}.js`;
            a.click();
            URL.revokeObjectURL(url);
        }
    };

    if (!explanation) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-slate-800 border border-slate-700 rounded-xl max-w-3xl w-full mx-4 shadow-2xl max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-slate-700 shrink-0">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        <Info className="w-5 h-5 text-violet-400" />
                        {explanation.title}
                    </h3>
                    <button
                        onClick={onClose}
                        className="text-slate-400 hover:text-white transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-4 space-y-4 overflow-y-auto flex-1">
                    {/* Description */}
                    <div>
                        <p className="text-slate-300">{explanation.description}</p>
                    </div>

                    {/* Calculation Steps */}
                    <div>
                        <h4 className="text-sm font-semibold text-violet-400 uppercase mb-2">How It's Calculated</h4>
                        <ul className="space-y-1">
                            {explanation.calculation.map((step, i) => (
                                <li key={i} className="text-slate-300 text-sm flex items-start gap-2">
                                    <span className="text-violet-400 mt-0.5">•</span>
                                    {step}
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* Code Reference */}
                    <div className="bg-slate-900/50 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                            <h4 className="text-sm font-semibold text-emerald-400 uppercase">Code Reference</h4>
                            <button
                                onClick={fetchCodeSnippet}
                                disabled={loadingCode}
                                className="text-xs px-3 py-1 bg-violet-600 text-white rounded hover:bg-violet-500 disabled:opacity-50 flex items-center gap-1"
                            >
                                {loadingCode ? (
                                    <RefreshCw className="w-3 h-3 animate-spin" />
                                ) : (
                                    <Eye className="w-3 h-3" />
                                )}
                                {codeSnippet ? 'Refresh Code' : 'View Code'}
                            </button>
                        </div>

                        <div className="space-y-1 text-sm">
                            <div className="flex items-center gap-2">
                                <span className="text-slate-500">File:</span>
                                <code className="text-cyan-400 bg-slate-800 px-2 py-0.5 rounded">
                                    src/services/{explanation.codeFile}
                                </code>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-slate-500">Lines:</span>
                                <code className="text-amber-400 bg-slate-800 px-2 py-0.5 rounded">
                                    {explanation.codeLines}
                                </code>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-slate-500">Function:</span>
                                <code className="text-pink-400 bg-slate-800 px-2 py-0.5 rounded text-xs">
                                    {explanation.keyFunction}
                                </code>
                            </div>
                        </div>

                        {/* Code Error */}
                        {codeError && (
                            <div className="mt-3 text-red-400 text-sm bg-red-500/10 p-2 rounded">
                                Error: {codeError}
                            </div>
                        )}

                        {/* Code Snippet Display */}
                        {codeSnippet && (
                            <div className="mt-3">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs text-slate-500">
                                        {codeSnippet.file} • Lines {codeSnippet.startLine}-{codeSnippet.endLine} ({codeSnippet.totalLines} lines)
                                    </span>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={copyToClipboard}
                                            className="text-xs px-2 py-1 bg-slate-700 text-slate-300 rounded hover:bg-slate-600 flex items-center gap-1"
                                        >
                                            {copied ? (
                                                <>
                                                    <CheckCircle className="w-3 h-3 text-emerald-400" />
                                                    Copied!
                                                </>
                                            ) : (
                                                <>
                                                    <Copy className="w-3 h-3" />
                                                    Copy
                                                </>
                                            )}
                                        </button>
                                        <button
                                            onClick={downloadSnippet}
                                            className="text-xs px-2 py-1 bg-slate-700 text-slate-300 rounded hover:bg-slate-600 flex items-center gap-1"
                                        >
                                            <Download className="w-3 h-3" />
                                            Download
                                        </button>
                                    </div>
                                </div>
                                <pre className="bg-slate-950 rounded-lg p-3 overflow-x-auto text-xs font-mono text-slate-300 max-h-64 overflow-y-auto">
                                    {codeSnippet.code.split('\n').map((line, i) => (
                                        <div key={i} className="flex">
                                            <span className="text-slate-600 select-none w-12 text-right pr-3 shrink-0">
                                                {codeSnippet.startLine + i}
                                            </span>
                                            <span className="whitespace-pre">{line}</span>
                                        </div>
                                    ))}
                                </pre>
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-slate-700 flex justify-end shrink-0">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-colors"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function CalibrationPanel() {
    // State
    const [currentConfig, setCurrentConfig] = useState(null);
    const [proposedConfig, setProposedConfig] = useState(null);
    const [currentVersion, setCurrentVersion] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);
    const [history, setHistory] = useState([]);
    const [showHistory, setShowHistory] = useState(false);
    const [notes, setNotes] = useState('');
    const [validationResult, setValidationResult] = useState(null);
    const [expandedSections, setExpandedSections] = useState({
        thresholds: true,
        weights: true,
        gates: false,
        penalties: false,
        bounds: false
    });
    const [selectedSignal, setSelectedSignal] = useState(null);

    // Load config on mount
    useEffect(() => {
        loadConfig();
    }, []);

    // ==========================================================================
    // API CALLS
    // ==========================================================================

    const loadConfig = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`${API_BASE}/config`);
            const data = await res.json();

            if (data.success) {
                setCurrentConfig(data.config);
                setProposedConfig(JSON.parse(JSON.stringify(data.config)));
                setCurrentVersion(data.version);
            } else {
                setError(data.error || 'Failed to load config');
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const loadHistory = async () => {
        try {
            const res = await fetch(`${API_BASE}/config/history`);
            const data = await res.json();
            if (data.success) {
                setHistory(data.history || []);
            }
        } catch (err) {
            console.error('Failed to load history:', err);
        }
    };

    const validateConfig = async () => {
        try {
            const res = await fetch(`${API_BASE}/config/validate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    config: proposedConfig,
                    current_config: currentConfig
                })
            });
            const data = await res.json();
            setValidationResult(data);
            return data.valid;
        } catch (err) {
            setError(err.message);
            return false;
        }
    };

    const saveConfig = async () => {
        if (!notes.trim()) {
            setError('Please provide notes explaining the changes');
            return;
        }

        const isValid = await validateConfig();
        if (!isValid) {
            setError('Validation failed. Check the validation results.');
            return;
        }

        setSaving(true);
        setError(null);
        try {
            const res = await fetch(`${API_BASE}/config`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    config: proposedConfig,
                    based_on_version: currentVersion,
                    notes: notes,
                    created_by: 'calibration_panel'
                })
            });
            const data = await res.json();

            if (data.success) {
                setSuccess(`Config saved as version ${data.version}`);
                setNotes('');
                await loadConfig();
                await loadHistory();
            } else if (data.conflict) {
                setError('Version conflict! Config was modified by someone else. Please refresh.');
            } else {
                setError(data.error || 'Failed to save config');
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    const rollbackToVersion = async (version) => {
        if (!window.confirm(`Rollback to version ${version}? This will create a new version.`)) {
            return;
        }

        setSaving(true);
        try {
            const res = await fetch(`${API_BASE}/config/rollback`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    target_version: version,
                    created_by: 'calibration_panel'
                })
            });
            const data = await res.json();

            if (data.success) {
                setSuccess(`Rolled back to version ${version}`);
                await loadConfig();
                await loadHistory();
            } else {
                setError(data.error);
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    const exportConfig = async () => {
        try {
            const res = await fetch(`${API_BASE}/config/export`);
            const data = await res.json();

            if (data.success) {
                const blob = new Blob([JSON.stringify(data.export, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `config-export-${currentVersion}.json`;
                a.click();
                URL.revokeObjectURL(url);
            }
        } catch (err) {
            setError(err.message);
        }
    };

    const importProposal = async () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            try {
                const text = await file.text();
                const proposal = JSON.parse(text);

                const res = await fetch(`${API_BASE}/config/import`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ proposal })
                });
                const data = await res.json();

                if (data.success) {
                    setProposedConfig(data.proposed_config);
                    setValidationResult(data.validation);
                    setSuccess(`Imported ${data.applied_changes} changes from proposal`);
                } else {
                    setError(data.error || 'Import failed');
                }
            } catch (err) {
                setError(`Import failed: ${err.message}`);
            }
        };
        input.click();
    };

    // ==========================================================================
    // UI HANDLERS
    // ==========================================================================

    const updateProposedValue = (path, value) => {
        const newConfig = JSON.parse(JSON.stringify(proposedConfig));
        const parts = path.split('.');
        let current = newConfig;

        for (let i = 0; i < parts.length - 1; i++) {
            current = current[parts[i]];
        }

        current[parts[parts.length - 1]] = value;
        setProposedConfig(newConfig);
        setValidationResult(null); // Clear validation on change
    };

    const resetToCurrentValue = (path) => {
        const parts = path.split('.');
        let value = currentConfig;
        for (const part of parts) {
            value = value[part];
        }
        updateProposedValue(path, value);
    };

    const toggleSection = (section) => {
        setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
    };

    // ==========================================================================
    // RENDER HELPERS
    // ==========================================================================

    const renderConfigRow = (path, label, currentVal, proposedVal, isSignalWeight = false) => {
        const delta = calculateDelta(currentVal, proposedVal);
        const deltaColor = getDeltaColor(delta);
        const deltaBg = getDeltaBg(delta);
        const isChanged = currentVal !== proposedVal;
        const signalKey = isSignalWeight ? label : null;
        const hasExplanation = signalKey && SIGNAL_EXPLANATIONS[signalKey];

        return (
            <div key={path} className={`grid grid-cols-12 gap-2 py-2 px-3 rounded ${deltaBg} ${isChanged ? 'border-l-2 border-amber-500' : ''}`}>
                {/* Label */}
                <div className="col-span-4 text-sm text-slate-300 truncate flex items-center gap-1" title={path}>
                    {hasExplanation ? (
                        <button
                            onClick={() => setSelectedSignal(signalKey)}
                            className="flex items-center gap-1 hover:text-violet-400 transition-colors cursor-pointer"
                        >
                            <Info className="w-3 h-3 text-violet-400" />
                            <span className="underline decoration-dotted underline-offset-2">
                                {label || path.split('.').pop()}
                            </span>
                        </button>
                    ) : (
                        <span>{label || path.split('.').pop()}</span>
                    )}
                </div>

                {/* Current Value */}
                <div className="col-span-2 text-sm text-slate-400 text-right font-mono">
                    {formatDisplayValue(currentVal, path)}
                </div>

                {/* Proposed Value (editable) */}
                <div className="col-span-3 flex items-center gap-1">
                    <input
                        type="number"
                        step="any"
                        value={formatInputValue(proposedVal, path)}
                        onChange={(e) => updateProposedValue(path, parseInputValue(e.target.value, path))}
                        className="w-full bg-slate-700/50 border border-slate-600 rounded px-2 py-1 text-sm text-white font-mono text-right focus:outline-none focus:ring-1 focus:ring-violet-500"
                    />
                    {isWeightPath(path) && (
                        <span className="text-slate-500 text-xs">%</span>
                    )}
                </div>

                {/* Delta */}
                <div className={`col-span-2 text-sm text-right font-mono ${deltaColor}`}>
                    {delta !== null ? `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%` : '-'}
                </div>

                {/* Reset button */}
                <div className="col-span-1 flex justify-center">
                    {isChanged && (
                        <button
                            onClick={() => resetToCurrentValue(path)}
                            className="text-slate-500 hover:text-slate-300"
                            title="Reset to current"
                        >
                            <RotateCcw className="w-3 h-3" />
                        </button>
                    )}
                </div>
            </div>
        );
    };

    const renderSection = (sectionKey, sectionConfig, proposedSection, parentPath = '', isSignalWeights = false) => {
        if (!sectionConfig || typeof sectionConfig !== 'object') return null;

        const rows = [];

        for (const [key, value] of Object.entries(sectionConfig)) {
            const path = parentPath ? `${parentPath}.${key}` : `${sectionKey}.${key}`;
            const proposedValue = proposedSection?.[key];

            if (typeof value === 'number') {
                rows.push(renderConfigRow(path, key, value, proposedValue, isSignalWeights));
            } else if (typeof value === 'object' && value !== null) {
                // Nested object - render recursively
                rows.push(
                    <div key={path} className="mt-2 ml-4">
                        <div className="text-xs text-slate-500 uppercase mb-1">{key}</div>
                        {renderSection(sectionKey, value, proposedValue, path, false)}
                    </div>
                );
            }
        }

        return <div className="space-y-1">{rows}</div>;
    };

    // ==========================================================================
    // MAIN RENDER
    // ==========================================================================

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <RefreshCw className="w-8 h-8 text-violet-400 animate-spin" />
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto space-y-6 p-6">
            {/* Signal Explanation Modal */}
            {selectedSignal && (
                <SignalExplanationModal
                    signalKey={selectedSignal}
                    onClose={() => setSelectedSignal(null)}
                />
            )}

            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        <Settings className="w-6 h-6 text-violet-400" />
                        Calibration Panel
                    </h2>
                    <p className="text-sm text-slate-400 mt-1">
                        Version: <span className="text-violet-400 font-mono">{currentVersion}</span>
                    </p>
                </div>

                <div className="flex gap-2">
                    <button
                        onClick={loadConfig}
                        className="flex items-center gap-2 px-3 py-2 bg-slate-700/50 text-slate-300 rounded-lg hover:bg-slate-700"
                    >
                        <RefreshCw className="w-4 h-4" />
                        Refresh
                    </button>
                    <button
                        onClick={() => { setShowHistory(!showHistory); if (!showHistory) loadHistory(); }}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg ${showHistory ? 'bg-violet-600 text-white' : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'}`}
                    >
                        <History className="w-4 h-4" />
                        History
                    </button>
                    <button
                        onClick={exportConfig}
                        className="flex items-center gap-2 px-3 py-2 bg-slate-700/50 text-slate-300 rounded-lg hover:bg-slate-700"
                    >
                        <Download className="w-4 h-4" />
                        Export
                    </button>
                    <button
                        onClick={importProposal}
                        className="flex items-center gap-2 px-3 py-2 bg-slate-700/50 text-slate-300 rounded-lg hover:bg-slate-700"
                    >
                        <Upload className="w-4 h-4" />
                        Import
                    </button>
                </div>
            </div>

            {/* Alerts */}
            {error && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 flex items-center gap-3">
                    <XCircle className="w-5 h-5 text-red-400" />
                    <span className="text-red-400">{error}</span>
                    <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-300">×</button>
                </div>
            )}

            {success && (
                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4 flex items-center gap-3">
                    <CheckCircle className="w-5 h-5 text-emerald-400" />
                    <span className="text-emerald-400">{success}</span>
                    <button onClick={() => setSuccess(null)} className="ml-auto text-emerald-400 hover:text-emerald-300">×</button>
                </div>
            )}

            {/* History Panel */}
            {showHistory && (
                <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
                    <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                        <History className="w-5 h-5 text-violet-400" />
                        Version History
                    </h3>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                        {history.length === 0 ? (
                            <p className="text-slate-400 text-sm">No history available</p>
                        ) : (
                            history.map((entry, i) => (
                                <div key={i} className="flex items-center justify-between py-2 px-3 bg-slate-700/30 rounded">
                                    <div>
                                        <span className="font-mono text-violet-400">{entry.version}</span>
                                        <span className="text-slate-500 mx-2">•</span>
                                        <span className="text-slate-400 text-sm">{entry.action}</span>
                                        <span className="text-slate-500 mx-2">•</span>
                                        <span className="text-slate-500 text-sm">{new Date(entry.created_at).toLocaleString()}</span>
                                    </div>
                                    <div className="flex gap-2">
                                        <span className={`text-xs px-2 py-0.5 rounded ${entry.validation_status === 'validated' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                                            {entry.validation_status}
                                        </span>
                                        {entry.version !== currentVersion && (
                                            <button
                                                onClick={() => rollbackToVersion(entry.version)}
                                                className="text-xs px-2 py-0.5 bg-slate-600/50 text-slate-300 rounded hover:bg-slate-600"
                                            >
                                                Rollback
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}

            {/* Main Config Panel */}
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
                {/* Column Headers */}
                <div className="grid grid-cols-12 gap-2 py-3 px-4 bg-slate-700/30 border-b border-slate-700/50 text-xs text-slate-400 uppercase">
                    <div className="col-span-4">Parameter</div>
                    <div className="col-span-2 text-right">Current</div>
                    <div className="col-span-3 text-center">Proposed</div>
                    <div className="col-span-2 text-right">Delta</div>
                    <div className="col-span-1"></div>
                </div>

                {/* Config Sections */}
                <div className="divide-y divide-slate-700/50">
                    {/* Weights Section */}
                    <div className="p-4">
                        <button
                            onClick={() => toggleSection('weights')}
                            className="flex items-center gap-2 text-lg font-semibold text-white w-full"
                        >
                            {expandedSections.weights ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                            Signal Weights
                            <span className="text-xs text-slate-500 ml-2">Must sum to 100%</span>
                        </button>
                        {expandedSections.weights && currentConfig?.weights?.signals && (
                            <div className="mt-3">
                                {renderSection('weights.signals', currentConfig.weights.signals, proposedConfig?.weights?.signals, '', true)}
                            </div>
                        )}
                    </div>

                    {/* Thresholds Section */}
                    <div className="p-4">
                        <button
                            onClick={() => toggleSection('thresholds')}
                            className="flex items-center gap-2 text-lg font-semibold text-white w-full"
                        >
                            {expandedSections.thresholds ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                            Thresholds (per timeframe)
                        </button>
                        {expandedSections.thresholds && currentConfig?.thresholds && (
                            <div className="mt-3">
                                {['30m', '1h', '4h', '1d'].map(tf => (
                                    <div key={tf} className="mb-4">
                                        <div className="text-sm text-violet-400 font-semibold mb-2">{tf}</div>
                                        {renderSection(`thresholds.${tf}`, currentConfig.thresholds[tf], proposedConfig?.thresholds?.[tf])}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Gates Section */}
                    <div className="p-4">
                        <button
                            onClick={() => toggleSection('gates')}
                            className="flex items-center gap-2 text-lg font-semibold text-white w-full"
                        >
                            {expandedSections.gates ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                            Gates (minimum conditions)
                        </button>
                        {expandedSections.gates && currentConfig?.gates && (
                            <div className="mt-3">
                                {renderSection('gates', currentConfig.gates, proposedConfig?.gates)}
                            </div>
                        )}
                    </div>

                    {/* Penalties Section */}
                    <div className="p-4">
                        <button
                            onClick={() => toggleSection('penalties')}
                            className="flex items-center gap-2 text-lg font-semibold text-white w-full"
                        >
                            {expandedSections.penalties ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                            Penalties (confidence reducers)
                        </button>
                        {expandedSections.penalties && currentConfig?.penalties && (
                            <div className="mt-3">
                                {renderSection('penalties', currentConfig.penalties, proposedConfig?.penalties)}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Validation Results */}
            {validationResult && (
                <div className={`rounded-xl border p-4 ${validationResult.valid ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
                    <div className="flex items-center gap-2 mb-2">
                        {validationResult.valid ? (
                            <CheckCircle className="w-5 h-5 text-emerald-400" />
                        ) : (
                            <AlertTriangle className="w-5 h-5 text-red-400" />
                        )}
                        <span className={validationResult.valid ? 'text-emerald-400' : 'text-red-400'}>
                            {validationResult.valid ? 'Validation Passed' : 'Validation Failed'}
                        </span>
                    </div>
                    {validationResult.structure_errors?.length > 0 && (
                        <ul className="text-sm text-red-400 ml-7 list-disc">
                            {validationResult.structure_errors.map((e, i) => <li key={i}>{e}</li>)}
                        </ul>
                    )}
                    {validationResult.delta_violations?.length > 0 && (
                        <ul className="text-sm text-amber-400 ml-7 list-disc mt-2">
                            {validationResult.delta_violations.map((e, i) => <li key={i}>{e}</li>)}
                        </ul>
                    )}
                </div>
            )}

            {/* Apply Changes */}
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
                <h3 className="text-lg font-semibold text-white mb-3">Apply Changes</h3>

                <div className="mb-4">
                    <label className="block text-sm text-slate-400 mb-1">Notes (required)</label>
                    <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Explain why you're making these changes..."
                        className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                        rows={2}
                    />
                </div>

                <div className="flex gap-3">
                    <button
                        onClick={validateConfig}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600"
                    >
                        <Eye className="w-4 h-4" />
                        Validate
                    </button>
                    <button
                        onClick={saveConfig}
                        disabled={saving || !notes.trim()}
                        className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Apply Changes
                    </button>
                </div>
            </div>
        </div>
    );
}
