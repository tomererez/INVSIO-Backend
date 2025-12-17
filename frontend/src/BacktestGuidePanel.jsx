import React, { useState, useEffect } from 'react';
import {
    RefreshCw,
    CheckCircle,
    AlertCircle,
    AlertTriangle,
    BarChart3,
    BookOpen,
    ListChecks,
    TrendingUp,
    TrendingDown,
    Minus,
    Target,
    Zap,
    ArrowRight
} from 'lucide-react';

const API_BASE = 'http://localhost:3000/api';

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

function PhaseCard({ number, title, color, position }) {
    const colorClasses = {
        cyan: 'text-cyan-400',
        emerald: 'text-emerald-400',
        amber: 'text-amber-400',
        red: 'text-red-400',
        purple: 'text-purple-400',
        pink: 'text-pink-400'
    };

    return (
        <div className={`absolute ${position} w-20 h-20 bg-gradient-to-br from-slate-800 to-slate-700 rounded-xl flex flex-col items-center justify-center border border-slate-600 hover:border-cyan-500 hover:scale-110 transition-all cursor-pointer shadow-lg`}>
            <span className={`text-2xl font-bold ${colorClasses[color]}`}>{number}</span>
            <span className="text-xs text-slate-300 text-center leading-tight">{title}</span>
        </div>
    );
}

