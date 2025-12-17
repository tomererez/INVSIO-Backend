import React, { useState, useEffect, useCallback } from 'react';
import {
    PlayCircle,
    Pause,
    RefreshCw,
    ChevronDown,
    ChevronRight,
    Filter,
    Clock,
    TrendingUp,
    TrendingDown,
    Minus,
    AlertCircle,
    CheckCircle,
    XCircle,
    BarChart3,
    Target,
    Activity,
    Download,
    BookOpen,
    Trash2
} from 'lucide-react';
import BacktestGuidePanel from './BacktestGuidePanel';

const API_BASE = 'http://localhost:3000/api';

// =============================================================================
// HELPER COMPONENTS
// =============================================================================

function StatusBadge({ status }) {
    const styles = {
        PENDING: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
        RUNNING: 'bg-blue-500/20 text-blue-400 border-blue-500/30 animate-pulse',
        COMPLETED: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
        FAILED: 'bg-red-500/20 text-red-400 border-red-500/30',
        PAUSED: 'bg-amber-500/20 text-amber-400 border-amber-500/30'
    };

    return (
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${styles[status] || styles.PENDING}`}>
            {status}
        </span>
    );
}

function BiasIcon({ bias }) {
    if (bias === 'LONG') return <TrendingUp className="w-4 h-4 text-emerald-400" />;
    if (bias === 'SHORT') return <TrendingDown className="w-4 h-4 text-red-400" />;
    return <Minus className="w-4 h-4 text-slate-400" />;
}

function OutcomeLabel({ label }) {
    const styles = {
        CONTINUATION: 'bg-emerald-500/20 text-emerald-400',
        REVERSAL: 'bg-red-500/20 text-red-400',
        NOISE: 'bg-slate-500/20 text-slate-400',
        PENDING: 'bg-amber-500/20 text-amber-400'
    };

    return (
        <span className={`px-2 py-0.5 rounded text-xs font-medium ${styles[label] || styles.PENDING}`}>
            {label || 'PENDING'}
        </span>
    );
}

function ProgressBar({ percent }) {
    return (
        <div className="w-full bg-slate-700/50 rounded-full h-2 overflow-hidden">
            <div
                className="h-full bg-gradient-to-r from-violet-500 to-purple-500 transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
            />
        </div>
    );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function ReplayBacktestPage() {
    // Configuration state
    const [config, setConfig] = useState({
        startTime: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 16),
        endTime: new Date().toISOString().slice(0, 16),
        stepSize: '1h',
        maxSamples: 20,
        symbol: 'BTCUSDT',
        horizons: ['MICRO']
    });

    // Batch state
    const [currentBatch, setCurrentBatch] = useState(null);
    const [batches, setBatches] = useState([]);
    const [results, setResults] = useState([]);
    const [scoreboard, setScoreboard] = useState(null);

    // UI state
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [expandedRow, setExpandedRow] = useState(null);
    const [expandedBatches, setExpandedBatches] = useState({}); // { batchId: true/false }
    const [pageTab, setPageTab] = useState('runner'); // 'runner' or 'guide'
    const [filters, setFilters] = useState({
        bias: 'all',
        outcome: 'all',
        confidence: 'all'
    });

    // Polling for batch status
    useEffect(() => {
        let interval;
        if (currentBatch && currentBatch.status === 'RUNNING') {
            interval = setInterval(() => {
                fetchBatchStatus(currentBatch.batchId);
            }, 3000);
        }
        return () => clearInterval(interval);
    }, [currentBatch]);

    // Load persisted replay history from database on mount
    useEffect(() => {
        const loadPersistedReplayHistory = async () => {
            try {
                console.log('[REPLAY] Loading persisted replay history from database...');
                const response = await fetch(`${API_BASE}/replay/history?limit=500`);
                if (!response.ok) {
                    console.log('[REPLAY] Failed to load history:', response.status);
                    return;
                }
                const result = await response.json();
                if (result.success && result.data && result.data.length > 0) {
                    // Map database records to results format (include batch info)
                    const historicalResults = result.data.map(state => ({
                        id: state.id,
                        batch_id: state.batch_id,
                        created_at: state.created_at,
                        as_of_timestamp: state.as_of_timestamp,
                        timestamp: state.as_of_timestamp,
                        bias: state.bias,
                        confidence: state.confidence,
                        primary_regime: state.primary_regime,
                        regime_state: state.regime_state,
                        exchange_scenario: state.exchange_scenario,
                        price: state.price,
                        outcome_label: state.outcome_label,
                        outcome_reason: state.outcome_reason,
                        outcome_horizon: state.outcome_horizon,
                        outcome_move_pct: state.outcome_move_pct,
                        outcome_mfe: state.outcome_mfe,
                        outcome_mae: state.outcome_mae,
                        macro_bias: state.macro_bias,
                        macro_confidence: state.macro_confidence,
                        micro_bias: state.micro_bias,
                        micro_confidence: state.micro_confidence,
                        scalping_bias: state.scalping_bias,
                        scalping_confidence: state.scalping_confidence,
                        macro_anchored: state.macro_anchored,
                        fromDatabase: true
                    }));
                    setResults(historicalResults);
                    console.log(`[REPLAY] Loaded ${historicalResults.length} historical replay states from database`);
                } else {
                    console.log('[REPLAY] No historical replay data found in database');
                }
            } catch (err) {
                console.log('[REPLAY] Error loading replay history:', err.message);
            }
        };

        loadPersistedReplayHistory();
    }, []);

    // ==========================================================================
    // API CALLS
    // ==========================================================================

    const startBatch = async () => {
        setLoading(true);
        setError(null);

        try {
            const response = await fetch(`${API_BASE}/replay/batch`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    startTime: new Date(config.startTime).toISOString(),
                    endTime: new Date(config.endTime).toISOString(),
                    stepSize: config.stepSize,
                    maxSamples: config.maxSamples,
                    symbol: config.symbol,
                    horizons: config.horizons
                })
            });

            const data = await response.json();

            if (data.success) {
                setCurrentBatch(data);
                fetchBatchStatus(data.batchId);
            } else {
                setError(data.error || 'Failed to start batch');
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const fetchBatchStatus = async (batchId) => {
        try {
            const response = await fetch(`${API_BASE}/replay/status/${batchId}`);
            const data = await response.json();

            if (data.success) {
                setCurrentBatch(data);

                // If completed, fetch results
                if (data.status === 'COMPLETED' || data.completedSamples > 0) {
                    fetchBatchResults(batchId);
                    fetchScoreboard(batchId);
                }

                // Keep refreshing results after completion for a while to catch labels
                if (data.status === 'COMPLETED') {
                    // Refresh results and scoreboard a few more times to catch auto-labeling
                    setTimeout(() => {
                        fetchBatchResults(batchId);
                        fetchScoreboard(batchId);
                    }, 5000);
                    setTimeout(() => {
                        fetchBatchResults(batchId);
                        fetchScoreboard(batchId);
                    }, 15000);
                    setTimeout(() => {
                        fetchBatchResults(batchId);
                        fetchScoreboard(batchId);
                    }, 30000);
                }
            }
        } catch (err) {
            console.error('Error fetching batch status:', err);
        }
    };

    const fetchBatchResults = async (batchId) => {
        try {
            const response = await fetch(`${API_BASE}/replay/results/${batchId}`);
            const data = await response.json();

            if (data.success && data.states) {
                setResults(data.states);
            }
        } catch (err) {
            console.error('Error fetching results:', err);
        }
    };

    const fetchScoreboard = async (batchId) => {
        try {
            const response = await fetch(`${API_BASE}/replay/scoreboard/${batchId}`);
            const data = await response.json();

            if (data.success) {
                setScoreboard(data);
            }
        } catch (err) {
            console.error('Error fetching scoreboard:', err);
        }
    };

    const pauseBatch = async () => {
        if (!currentBatch) return;

        try {
            await fetch(`${API_BASE}/replay/pause/${currentBatch.batchId}`, {
                method: 'POST'
            });
            fetchBatchStatus(currentBatch.batchId);
        } catch (err) {
            setError(err.message);
        }
    };

    const resumeBatch = async () => {
        if (!currentBatch) return;

        try {
            await fetch(`${API_BASE}/replay/resume/${currentBatch.batchId}`, {
                method: 'POST'
            });
            fetchBatchStatus(currentBatch.batchId);
        } catch (err) {
            setError(err.message);
        }
    };

    const triggerLabeling = async () => {
        if (!currentBatch) return;
        setLoading(true);

        try {
            await fetch(`${API_BASE}/replay/label`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    batchId: currentBatch.batchId,
                    horizon: config.horizons[0]
                })
            });

            // Refresh results and scoreboard
            fetchBatchResults(currentBatch.batchId);
            fetchScoreboard(currentBatch.batchId);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // ==========================================================================
    // FILTERING
    // ==========================================================================

    const filteredResults = results.filter(state => {
        if (filters.bias !== 'all' && state.bias !== filters.bias) return false;
        if (filters.outcome !== 'all' && state.outcome_label !== filters.outcome) return false;
        if (filters.confidence !== 'all') {
            const conf = state.confidence || 0;
            const bucket = filters.confidence;
            if (bucket === 'low' && conf >= 4) return false;
            if (bucket === 'medium' && (conf < 4 || conf >= 7)) return false;
            if (bucket === 'high' && conf < 7) return false;
        }
        return true;
    });

    // ==========================================================================
    // EXPORT
    // ==========================================================================

    const exportToCSV = () => {
        if (filteredResults.length === 0) return;

        const headers = ['Simulated At', 'Bias', 'Confidence', 'Regime', 'Scenario', 'Outcome', 'Move %', 'MFE %', 'MAE %'];
        const rows = filteredResults.map(state => [
            new Date(state.as_of_timestamp || state.timestamp).toISOString(),
            state.bias || '',
            state.confidence?.toFixed(2) || '',
            state.primary_regime || state.regime_state || '',
            state.exchange_scenario || '',
            state.outcome_label || '',
            state.outcome_move_pct?.toFixed(2) || '',
            state.outcome_mfe?.toFixed(2) || '',
            state.outcome_mae?.toFixed(2) || ''
        ]);

        const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `backtest_results_${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    };

    const deleteBatch = async (batchId, e) => {
        e.stopPropagation();
        if (!window.confirm('Are you sure you want to delete this backtest batch? This action cannot be undone.')) return;

        try {
            const response = await fetch(`${API_BASE}/replay/batch/${batchId}`, {
                method: 'DELETE'
            });
            const data = await response.json();

            if (data.success) {
                // Remove from local state
                setResults(results.filter(r => r.batch_id !== batchId));
                // Optional: also remove from batches list if we were tracking it there
                if (currentBatch && currentBatch.batchId === batchId) {
                    setCurrentBatch(null);
                }
            } else {
                setError(data.error || 'Failed to delete batch');
            }
        } catch (err) {
            setError(err.message);
        }
    };

    const toggleBatch = (batchId) => {
        setExpandedBatches(prev => ({
            ...prev,
            [batchId]: !prev[batchId]
        }));
    };

    // ==========================================================================
    // RENDER
    // ==========================================================================


    return (
        <div className="min-h-screen p-6 space-y-6">
            {/* Page-Level Tab Navigation */}
            <div className="flex gap-2">
                <button
                    onClick={() => setPageTab('runner')}
                    className={`flex items-center gap-2 px-5 py-3 rounded-xl font-medium transition-all ${pageTab === 'runner'
                        ? 'bg-violet-600 text-white'
                        : 'bg-slate-800/50 text-slate-400 hover:text-white hover:bg-slate-700/50'
                        }`}
                >
                    <PlayCircle className="w-5 h-5" />
                    Backtest Runner
                </button>
                <button
                    onClick={() => setPageTab('guide')}
                    className={`flex items-center gap-2 px-5 py-3 rounded-xl font-medium transition-all ${pageTab === 'guide'
                        ? 'bg-violet-600 text-white'
                        : 'bg-slate-800/50 text-slate-400 hover:text-white hover:bg-slate-700/50'
                        }`}
                >
                    <BookOpen className="w-5 h-5" />
                    Improvement Guide
                </button>
            </div>

            {/* Guide Tab */}
            {pageTab === 'guide' && <BacktestGuidePanel />}

            {/* Runner Tab */}
            {pageTab === 'runner' && (
                <div className="max-w-7xl mx-auto space-y-6">
                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-center gap-3">
                        <Activity className="w-5 h-5 text-amber-400" />
                        <div>
                            <span className="text-amber-400 font-semibold">🔄 HISTORICAL REPLAY MODE</span>
                            <span className="text-slate-400 ml-2">Simulating analyzer at historical timestamps with zero lookahead</span>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Left Column: Configuration + Progress */}
                        <div className="space-y-6">
                            {/* Configuration Panel */}
                            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
                                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                                    <Clock className="w-5 h-5 text-violet-400" />
                                    Backtest Configuration
                                </h3>

                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm text-slate-400 mb-1">Start Time</label>
                                        <input
                                            type="datetime-local"
                                            value={config.startTime}
                                            onChange={(e) => setConfig({ ...config, startTime: e.target.value })}
                                            className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm text-slate-400 mb-1">End Time</label>
                                        <input
                                            type="datetime-local"
                                            value={config.endTime}
                                            onChange={(e) => setConfig({ ...config, endTime: e.target.value })}
                                            className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                                        />
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm text-slate-400 mb-1">Step Size</label>
                                            <select
                                                value={config.stepSize}
                                                onChange={(e) => setConfig({ ...config, stepSize: e.target.value })}
                                                className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                                            >
                                                <option value="30m">30 minutes</option>
                                                <option value="1h">1 hour</option>
                                                <option value="4h">4 hours</option>
                                            </select>
                                        </div>

                                        <div>
                                            <label className="block text-sm text-slate-400 mb-1">Max Samples</label>
                                            <input
                                                type="number"
                                                min="1"
                                                max="100"
                                                value={config.maxSamples}
                                                onChange={(e) => setConfig({ ...config, maxSamples: parseInt(e.target.value) || 20 })}
                                                className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm text-slate-400 mb-1">Horizon</label>
                                        <select
                                            value={config.horizons[0]}
                                            onChange={(e) => setConfig({ ...config, horizons: [e.target.value] })}
                                            className="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                                        >
                                            <option value="SCALPING">Scalping (10-60 min)</option>
                                            <option value="MICRO">Micro (2-8 hours)</option>
                                            <option value="MACRO">Macro (1-5 days)</option>
                                        </select>
                                    </div>

                                    {/* Action Buttons */}
                                    <div className="flex gap-2 pt-2">
                                        {!currentBatch || currentBatch.status === 'COMPLETED' || currentBatch.status === 'FAILED' ? (
                                            <button
                                                onClick={startBatch}
                                                disabled={loading}
                                                className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-violet-600 to-purple-600 text-white px-4 py-2.5 rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
                                            >
                                                <PlayCircle className="w-4 h-4" />
                                                {loading ? 'Starting...' : 'Run Backtest'}
                                            </button>
                                        ) : currentBatch.status === 'RUNNING' ? (
                                            <button
                                                onClick={pauseBatch}
                                                className="flex-1 flex items-center justify-center gap-2 bg-amber-600 text-white px-4 py-2.5 rounded-lg font-medium hover:opacity-90"
                                            >
                                                <Pause className="w-4 h-4" />
                                                Pause
                                            </button>
                                        ) : currentBatch.status === 'PAUSED' ? (
                                            <button
                                                onClick={resumeBatch}
                                                className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 text-white px-4 py-2.5 rounded-lg font-medium hover:opacity-90"
                                            >
                                                <PlayCircle className="w-4 h-4" />
                                                Resume
                                            </button>
                                        ) : null}
                                    </div>
                                </div>
                            </div>

                            {/* Progress Panel */}
                            {currentBatch && (
                                <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className="text-lg font-semibold text-white">Progress</h3>
                                        <StatusBadge status={currentBatch.status} />
                                    </div>

                                    <div className="space-y-3">
                                        <ProgressBar
                                            percent={(currentBatch.completedSamples / currentBatch.totalSamples) * 100}
                                        />

                                        <div className="grid grid-cols-3 gap-2 text-center">
                                            <div className="bg-slate-700/30 rounded-lg p-2">
                                                <div className="text-lg font-bold text-emerald-400">{currentBatch.completedSamples}</div>
                                                <div className="text-xs text-slate-500">Completed</div>
                                            </div>
                                            <div className="bg-slate-700/30 rounded-lg p-2">
                                                <div className="text-lg font-bold text-amber-400">{currentBatch.remainingSamples}</div>
                                                <div className="text-xs text-slate-500">Remaining</div>
                                            </div>
                                            <div className="bg-slate-700/30 rounded-lg p-2">
                                                <div className="text-lg font-bold text-red-400">{currentBatch.failedSamples}</div>
                                                <div className="text-xs text-slate-500">Failed</div>
                                            </div>
                                        </div>

                                        {currentBatch.eta && (
                                            <div className="text-sm text-slate-400 text-center">
                                                ETA: {Math.round(currentBatch.eta / 60000)} minutes
                                            </div>
                                        )}

                                        {/* Label Button */}
                                        {currentBatch.status === 'COMPLETED' && (
                                            <button
                                                onClick={triggerLabeling}
                                                disabled={loading}
                                                className="w-full flex items-center justify-center gap-2 bg-slate-700 text-white px-4 py-2 rounded-lg font-medium hover:bg-slate-600 disabled:opacity-50"
                                            >
                                                <Target className="w-4 h-4" />
                                                {loading ? 'Labeling...' : 'Label Outcomes'}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Scoreboard Summary */}
                            {scoreboard && (
                                <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
                                    <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                                        <BarChart3 className="w-5 h-5 text-emerald-400" />
                                        Scoreboard
                                    </h3>

                                    <div className="space-y-4">
                                        {/* Overall Stats */}
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="bg-slate-700/30 rounded-lg p-3 text-center">
                                                <div className="text-2xl font-bold text-white">
                                                    {scoreboard.overallStats?.overallAccuracy || 0}%
                                                </div>
                                                <div className="text-xs text-slate-400">Overall Accuracy</div>
                                            </div>
                                            <div className="bg-slate-700/30 rounded-lg p-3 text-center">
                                                <div className="text-2xl font-bold text-white">
                                                    {scoreboard.overallStats?.directionalAccuracy || 0}%
                                                </div>
                                                <div className="text-xs text-slate-400">Directional Accuracy</div>
                                            </div>
                                        </div>

                                        {/* Accuracy by Bias */}
                                        {scoreboard.accuracyByBias && (
                                            <div className="space-y-2">
                                                <div className="text-sm font-medium text-slate-400">Accuracy by Bias</div>
                                                {Object.entries(scoreboard.accuracyByBias).map(([bias, data]) => (
                                                    <div key={bias} className="flex items-center justify-between text-sm">
                                                        <div className="flex items-center gap-2">
                                                            <BiasIcon bias={bias} />
                                                            <span className="text-slate-300">{bias}</span>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-slate-500">{data.correct}/{data.total}</span>
                                                            <span className={`font-medium ${data.accuracy >= 60 ? 'text-emerald-400' : data.accuracy >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
                                                                {data.accuracy}%
                                                            </span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {/* Confidence Calibration */}
                                        {scoreboard.confidenceCalibration && (
                                            <div className="pt-2 border-t border-slate-700/50">
                                                <div className={`flex items-center gap-2 text-sm ${scoreboard.confidenceCalibration.isMonotonic ? 'text-emerald-400' : 'text-amber-400'}`}>
                                                    {scoreboard.confidenceCalibration.isMonotonic ? (
                                                        <CheckCircle className="w-4 h-4" />
                                                    ) : (
                                                        <AlertCircle className="w-4 h-4" />
                                                    )}
                                                    {scoreboard.confidenceCalibration.interpretation}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Right Column: Results Table */}
                        <div className="lg:col-span-2">
                            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
                                {/* Table Header with Filters */}
                                <div className="p-4 border-b border-slate-700/50 flex items-center justify-between">
                                    <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                                        <Activity className="w-5 h-5 text-violet-400" />
                                        Replay History
                                    </h3>

                                    <div className="flex items-center gap-2">
                                        <Filter className="w-4 h-4 text-slate-500" />
                                        <select
                                            value={filters.bias}
                                            onChange={(e) => setFilters({ ...filters, bias: e.target.value })}
                                            className="bg-slate-700/50 border border-slate-600 rounded px-2 py-1 text-sm text-slate-300"
                                        >
                                            <option value="all">All Bias</option>
                                            <option value="LONG">LONG</option>
                                            <option value="SHORT">SHORT</option>
                                            <option value="WAIT">WAIT</option>
                                        </select>
                                        <select
                                            value={filters.outcome}
                                            onChange={(e) => setFilters({ ...filters, outcome: e.target.value })}
                                            className="bg-slate-700/50 border border-slate-600 rounded px-2 py-1 text-sm text-slate-300"
                                        >
                                            <option value="all">All Outcomes</option>
                                            <option value="CONTINUATION">Continuation</option>
                                            <option value="REVERSAL">Reversal</option>
                                            <option value="NOISE">Noise</option>
                                        </select>
                                        <button
                                            onClick={exportToCSV}
                                            disabled={filteredResults.length === 0}
                                            className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white px-3 py-1 rounded text-sm font-medium transition-colors"
                                        >
                                            <Download className="w-4 h-4" />
                                            Export
                                        </button>
                                    </div>
                                </div>

                                {/* Scrollable Content */}
                                <div className="max-h-[800px] overflow-y-auto">
                                    {Object.entries(
                                        filteredResults.reduce((groups, state) => {
                                            const batchId = state.batch_id || 'unknown';
                                            if (!groups[batchId]) {
                                                groups[batchId] = {
                                                    id: batchId,
                                                    createdAt: state.created_at || state.timestamp, // Fallback
                                                    states: []
                                                };
                                            }
                                            groups[batchId].states.push(state);
                                            return groups;
                                        }, {})
                                    )
                                        .sort(([, a], [, b]) => new Date(b.createdAt) - new Date(a.createdAt)) // Sort by newest batch first
                                        .map(([batchId, group]) => {
                                            const isExpanded = expandedBatches[batchId] !== false; // Default to true if undefined? No, let's default false or handle init. 
                                            // Actually better to default open for the very first one maybe? 
                                            // Let's just use the state, default undefined is false-ish, but let's make it toggleable.
                                            // We can auto-expand the first one in useEffect if needed, but manual is fine.

                                            // Simpler: use state, default false.
                                            // Wait, user wants to see results. Maybe default expand all? Or just the newest?
                                            // Let's stick to collapsible.

                                            const isBatchExpanded = expandedBatches[batchId] || (batchId === currentBatch?.batchId);

                                            return (
                                                <div key={batchId} className="border-b border-slate-700/50 last:border-0">
                                                    {/* Batch Header */}
                                                    <div
                                                        className="w-full flex items-center justify-between p-4 bg-slate-800/30 hover:bg-slate-700/30 cursor-pointer transition-colors"
                                                        onClick={() => toggleBatch(batchId)}
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            {isBatchExpanded ? (
                                                                <ChevronDown className="w-4 h-4 text-slate-500" />
                                                            ) : (
                                                                <ChevronRight className="w-4 h-4 text-slate-500" />
                                                            )}
                                                            <div>
                                                                <div className="font-medium text-slate-200">
                                                                    Batch Run: {new Date(group.createdAt).toLocaleString()}
                                                                </div>
                                                                <div className="text-xs text-slate-500">
                                                                    {group.states.length} samples • {group.states[0].symbol || 'BTCUSDT'}
                                                                </div>
                                                            </div>
                                                        </div>

                                                        <div className="flex items-center gap-3">
                                                            <button
                                                                onClick={(e) => deleteBatch(batchId, e)}
                                                                className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                                                                title="Delete Batch Results"
                                                            >
                                                                <Trash2 className="w-4 h-4" />
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {/* Batch Results Table */}
                                                    {isBatchExpanded && (
                                                        <div className="bg-slate-900/20 border-t border-slate-700/30">
                                                            <table className="w-full">
                                                                <thead className="bg-slate-700/30 text-xs text-slate-400 uppercase">
                                                                    <tr>
                                                                        <th className="px-4 py-2 text-left">Simulated At</th>
                                                                        <th className="px-4 py-2 text-left">Bias</th>
                                                                        <th className="px-4 py-2 text-center">Confidence</th>
                                                                        <th className="px-4 py-2 text-left">Regime</th>
                                                                        <th className="px-4 py-2 text-center">Outcome</th>
                                                                        <th className="px-4 py-2 text-center">Move</th>
                                                                        <th className="px-4 py-2"></th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {group.states.map((state, idx) => (
                                                                        <React.Fragment key={state.id || idx}>
                                                                            <tr
                                                                                className="border-t border-slate-700/30 hover:bg-slate-700/20 cursor-pointer"
                                                                                onClick={() => setExpandedRow(expandedRow === state.id ? null : state.id)}
                                                                            >
                                                                                <td className="px-4 py-2 text-sm text-slate-300">
                                                                                    {new Date(state.as_of_timestamp || state.timestamp).toLocaleString()}
                                                                                </td>
                                                                                <td className="px-4 py-2">
                                                                                    <div className="flex items-center gap-2">
                                                                                        <BiasIcon bias={state.bias} />
                                                                                        <span className="text-sm text-slate-300">{state.bias}</span>
                                                                                    </div>
                                                                                </td>
                                                                                <td className="px-4 py-2 text-center">
                                                                                    <span className={`text-sm font-medium ${state.confidence >= 7 ? 'text-emerald-400' :
                                                                                        state.confidence >= 5 ? 'text-amber-400' : 'text-slate-400'
                                                                                        }`}>
                                                                                        {state.confidence?.toFixed(1)}
                                                                                    </span>
                                                                                </td>
                                                                                <td className="px-4 py-2 text-sm text-slate-400">
                                                                                    {state.primary_regime || '-'}
                                                                                </td>
                                                                                <td className="px-4 py-2 text-center">
                                                                                    <OutcomeLabel label={state.outcome_label} />
                                                                                </td>
                                                                                <td className="px-4 py-2 text-center text-sm">
                                                                                    {state.outcome_move_pct !== null ? (
                                                                                        <span className={state.outcome_move_pct >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                                                                                            {state.outcome_move_pct > 0 ? '+' : ''}{state.outcome_move_pct?.toFixed(2)}%
                                                                                        </span>
                                                                                    ) : '-'}
                                                                                </td>
                                                                                <td className="px-4 py-2 text-center">
                                                                                    {expandedRow === state.id ? (
                                                                                        <ChevronDown className="w-4 h-4 text-slate-500" />
                                                                                    ) : (
                                                                                        <ChevronRight className="w-4 h-4 text-slate-500" />
                                                                                    )}
                                                                                </td>
                                                                            </tr>

                                                                            {/* Enhanced Expanded Row - reusing the logic we improved earlier */}
                                                                            {expandedRow === state.id && (
                                                                                <tr className="bg-slate-900/50">
                                                                                    <td colSpan="7" className="px-4 py-4">
                                                                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                                                                                            {/* Hierarchy */}
                                                                                            <div className="bg-slate-800/50 rounded-lg p-3">
                                                                                                <div className="text-xs text-slate-500 uppercase mb-2">Hierarchy</div>
                                                                                                <div className="space-y-1">
                                                                                                    <div className="flex justify-between">
                                                                                                        <span className="text-slate-400">Macro:</span>
                                                                                                        <span className="text-slate-300">{state.macro_bias} ({state.macro_confidence?.toFixed(1)})</span>
                                                                                                    </div>
                                                                                                    <div className="flex justify-between">
                                                                                                        <span className="text-slate-400">Micro:</span>
                                                                                                        <span className="text-slate-300">{state.micro_bias} ({state.micro_confidence?.toFixed(1)})</span>
                                                                                                    </div>
                                                                                                    <div className="flex justify-between">
                                                                                                        <span className="text-slate-400">Scalping:</span>
                                                                                                        <span className="text-slate-300">{state.scalping_bias} ({state.scalping_confidence?.toFixed(1)})</span>
                                                                                                    </div>
                                                                                                    {state.macro_anchored && (
                                                                                                        <div className="text-amber-400 text-xs mt-1">⚓ Macro Anchored</div>
                                                                                                    )}
                                                                                                </div>
                                                                                            </div>

                                                                                            {/* Metrics */}
                                                                                            <div className="bg-slate-800/50 rounded-lg p-3">
                                                                                                <div className="text-xs text-slate-500 uppercase mb-2">Metrics</div>
                                                                                                <div className="space-y-1">
                                                                                                    <div className="flex justify-between">
                                                                                                        <span className="text-slate-400">Price:</span>
                                                                                                        <span className="text-slate-300">${state.price?.toLocaleString()}</span>
                                                                                                    </div>
                                                                                                    <div className="flex justify-between">
                                                                                                        <span className="text-slate-400">MFE:</span>
                                                                                                        <span className="text-emerald-400">{state.outcome_mfe?.toFixed(2)}%</span>
                                                                                                    </div>
                                                                                                    <div className="flex justify-between">
                                                                                                        <span className="text-slate-400">MAE:</span>
                                                                                                        <span className="text-red-400">{state.outcome_mae?.toFixed(2)}%</span>
                                                                                                    </div>
                                                                                                </div>
                                                                                            </div>

                                                                                            {/* Outcome Analysis */}
                                                                                            <div className="bg-slate-800/50 rounded-lg p-3">
                                                                                                <div className="text-xs text-slate-500 uppercase mb-2">Outcome Analysis</div>
                                                                                                <div className="space-y-2">
                                                                                                    <div className="flex justify-between items-center">
                                                                                                        <span className="text-slate-400">Result:</span>
                                                                                                        <OutcomeLabel label={state.outcome_label} />
                                                                                                    </div>
                                                                                                    <div className="flex justify-between items-center">
                                                                                                        <span className="text-slate-400">Signal Was:</span>
                                                                                                        {(() => {
                                                                                                            const isCorrect =
                                                                                                                (state.bias !== 'WAIT' && state.outcome_label === 'CONTINUATION') ||
                                                                                                                (state.bias === 'WAIT' && state.outcome_label === 'NOISE');
                                                                                                            return (
                                                                                                                <span className={`font-medium ${isCorrect ? 'text-emerald-400' : 'text-red-400'}`}>
                                                                                                                    {isCorrect ? '✓ CORRECT' : '✗ INCORRECT'}
                                                                                                                </span>
                                                                                                            );
                                                                                                        })()}
                                                                                                    </div>
                                                                                                    <div className="text-xs text-slate-400 mt-2 p-2 bg-slate-900/50 rounded">
                                                                                                        {state.bias === 'WAIT' ? (
                                                                                                            state.outcome_label === 'NOISE'
                                                                                                                ? '✓ Market was choppy/sideways as expected - WAIT was the right call'
                                                                                                                : '✗ Market had direction - a directional signal would have been better'
                                                                                                        ) : (
                                                                                                            state.outcome_label === 'CONTINUATION'
                                                                                                                ? `✓ Market moved in ${state.bias} direction as predicted`
                                                                                                                : state.outcome_label === 'REVERSAL'
                                                                                                                    ? `✗ Market reversed against ${state.bias} prediction`
                                                                                                                    : `✗ Market was choppy - ${state.bias} signal was premature`
                                                                                                        )}
                                                                                                    </div>
                                                                                                </div>
                                                                                            </div>
                                                                                        </div>
                                                                                    </td>
                                                                                </tr>
                                                                            )}
                                                                        </React.Fragment>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}

                                    {filteredResults.length === 0 && (
                                        <div className="p-8 text-center text-slate-500">
                                            {results.length === 0 ? 'No backtest history found.' : 'No results match filters.'}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Error Toast */}
                    {error && (
                        <div className="fixed bottom-4 right-4 bg-red-500/90 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-2">
                            <XCircle className="w-5 h-5" />
                            {error}
                            <button onClick={() => setError(null)} className="ml-2 hover:opacity-80">×</button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