function ChecklistItem({ title, desc, file, checked, onToggle }) {
    return (
        <div
            onClick={onToggle}
            className={`flex items-start gap-4 p-4 bg-slate-900/50 rounded-xl cursor-pointer transition-all hover:bg-slate-800/50 ${checked ? 'opacity-50' : ''}`}
        >
            <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${checked ? 'bg-emerald-500 border-emerald-500' : 'border-slate-500'}`}>
                {checked && <CheckCircle className="w-4 h-4 text-white" />}
            </div>
            <div className="flex-1">
                <div className={`font-semibold text-white mb-1 ${checked ? 'line-through' : ''}`}>{title}</div>
                <div className="text-sm text-slate-400 mb-2">{desc}</div>
                {file && <span className="text-xs font-mono text-purple-400 bg-purple-500/10 px-2 py-1 rounded">{file}</span>}
            </div>
        </div>
    );
}

function StatCard({ label, value, subtext, variant = 'default' }) {
    const variants = {
        default: 'text-white',
        warning: 'text-amber-400',
        danger: 'text-red-400',
        good: 'text-emerald-400'
    };

    return (
        <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700">
            <div className="text-sm text-slate-400 uppercase tracking-wide mb-2">{label}</div>
            <div className={`text-3xl font-bold ${variants[variant]}`}>{value}</div>
            {subtext && <div className="text-sm text-slate-500 mt-1">{subtext}</div>}
        </div>
    );
}

function ActionStep({ num, title, desc }) {
    return (
        <div className="flex gap-4 p-4 bg-slate-900/30 rounded-xl">
            <div className="w-8 h-8 bg-emerald-500 rounded-full flex items-center justify-center font-bold text-black flex-shrink-0">{num}</div>
            <div>
                <h4 className="text-white font-semibold mb-1">{title}</h4>
                <p className="text-sm text-slate-400">{desc}</p>
            </div>
        </div>
    );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function BacktestGuidePanel() {
    const [activeTab, setActiveTab] = useState('overview');
    const [checklist, setChecklist] = useState(() => {
        const saved = localStorage.getItem('invsio-checklist');
        return saved ? JSON.parse(saved) : Array(14).fill(false);
    });
    const [stats, setStats] = useState(null);
    const [loadingStats, setLoadingStats] = useState(false);

    // Save checklist to localStorage
    useEffect(() => {
        localStorage.setItem('invsio-checklist', JSON.stringify(checklist));
    }, [checklist]);

    // Load stats from API
    useEffect(() => {
        if (activeTab === 'yourdata') {
            loadStats();
        }
    }, [activeTab]);

    const loadStats = async () => {
        setLoadingStats(true);
        try {
            const res = await fetch(`${API_BASE}/replay/stats`);
            const data = await res.json();
            if (data.success) {
                setStats(data);
            }
        } catch (err) {
            console.error('Failed to load stats:', err);
        } finally {
            setLoadingStats(false);
        }
    };

    const toggleCheck = (index) => {
        setChecklist(prev => {
            const next = [...prev];
            next[index] = !next[index];
            return next;
        });
    };

    const completedCount = checklist.filter(Boolean).length;
    const totalCount = checklist.length;
    const progressPercent = Math.round((completedCount / totalCount) * 100);

    const tabs = [
        { id: 'overview', label: '🔄 Cycle Overview', icon: RefreshCw },
        { id: 'checklist', label: '✅ Checklist', icon: ListChecks, badge: totalCount - completedCount },
        { id: 'howto', label: '📖 How To Use', icon: BookOpen },
        { id: 'yourdata', label: '📊 Your Data', icon: BarChart3 }
    ];

    // Checklist items data
    const checklistItems = [
        // Critical
        { title: 'Add Outcome Labeling to Your Data', desc: 'Your replay states have NO outcome labels. Without labels, you cannot measure accuracy.', file: 'Run: Label Outcomes button' },
        { title: 'Implement Directional Accuracy Calculation', desc: 'Add function to calculate: when bias=LONG, did price go up?', file: 'src/backtest/scoreboardService.js' },
        { title: 'Add Confidence Calibration Check', desc: 'Group signals by confidence bucket and verify higher confidence = higher accuracy.', file: 'scoreboardService.js → addCalibrationMetrics()' },
        // High
        { title: 'Add WAIT Effectiveness Metric', desc: 'Measure volatility during WAIT periods vs LONG/SHORT periods.', file: 'scoreboardService.js' },
        { title: 'Implement Error Bucketing', desc: 'Categorize WHY signals fail: regime_misread, cvd_misleading, etc.', file: 'src/backtest/errorBucketing.js (new)' },
        { title: 'Add Regime Accuracy Breakdown', desc: 'Track accuracy per regime: distribution, accumulation, traps.', file: 'scoreboardService.js' },
        { title: 'Document Baseline Before Changes', desc: 'Save current metrics before modifying math.', file: 'baselines/ folder' },
        // Medium
        { title: 'Add Multi-Timeframe Accuracy', desc: 'Track accuracy separately for 30m, 1h, 4h, 1d timeframes.', file: 'scoreboardService.js' },
        { title: 'Track Bucket Alignment Accuracy', desc: 'When MACRO+MICRO+SCALPING all agree, is accuracy higher?', file: 'scoreboardService.js' },
        { title: 'Add Exchange Divergence Scenario Accuracy', desc: 'Track which scenarios work: whale_distribution, whale_accumulation.', file: 'scoreboardService.js' },
        { title: 'Increase Sample Size', desc: '20 states is too small. Target 200+ states across varied conditions.', file: 'Run more replay batches' },
        { title: 'Add MFE/MAE Analysis', desc: 'Track Max Favorable/Adverse Excursion for each signal.', file: 'outcomeLabelingJob.js' },
        { title: 'Create Visual Comparison Dashboard', desc: 'Before/after comparison charts for each iteration.', file: 'BacktestComparison.jsx (new)' },
        { title: 'Review and Iterate', desc: 'Complete one full cycle and document learnings.', file: 'baselines/' }
    ];

    return (
        <div className="max-w-5xl mx-auto space-y-6">
            {/* Tab Navigation */}
            <div className="flex bg-slate-800/50 rounded-xl p-1 gap-1">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-medium transition-all ${activeTab === tab.id
                            ? 'bg-violet-600 text-white'
                            : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                            }`}
                    >
                        {tab.label}
                        {tab.badge !== undefined && tab.badge > 0 && (
                            <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">{tab.badge}</span>
                        )}
                    </button>
                ))}
            </div>

            {/* ==================== CYCLE OVERVIEW ==================== */}
            {activeTab === 'overview' && (
                <div className="space-y-8">
                    <div>
                        <h2 className="text-2xl font-bold bg-gradient-to-r from-cyan-400 to-purple-500 bg-clip-text text-transparent mb-2">
                            Backtest Improvement Cycle
                        </h2>
                        <p className="text-slate-400">Iterative process for improving market analyzer accuracy</p>
                    </div>

                    {/* Cycle Visualization */}
                    <div className="flex justify-center py-8">
                        <div className="relative w-80 h-80">
                            {/* Center */}
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-28 h-28 bg-gradient-to-br from-slate-800 to-slate-700 rounded-full border-2 border-purple-500 flex flex-col items-center justify-center shadow-lg shadow-purple-500/20">
                                <span className="text-cyan-400 font-semibold">ITERATE</span>
                                <span className="text-xs text-slate-400 text-center">Until &gt;57%<br />Accuracy</span>
                            </div>

                            {/* Phases */}
                            <PhaseCard number="1" title="Run Backtest" color="cyan" position="top-0 left-1/2 -translate-x-1/2" />
                            <PhaseCard number="2" title="Analyze Results" color="emerald" position="top-8 right-4" />
                            <PhaseCard number="3" title="Identify Weak Spots" color="amber" position="bottom-8 right-4" />
                            <PhaseCard number="4" title="Modify Math" color="red" position="bottom-0 left-1/2 -translate-x-1/2" />
                            <PhaseCard number="5" title="Unit Test" color="purple" position="bottom-8 left-4" />
                            <PhaseCard number="6" title="Re-Backtest" color="pink" position="top-8 left-4" />

                            {/* Animated ring */}
                            <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 320 320">
                                <circle
                                    cx="160" cy="160" r="120"
                                    fill="none"
                                    stroke="url(#gradient)"
                                    strokeWidth="2"
                                    strokeDasharray="8 4"
                                    className="animate-spin-slow"
                                    style={{ animationDuration: '20s' }}
                                />
                                <defs>
                                    <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                                        <stop offset="0%" stopColor="#00d4ff" stopOpacity="0.3" />
                                        <stop offset="50%" stopColor="#7c3aed" stopOpacity="0.6" />
                                        <stop offset="100%" stopColor="#00d4ff" stopOpacity="0.3" />
                                    </linearGradient>
                                </defs>
                            </svg>
                        </div>
                    </div>

                    {/* Assessment Cards */}
                    <div className="grid md:grid-cols-2 gap-6">
                        <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
                            <h3 className="flex items-center gap-3 text-lg font-semibold text-white mb-4">
                                <span className="w-8 h-8 bg-emerald-500/20 rounded-lg flex items-center justify-center text-emerald-400">✓</span>
                                What's Working
                            </h3>
                            <ul className="space-y-2">
                                {['Clear 6-phase iterative structure', 'Emphasis on ONE change at a time', 'Decision matrix for keep/revert', 'Good file reference mapping', 'Metrics targets defined (>55%, >60%)'].map((item, i) => (
                                    <li key={i} className="flex items-center gap-2 text-slate-300 text-sm">
                                        <span className="w-2 h-2 bg-emerald-400 rounded-full" />
                                        {item}
                                    </li>
                                ))}
                            </ul>
                        </div>

                        <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
                            <h3 className="flex items-center gap-3 text-lg font-semibold text-white mb-4">
                                <span className="w-8 h-8 bg-amber-500/20 rounded-lg flex items-center justify-center text-amber-400">!</span>
                                Needs Implementation
                            </h3>
                            <ul className="space-y-2">
                                {['Confidence calibration check', 'WAIT effectiveness metric', 'Regime-specific accuracy breakdown', 'Error category tracking', 'Multi-timeframe validation'].map((item, i) => (
                                    <li key={i} className="flex items-center gap-2 text-slate-300 text-sm">
                                        <span className="w-2 h-2 bg-amber-400 rounded-full" />
                                        {item}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                </div>
            )}

            {/* ==================== CHECKLIST ==================== */}
            {activeTab === 'checklist' && (
                <div className="space-y-6">
                    <div>
                        <h2 className="text-2xl font-bold text-white mb-2">Implementation Checklist</h2>
                        <p className="text-slate-400">Track your progress on improving the backtest system</p>
                    </div>

                    {/* Progress Bar */}
                    <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
                        <div className="flex justify-between mb-2">
                            <span className="text-slate-400 text-sm">Overall Progress</span>
                            <span className="text-cyan-400 font-semibold">{progressPercent}%</span>
                        </div>
                        <div className="h-3 bg-slate-700 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-gradient-to-r from-cyan-500 to-purple-500 rounded-full transition-all duration-500"
                                style={{ width: `${progressPercent}%` }}
                            />
                        </div>
                    </div>

                    {/* Critical */}
                    <div className="bg-slate-800/30 rounded-xl p-6 border border-red-500/30">
                        <h3 className="flex items-center gap-3 text-lg font-semibold text-white mb-4">
                            <span className="w-9 h-9 bg-red-500/20 rounded-lg flex items-center justify-center">🔴</span>
                            Critical - Fix First
                        </h3>
                        <div className="space-y-3">
                            {checklistItems.slice(0, 3).map((item, i) => (
                                <ChecklistItem key={i} {...item} checked={checklist[i]} onToggle={() => toggleCheck(i)} />
                            ))}
                        </div>
                    </div>

                    {/* High Priority */}
                    <div className="bg-slate-800/30 rounded-xl p-6 border border-amber-500/30">
                        <h3 className="flex items-center gap-3 text-lg font-semibold text-white mb-4">
                            <span className="w-9 h-9 bg-amber-500/20 rounded-lg flex items-center justify-center">🟠</span>
                            High Priority - Core Metrics
                        </h3>
                        <div className="space-y-3">
                            {checklistItems.slice(3, 7).map((item, i) => (
                                <ChecklistItem key={i + 3} {...item} checked={checklist[i + 3]} onToggle={() => toggleCheck(i + 3)} />
                            ))}
                        </div>
                    </div>

                    {/* Medium Priority */}
                    <div className="bg-slate-800/30 rounded-xl p-6 border border-cyan-500/30">
                        <h3 className="flex items-center gap-3 text-lg font-semibold text-white mb-4">
                            <span className="w-9 h-9 bg-cyan-500/20 rounded-lg flex items-center justify-center">🔵</span>
                            Medium Priority - Enhanced Analysis
                        </h3>
                        <div className="space-y-3">
                            {checklistItems.slice(7).map((item, i) => (
                                <ChecklistItem key={i + 7} {...item} checked={checklist[i + 7]} onToggle={() => toggleCheck(i + 7)} />
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* ==================== HOW TO USE ==================== */}
            {activeTab === 'howto' && (
                <div className="space-y-6">
                    <div>
                        <h2 className="text-2xl font-bold text-white mb-2">How To Use The Backtest System</h2>
                        <p className="text-slate-400">Step-by-step guide to validating and improving your market analyzer</p>
                    </div>

                    {/* Steps */}
                    {[
                        { num: 1, title: 'Run a Replay Backtest', items: ['Go to Replay Backtest page', 'Select a time range with varied market conditions', 'Choose step size: 1h for macro, 30m for scalping', 'Click "Run Backtest" and wait for completion'] },
                        { num: 2, title: 'Label the Outcomes', items: ['After replay completes, click "Label Outcomes"', 'This looks at what actually happened after each prediction', 'Labels: CONTINUATION (right), REVERSAL (wrong), NOISE (no move)'] },
                        { num: 3, title: 'Analyze Your Results', items: ['Check Overall Accuracy: % of correct predictions', 'Check Directional Accuracy: LONG vs SHORT performance', 'Check Confidence Calibration: higher conf = higher accuracy?'] },
                        { num: 4, title: 'Identify the Dominant Failure', items: ['Look at error bucketing - which category has most failures?', 'Pull 5-10 specific examples from that category', 'Propose a SINGLE fix (don\'t fix multiple things!)'] },
                        { num: 5, title: 'Make the Change & Re-Test', items: ['Document baseline before changing anything', 'Make ONE change: adjust threshold, weight, or logic', 'Run unit tests, then re-run backtest with same parameters', 'Compare: Did metrics improve? Any regression?'] }
                    ].map(step => (
                        <div key={step.num} className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
                            <h3 className="flex items-center gap-3 text-lg font-semibold text-cyan-400 mb-4">
                                <span className="w-8 h-8 bg-gradient-to-br from-purple-500 to-cyan-500 rounded-full flex items-center justify-center text-white font-bold text-sm">{step.num}</span>
                                {step.title}
                            </h3>
                            <ul className="space-y-2">
                                {step.items.map((item, i) => (
                                    <li key={i} className="flex items-center gap-3 text-slate-300">
                                        <ArrowRight className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                                        {item}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}

                    {/* Key Principle */}
                    <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-5">
                        <p className="text-emerald-400">
                            💡 <strong>Key Principle:</strong> Fix ONE thing at a time. If you change multiple things, you won't know what worked.
                        </p>
                    </div>

                    {/* Metrics Table */}
                    <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
                        <h3 className="text-lg font-semibold text-white mb-4">Target Metrics</h3>
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-slate-700">
                                    <th className="text-left py-3 text-cyan-400 font-medium">Metric</th>
                                    <th className="text-left py-3 text-cyan-400 font-medium">Target</th>
                                    <th className="text-left py-3 text-cyan-400 font-medium">Red Flag</th>
                                </tr>
                            </thead>
                            <tbody className="text-slate-300">
                                <tr className="border-b border-slate-700/50">
                                    <td className="py-3">Overall Accuracy</td>
                                    <td className="py-3 text-emerald-400">&gt;55%</td>
                                    <td className="py-3 text-red-400">&lt;50%</td>
                                </tr>
                                <tr className="border-b border-slate-700/50">
                                    <td className="py-3">Directional Accuracy</td>
                                    <td className="py-3 text-emerald-400">&gt;57%</td>
                                    <td className="py-3 text-red-400">&lt;53%</td>
                                </tr>
                                <tr className="border-b border-slate-700/50">
                                    <td className="py-3">Confidence Correlation</td>
                                    <td className="py-3 text-emerald-400">&gt;0.3</td>
                                    <td className="py-3 text-red-400">&lt;0 (inverted)</td>
                                </tr>
                                <tr>
                                    <td className="py-3">WAIT Volatility Ratio</td>
                                    <td className="py-3 text-emerald-400">&gt;1.2</td>
                                    <td className="py-3 text-red-400">&lt;1.0</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ==================== YOUR DATA ==================== */}
            {activeTab === 'yourdata' && (
                <div className="space-y-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-2xl font-bold text-white mb-2">Your Data Analysis</h2>
                            <p className="text-slate-400">Based on replay_states from your database</p>
                        </div>
                        <button
                            onClick={loadStats}
                            disabled={loadingStats}
                            className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                        >
                            <RefreshCw className={`w-4 h-4 ${loadingStats ? 'animate-spin' : ''}`} />
                            Refresh
                        </button>
                    </div>

                    {loadingStats ? (
                        <div className="text-center py-12 text-slate-400">Loading stats...</div>
                    ) : stats ? (
                        <>
                            {/* Stats Grid */}
                            <div className="grid md:grid-cols-3 gap-4">
                                <StatCard
                                    label="Total States"
                                    value={stats.totalStates}
                                    subtext={stats.totalStates < 200 ? 'Need 200+ for significance' : 'Good sample size!'}
                                    variant={stats.totalStates < 50 ? 'danger' : stats.totalStates < 200 ? 'warning' : 'good'}
                                />
                                <StatCard
                                    label="Labeled Outcomes"
                                    value={stats.labeledCount}
                                    subtext={stats.labeledCount === 0 ? 'Run Label Outcomes!' : `${Math.round(stats.labeledCount / stats.totalStates * 100)}% labeled`}
                                    variant={stats.labeledCount === 0 ? 'danger' : 'default'}
                                />
                                <StatCard
                                    label="Avg Confidence"
                                    value={stats.avgConfidence?.toFixed(1) || 'N/A'}
                                    subtext={`Range: ${stats.confidenceRange?.min?.toFixed(1) || '?'} - ${stats.confidenceRange?.max?.toFixed(1) || '?'}`}
                                />
                            </div>

                            {/* Bias Distribution */}
                            <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
                                <h3 className="text-lg font-semibold text-white mb-4">Bias Distribution</h3>
                                <div className="grid grid-cols-3 gap-4">
                                    <div className="text-center">
                                        <TrendingUp className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                                        <div className="text-2xl font-bold text-white">{stats.biasDistribution?.LONG || 0}</div>
                                        <div className="text-sm text-slate-400">LONG</div>
                                    </div>
                                    <div className="text-center">
                                        <TrendingDown className="w-8 h-8 text-red-400 mx-auto mb-2" />
                                        <div className="text-2xl font-bold text-white">{stats.biasDistribution?.SHORT || 0}</div>
                                        <div className="text-sm text-slate-400">SHORT</div>
                                    </div>
                                    <div className="text-center">
                                        <Minus className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                                        <div className="text-2xl font-bold text-white">{stats.biasDistribution?.WAIT || 0}</div>
                                        <div className="text-sm text-slate-400">WAIT</div>
                                    </div>
                                </div>
                            </div>

                            {/* Issues */}
                            {stats.issues && stats.issues.length > 0 && (
                                <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6">
                                    <h3 className="flex items-center gap-2 text-lg font-semibold text-red-400 mb-4">
                                        <AlertTriangle className="w-5 h-5" />
                                        Critical Issues Found
                                    </h3>
                                    <ul className="space-y-2">
                                        {stats.issues.map((issue, i) => (
                                            <li key={i} className="flex items-start gap-2 text-slate-300">
                                                <span className="text-amber-400 mt-0.5">⚠</span>
                                                {issue}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {/* Action Steps */}
                            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-6">
                                <h3 className="text-lg font-semibold text-emerald-400 mb-4">✅ Next Steps</h3>
                                <div className="space-y-3">
                                    <ActionStep num={1} title="Run Outcome Labeling" desc="Click 'Label Outcomes' in Replay Backtest to assign CONTINUATION/REVERSAL/NOISE labels." />
                                    <ActionStep num={2} title="Increase Sample Size" desc="Run more backtests with varied time ranges until you have 200+ labeled states." />
                                    <ActionStep num={3} title="Calculate Initial Metrics" desc="Once labeled, calculate directional accuracy and confidence calibration as your baseline." />
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="bg-slate-800/50 rounded-xl p-8 text-center border border-slate-700">
                            <BarChart3 className="w-12 h-12 text-slate-500 mx-auto mb-4" />
                            <p className="text-slate-400">Click Refresh to load your data analysis</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
