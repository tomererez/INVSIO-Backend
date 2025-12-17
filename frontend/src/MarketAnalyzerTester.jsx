import React, { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { motion, AnimatePresence } from "framer-motion";
import {
    TrendingUp,
    TrendingDown,
    Activity,
    RefreshCw,
    Eye,
    Zap,
    Target,
    AlertTriangle,
    CheckCircle2,
    XCircle,
    Loader2,
    BarChart3,
    Brain,
    Gauge,
    ArrowUpRight,
    ArrowDownRight,
    Minus,
    Clock,
    Database,
    LineChart,
    PieChart,
    ChevronDown,
    ChevronUp,
    Copy,
    Check,
    Wifi,
    WifiOff,
    Scale,
    Flame,
    Snowflake,
    Skull,
    DollarSign,
    Percent,
    TrendingUp as TrendUp,
    ArrowRightLeft,
    BarChart2,
    Download,
    Pause
} from "lucide-react";
import {
    LineChart as RechartsLine,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    AreaChart,
    Area,
    BarChart,
    Bar,
    PieChart as RechartsPie,
    Pie,
    Cell,
    RadarChart,
    PolarGrid,
    PolarAngleAxis,
    Radar,
    ScatterChart,
    Scatter
} from 'recharts';

// ==================== HELPER COMPONENTS ====================

const BiasIndicator = ({ bias, confidence, size = "large" }) => {
    const biasConfig = {
        LONG: { color: "emerald", icon: TrendingUp, label: "LONG", bg: "from-emerald-500/20 to-emerald-600/10" },
        SHORT: { color: "red", icon: TrendingDown, label: "SHORT", bg: "from-red-500/20 to-red-600/10" },
        STRONG_LONG: { color: "emerald", icon: TrendingUp, label: "STRONG LONG", bg: "from-emerald-500/30 to-emerald-600/20" },
        STRONG_SHORT: { color: "red", icon: TrendingDown, label: "STRONG SHORT", bg: "from-red-500/30 to-red-600/20" },
        WAIT: { color: "amber", icon: Minus, label: "WAIT", bg: "from-amber-500/20 to-amber-600/10" },
    };

    const config = biasConfig[bias] || biasConfig.WAIT;
    const Icon = config.icon;

    if (size === "small") {
        return (
            <span className={`px-2 py-1 rounded text-xs font-bold bg-${config.color}-500/20 text-${config.color}-400`}>
                {config.label}
            </span>
        );
    }

    return (
        <div className={`rounded-2xl p-6 bg-gradient-to-br ${config.bg} border border-${config.color}-500/30`}>
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-slate-400 text-sm mb-1">Market Bias</p>
                    <p className={`text-3xl font-bold text-${config.color}-400`}>{config.label}</p>
                </div>
                <div className={`w-16 h-16 rounded-2xl bg-${config.color}-500/20 flex items-center justify-center`}>
                    <Icon className={`w-8 h-8 text-${config.color}-400`} />
                </div>
            </div>
            <div className="mt-4">
                <div className="flex justify-between text-sm mb-2">
                    <span className="text-slate-400">Confidence</span>
                    <span className={`text-${config.color}-400 font-bold`}>{confidence}/10</span>
                </div>
                <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                    <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${confidence * 10}%` }}
                        className={`h-full rounded-full bg-${config.color}-500`}
                    />
                </div>
            </div>
        </div>
    );
};

const MetricCard = ({ icon: Icon, title, value, subtitle, color = "blue", trend }) => (
    <Card className="bg-slate-900/50 border-slate-800 shadow-xl overflow-hidden">
        <div className={`absolute inset-0 bg-gradient-to-br from-${color}-500/10 to-transparent pointer-events-none`} />
        <CardContent className="p-5 relative">
            <div className="flex items-center justify-between mb-3">
                <div className={`w-10 h-10 rounded-xl bg-${color}-500/20 flex items-center justify-center`}>
                    <Icon className={`w-5 h-5 text-${color}-400`} />
                </div>
                {trend !== undefined && (
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${trend > 0 ? 'bg-emerald-500/20 text-emerald-400' :
                        trend < 0 ? 'bg-red-500/20 text-red-400' :
                            'bg-slate-500/20 text-slate-400'
                        }`}>
                        {trend > 0 ? '+' : ''}{trend}%
                    </span>
                )}
            </div>
            <p className="text-slate-400 text-sm">{title}</p>
            <p className="text-2xl font-bold text-white mt-1">{value}</p>
            {subtitle && <p className="text-slate-500 text-xs mt-1">{subtitle}</p>}
        </CardContent>
    </Card>
);

const ExchangeCard = ({ name, data, isWhale = false }) => {
    if (!data) return null;

    return (
        <Card className="bg-slate-900/50 border-slate-800 shadow-xl">
            <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-3 text-lg text-white">
                    <div className={`w-10 h-10 rounded-xl ${isWhale ? 'bg-purple-500/20' : 'bg-blue-500/20'} flex items-center justify-center`}>
                        {isWhale ? <Skull className="w-5 h-5 text-purple-400" /> : <Database className="w-5 h-5 text-blue-400" />}
                    </div>
                    {name}
                    {isWhale && <span className="text-xs bg-purple-500/20 text-purple-400 px-2 py-1 rounded-full">🐋 Smart Money</span>}
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <p className="text-slate-400 text-xs">Price</p>
                        <p className="text-white font-bold text-lg">${data.price?.toLocaleString() || 'N/A'}</p>
                    </div>
                    <div>
                        <p className="text-slate-400 text-xs">Price Change</p>
                        <p className={`font-bold text-lg ${(data.price_change || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {data.price_change >= 0 ? '+' : ''}{data.price_change?.toFixed(2) || 0}%
                        </p>
                    </div>
                </div>

                <div className="h-px bg-slate-800" />

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <p className="text-slate-400 text-xs">Open Interest</p>
                        <p className="text-white font-medium">${(data.oi / 1e9)?.toFixed(2) || 0}B</p>
                        <p className={`text-xs ${(data.oi_change || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {data.oi_change >= 0 ? '↑' : '↓'} {Math.abs(data.oi_change)?.toFixed(2) || 0}%
                        </p>
                    </div>
                    <div>
                        <p className="text-slate-400 text-xs">CVD</p>
                        <p className={`font-medium ${(data.cvd || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            ${((data.cvd || 0) / 1e9).toFixed(2)}B
                        </p>
                    </div>
                </div>

                <div className="h-px bg-slate-800" />

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <p className="text-slate-400 text-xs">Funding Rate</p>
                        <p className={`font-medium ${(data.funding_rate_avg_pct || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {data.funding_rate_avg_pct?.toFixed(4) || 0}%
                        </p>
                    </div>
                    <div>
                        <p className="text-slate-400 text-xs">Volume</p>
                        <p className="text-white font-medium">${((data.volume || 0) / 1e9).toFixed(2)}B</p>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
};

const ScenarioTag = ({ scenario }) => {
    const scenarioConfig = {
        whale_distribution: { color: "red", icon: "🔴", desc: "Whales dumping on retail" },
        whale_accumulation: { color: "emerald", icon: "🐋", desc: "Whales accumulating" },
        retail_fomo_rally: { color: "amber", icon: "🚨", desc: "Retail FOMO, whales absent" },
        short_squeeze_setup: { color: "purple", icon: "⚡", desc: "Short squeeze forming" },
        whale_hedging: { color: "blue", icon: "🛡️", desc: "Whales hedging the rally" },
        synchronized_bullish: { color: "emerald", icon: "✅", desc: "Healthy bullish consensus" },
        synchronized_bearish: { color: "red", icon: "🔻", desc: "Strong bearish consensus" },
        bybit_leading: { color: "purple", icon: "📊", desc: "Bybit leading the move" },
        binance_noise: { color: "slate", icon: "📢", desc: "Retail noise, wait for confirmation" },
        unclear: { color: "slate", icon: "❓", desc: "Mixed signals" }
    };

    const config = scenarioConfig[scenario] || scenarioConfig.unclear;

    return (
        <div className={`p-4 rounded-xl bg-${config.color}-500/10 border border-${config.color}-500/30`}>
            <div className="flex items-center gap-2 mb-2">
                <span className="text-xl">{config.icon}</span>
                <span className={`text-${config.color}-400 font-bold capitalize`}>{scenario?.replace(/_/g, ' ')}</span>
            </div>
            <p className="text-slate-400 text-sm">{config.desc}</p>
        </div>
    );
};

const RegimeCard = ({ regime, subType, characteristics }) => {
    const regimeColors = {
        distribution: "red",
        accumulation: "emerald",
        trap: "amber",
        covering: "blue",
        trending: "purple",
        unclear: "slate"
    };

    const color = regimeColors[regime] || "slate";

    return (
        <Card className={`bg-slate-900/50 border-slate-800 shadow-xl`}>
            <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-white">
                    <Gauge className={`w-5 h-5 text-${color}-400`} />
                    Market Regime
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className={`inline-block px-3 py-1 rounded-full bg-${color}-500/20 text-${color}-400 font-bold mb-3 capitalize`}>
                    {regime}
                </div>
                {subType && <p className="text-slate-400 text-sm mb-3">Sub-type: <span className="text-white capitalize">{subType?.replace(/_/g, ' ')}</span></p>}
                {characteristics && characteristics.length > 0 && (
                    <ul className="space-y-2">
                        {characteristics.map((char, i) => (
                            <li key={i} className="text-slate-300 text-sm flex items-start gap-2">
                                <span className="text-emerald-400 mt-1">•</span>
                                {char}
                            </li>
                        ))}
                    </ul>
                )}
            </CardContent>
        </Card>
    );
};

const SignalsList = ({ signals }) => (
    <div className="space-y-3">
        {signals?.map((signal, i) => (
            <div key={i} className="p-4 bg-slate-800/50 rounded-xl border border-slate-700/50">
                <div className="flex items-center justify-between mb-2">
                    <span className="text-white font-medium capitalize">{signal.name?.replace(/_/g, ' ')}</span>
                    <span className={`px-2 py-1 rounded text-xs font-bold ${signal.signal === 'LONG' || signal.signal === 'STRONG_LONG' ? 'bg-emerald-500/20 text-emerald-400' :
                        signal.signal === 'SHORT' || signal.signal === 'STRONG_SHORT' ? 'bg-red-500/20 text-red-400' :
                            'bg-slate-500/20 text-slate-400'
                        }`}>
                        {signal.signal}
                    </span>
                </div>
                <div className="flex items-center gap-4 text-sm">
                    <span className="text-slate-400">Weight: <span className="text-white">{(signal.weight * 100).toFixed(0)}%</span></span>
                    <span className="text-slate-400">Confidence: <span className="text-white">{signal.confidence?.toFixed(1)}</span></span>
                </div>
                {signal.reasoning && (
                    <p className="text-slate-500 text-xs mt-2">{signal.reasoning}</p>
                )}
            </div>
        ))}
    </div>
);

const JsonViewer = ({ data, title }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(JSON.stringify(data, null, 2));
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-white">
                    <div className="flex items-center gap-2">
                        <Database className="w-5 h-5 text-purple-400" />
                        {title}
                    </div>
                    <div className="flex gap-2">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleCopy}
                            className="text-slate-400 hover:text-white"
                        >
                            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setIsExpanded(!isExpanded)}
                            className="text-slate-400 hover:text-white"
                        >
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </Button>
                    </div>
                </CardTitle>
            </CardHeader>
            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                    >
                        <CardContent>
                            <pre className="text-xs text-slate-300 bg-slate-950 p-4 rounded-xl overflow-auto max-h-96">
                                {JSON.stringify(data, null, 2)}
                            </pre>
                        </CardContent>
                    </motion.div>
                )}
            </AnimatePresence>
        </Card>
    );
};

// ==================== TIMEFRAME BUCKET CARD ====================

const TimeframeBucketCard = ({ title, subtitle, bias, tradeStance, confidence, summary, bullets = [], status }) => {
    const getBiasStyles = (bias) => {
        switch (bias) {
            case 'BULLISH':
                return {
                    badge: 'bg-emerald-500 text-white',
                    border: 'border-emerald-500/30',
                    bullet: 'text-emerald-400',
                    glow: 'shadow-emerald-500/20'
                };
            case 'BEARISH':
                return {
                    badge: 'bg-red-500 text-white',
                    border: 'border-red-500/30',
                    bullet: 'text-red-400',
                    glow: 'shadow-red-500/20'
                };
            default:
                return {
                    badge: 'bg-slate-500 text-white',
                    border: 'border-slate-500/30',
                    bullet: 'text-slate-400',
                    glow: 'shadow-slate-500/20'
                };
        }
    };

    const getTradeStanceIcon = (stance) => {
        switch (stance) {
            case 'LOOK_FOR_LONGS':
                return <TrendingUp className="w-4 h-4 text-emerald-400" />;
            case 'LOOK_FOR_SHORTS':
                return <TrendingDown className="w-4 h-4 text-red-400" />;
            default:
                return <AlertTriangle className="w-4 h-4 text-amber-400" />;
        }
    };

    const formatTradeStance = (stance) => {
        switch (stance) {
            case 'LOOK_FOR_LONGS': return 'Look for Longs';
            case 'LOOK_FOR_SHORTS': return 'Look for Shorts';
            default: return 'Avoid Trading';
        }
    };

    const styles = getBiasStyles(bias);

    return (
        <div className={`bg-slate-800/60 rounded-xl p-4 border ${styles.border} hover:bg-slate-800/80 transition-all duration-300`}>
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-slate-700/50 flex items-center justify-center">
                        <BarChart2 className="w-4 h-4 text-slate-400" />
                    </div>
                    <div>
                        <h3 className="text-white font-bold text-sm">{title}</h3>
                        <p className="text-slate-500 text-xs">{subtitle}</p>
                    </div>
                </div>
                <span className={`px-2.5 py-1 rounded-md text-xs font-bold ${styles.badge}`}>
                    {bias}
                </span>
            </div>

            {/* Summary */}
            <p className="text-slate-300 text-sm mb-3 leading-relaxed">
                {summary}
            </p>

            {/* Bullets */}
            <ul className="space-y-1.5 mb-4">
                {bullets.map((bullet, i) => (
                    <li key={i} className="text-slate-400 text-xs flex items-start gap-2">
                        <span className={`${styles.bullet} mt-0.5`}>•</span>
                        <span>{bullet}</span>
                    </li>
                ))}
            </ul>

            {/* Footer */}
            <div className="pt-3 border-t border-slate-700/50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    {getTradeStanceIcon(tradeStance)}
                    <span className="text-slate-400 text-xs">{formatTradeStance(tradeStance)}</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <span className="text-slate-500 text-xs">Conf:</span>
                    <span className={`text-sm font-mono font-bold ${styles.bullet}`}>
                        {confidence}%
                    </span>
                </div>
            </div>
        </div>
    );
};

// ==================== MAIN COMPONENT ====================

export default function MarketAnalyzerTester() {
    const [marketData, setMarketData] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [lastUpdate, setLastUpdate] = useState(null);
    const [autoRefresh, setAutoRefresh] = useState(false);
    const [refreshInterval, setRefreshInterval] = useState(1); // Interval in minutes
    const [signalHistory, setSignalHistory] = useState([]);
    const [activeTab, setActiveTab] = useState("overview");
    const [connectionStatus, setConnectionStatus] = useState("disconnected");

    // Debug state
    const [debugLogs, setDebugLogs] = useState([]);
    const [fetchTimer, setFetchTimer] = useState(null);
    const [lastFetchDuration, setLastFetchDuration] = useState(null);
    const [showCronSettings, setShowCronSettings] = useState(false);

    // Debug logging helper
    const logDebug = (category, message, data = null) => {
        const timestamp = new Date();
        const logEntry = {
            id: Date.now(),
            timestamp,
            category,
            message,
            data
        };
        console.log(`[${timestamp.toLocaleTimeString()}] [${category}]`, message, data || '');
        setDebugLogs(prev => [logEntry, ...prev.slice(0, 99)]); // Keep last 100
    };

    // Fetch market data
    const fetchMarketData = useCallback(async (forceRefresh = false) => {
        const startTime = Date.now();
        setIsLoading(true);
        setError(null);
        setConnectionStatus("connecting");

        logDebug('FETCH', `Starting fetch (forceRefresh=${forceRefresh})...`);

        try {
            const url = forceRefresh
                ? '/api/ai-market-analyzer/btc?refresh=true'
                : '/api/ai-market-analyzer/btc';

            logDebug('API', `Requesting: ${url}`);
            const response = await fetch(url);
            const responseTime = Date.now() - startTime;
            logDebug('API', `Response received in ${responseTime}ms`, { status: response.status });

            if (!response.ok) throw new Error(`API Error: ${response.status}`);

            const result = await response.json();
            const parseTime = Date.now() - startTime;
            logDebug('PARSE', `JSON parsed in ${parseTime}ms`);

            if (result.success) {
                // Log detailed analysis info
                logDebug('DATA', 'Analysis received', {
                    bias: result.data.finalDecision?.bias,
                    confidence: result.data.finalDecision?.confidence,
                    tradeStance: result.data.finalDecision?.tradeStance,
                    primaryRegime: result.data.finalDecision?.primaryRegime,
                    riskMode: result.data.finalDecision?.riskMode,
                    scenario: result.data.exchangeDivergence?.scenario,
                    alertsCount: result.data.alerts?.length || 0,
                    cached: result.meta?.cached,
                    stateId: result.meta?.stateId
                });

                // Log timeframe breakdown if available
                if (result.data.timeframes) {
                    logDebug('TIMEFRAMES', 'Per-timeframe analysis', {
                        available: Object.keys(result.data.timeframes),
                        details: Object.entries(result.data.timeframes).map(([tf, data]) => ({
                            tf,
                            bias: data.finalDecision?.bias,
                            confidence: data.finalDecision?.confidence,
                            regime: data.marketRegime?.regime
                        }))
                    });
                }

                // Store data with meta information attached
                const dataWithMeta = {
                    ...result.data,
                    meta: result.meta
                };
                setMarketData(dataWithMeta);
                setLastUpdate(new Date());
                setConnectionStatus("connected");

                // Add to signal history
                if (result.data?.finalDecision) {
                    setSignalHistory(prev => [
                        {
                            timestamp: new Date(),
                            bias: result.data.finalDecision.bias,
                            confidence: result.data.finalDecision.confidence,
                            scenario: result.data.exchangeDivergence?.scenario,
                            regime: result.data.marketRegime?.regime,
                            isDemo: !!result.meta?.demo
                        },
                        ...prev.slice(0, 49) // Keep last 50
                    ]);
                }

                const totalTime = Date.now() - startTime;
                setLastFetchDuration(totalTime);
                logDebug('COMPLETE', `Fetch completed in ${totalTime}ms`, { cached: result.meta?.cached });
            } else {
                throw new Error(result.message || 'Unknown error');
            }
        } catch (err) {
            const errorTime = Date.now() - startTime;
            logDebug('ERROR', `Fetch failed after ${errorTime}ms: ${err.message}`);
            setError(err.message);
            setConnectionStatus("error");
        } finally {
            setIsLoading(false);
        }
    }, []);

    // Load persisted history from database on mount
    const loadPersistedHistory = useCallback(async () => {
        try {
            logDebug('HISTORY', 'Loading persisted history from database...');
            const response = await fetch('/api/history/states?limit=50');
            if (!response.ok) {
                logDebug('HISTORY', `Failed to load history: ${response.status}`);
                return;
            }
            const result = await response.json();
            if (result.success && result.data && result.data.length > 0) {
                // Map database records to signalHistory format
                const historicalSignals = result.data.map(state => {
                    // Parse full_state_json if it exists
                    const fullState = state.full_state_json || state;
                    return {
                        timestamp: new Date(state.timestamp),
                        bias: state.bias || fullState.finalDecision?.bias || 'WAIT',
                        confidence: state.confidence || fullState.finalDecision?.confidence || 0,
                        scenario: fullState.exchangeDivergence?.scenario || null,
                        regime: state.primary_regime || state.regime_state || fullState.marketRegime?.regime || null,
                        isDemo: false,
                        fromDatabase: true
                    };
                });
                setSignalHistory(historicalSignals);
                logDebug('HISTORY', `Loaded ${historicalSignals.length} historical signals from database`);
            } else {
                logDebug('HISTORY', 'No historical data found in database');
            }
        } catch (err) {
            logDebug('HISTORY', `Error loading history: ${err.message}`);
        }
    }, []);

    // Initial load - ONLY load persisted history, NOT live data
    // Live data is fetched when user clicks Refresh or enables auto-refresh
    useEffect(() => {
        loadPersistedHistory(); // Load history from database first
        // fetchMarketData() - REMOVED: Don't auto-fetch on page load
    }, [loadPersistedHistory]);

    // Auto-refresh with configurable interval
    useEffect(() => {
        let interval;
        if (autoRefresh && refreshInterval > 0) {
            const ms = refreshInterval * 60 * 1000; // Convert minutes to ms
            interval = setInterval(() => fetchMarketData(), ms);
        }
        return () => clearInterval(interval);
    }, [autoRefresh, refreshInterval, fetchMarketData]);

    // Prepare chart data
    const getSignalHistoryChartData = () => {
        return signalHistory.slice(0, 20).reverse().map((signal, i) => ({
            time: i + 1,
            confidence: signal.confidence,
            bias: signal.bias === 'LONG' || signal.bias === 'STRONG_LONG' ? 1 :
                signal.bias === 'SHORT' || signal.bias === 'STRONG_SHORT' ? -1 : 0
        }));
    };

    const getScoresChartData = () => {
        if (!marketData?.finalDecision?.scores) return [];
        const { long, short, wait } = marketData.finalDecision.scores;
        return [
            { name: 'LONG', value: long, fill: '#10b981' },
            { name: 'SHORT', value: short, fill: '#ef4444' },
            { name: 'WAIT', value: wait, fill: '#6b7280' }
        ];
    };

    // Export signal history to CSV
    const exportSignalHistory = () => {
        if (signalHistory.length === 0) return;

        const headers = ['Timestamp', 'Bias', 'Confidence', 'Scenario', 'Regime', 'Source'];
        const rows = signalHistory.map(signal => [
            signal.timestamp instanceof Date ? signal.timestamp.toISOString() : new Date(signal.timestamp).toISOString(),
            signal.bias || '',
            signal.confidence?.toFixed(2) || '',
            signal.scenario || '',
            signal.regime || '',
            signal.fromDatabase ? 'Database' : 'Live'
        ]);

        const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `signal_history_${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
            {/* Header */}
            <div className="border-b border-slate-800/50 backdrop-blur-sm sticky top-0 z-40 bg-slate-950/80">
                <div className="max-w-7xl mx-auto px-6 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-purple-500/20">
                                <Brain className="w-6 h-6 text-white" />
                            </div>
                            <div>
                                <h1 className="text-2xl font-bold text-white">Market Analyzer Tester</h1>
                                <p className="text-slate-400 text-sm">Real-time BTC analysis with signal tracking</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-4">
                            {/* Connection Status */}
                            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm ${connectionStatus === 'connected' ? 'bg-emerald-500/20 text-emerald-400' :
                                connectionStatus === 'connecting' ? 'bg-amber-500/20 text-amber-400' :
                                    'bg-red-500/20 text-red-400'
                                }`}>
                                {connectionStatus === 'connected' ? <Wifi className="w-4 h-4" /> :
                                    connectionStatus === 'connecting' ? <Loader2 className="w-4 h-4 animate-spin" /> :
                                        <WifiOff className="w-4 h-4" />}
                                {connectionStatus.charAt(0).toUpperCase() + connectionStatus.slice(1)}
                            </div>

                            {/* Auto Refresh Control */}
                            <div className="relative">
                                <Button
                                    variant={autoRefresh ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => setShowCronSettings(!showCronSettings)}
                                    className={autoRefresh ?
                                        "bg-purple-600 text-white" :
                                        "border-slate-700 text-slate-400 hover:text-white"
                                    }
                                >
                                    <Clock className="w-4 h-4 mr-2" />
                                    {autoRefresh ? `Auto ${refreshInterval}m` : 'Auto OFF'}
                                    <ChevronDown className="w-3 h-3 ml-1" />
                                </Button>

                                {/* Cron Settings Dropdown */}
                                {showCronSettings && (
                                    <div className="absolute top-full right-0 mt-2 w-56 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-50">
                                        <div className="p-3 border-b border-slate-700">
                                            <div className="text-xs text-slate-400 uppercase mb-2">Auto-Refresh Settings</div>
                                        </div>
                                        <div className="p-3 space-y-3">
                                            {/* Toggle */}
                                            <div className="flex items-center justify-between">
                                                <span className="text-sm text-slate-300">Enabled</span>
                                                <button
                                                    onClick={() => setAutoRefresh(!autoRefresh)}
                                                    className={`w-10 h-5 rounded-full transition-colors ${autoRefresh ? 'bg-purple-600' : 'bg-slate-600'}`}
                                                >
                                                    <div className={`w-4 h-4 bg-white rounded-full transition-transform ${autoRefresh ? 'translate-x-5' : 'translate-x-0.5'}`} />
                                                </button>
                                            </div>

                                            {/* Interval Selector */}
                                            <div>
                                                <label className="text-xs text-slate-400 block mb-1">Refresh Interval</label>
                                                <div className="grid grid-cols-4 gap-1">
                                                    {[1, 2, 5, 10].map(min => (
                                                        <button
                                                            key={min}
                                                            onClick={() => setRefreshInterval(min)}
                                                            className={`px-2 py-1.5 text-xs rounded ${refreshInterval === min
                                                                ? 'bg-purple-600 text-white'
                                                                : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                                                                }`}
                                                        >
                                                            {min}m
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* Custom Interval */}
                                            <div>
                                                <label className="text-xs text-slate-400 block mb-1">Custom (minutes)</label>
                                                <input
                                                    type="number"
                                                    min="1"
                                                    max="60"
                                                    value={refreshInterval}
                                                    onChange={(e) => setRefreshInterval(Math.max(1, Math.min(60, parseInt(e.target.value) || 1)))}
                                                    className="w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-white text-sm"
                                                />
                                            </div>

                                            {/* Stop Button */}
                                            <button
                                                onClick={() => {
                                                    setAutoRefresh(false);
                                                    setShowCronSettings(false);
                                                }}
                                                className="w-full py-2 bg-red-600/20 text-red-400 rounded text-sm hover:bg-red-600/30 flex items-center justify-center gap-2"
                                            >
                                                <Pause className="w-4 h-4" />
                                                Stop Auto-Refresh
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Refresh Button */}
                            <Button
                                onClick={() => fetchMarketData(true)}
                                disabled={isLoading}
                                className="bg-gradient-to-r from-violet-600 to-purple-600 text-white hover:from-violet-700 hover:to-purple-700 shadow-lg shadow-purple-500/20"
                            >
                                {isLoading ? (
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                ) : (
                                    <RefreshCw className="w-4 h-4 mr-2" />
                                )}
                                {isLoading ? 'Fetching...' : 'Refresh Data'}
                            </Button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Last Update Bar */}
            {lastUpdate && (
                <div className="bg-slate-900/50 border-b border-slate-800/50">
                    <div className="max-w-7xl mx-auto px-6 py-2 flex items-center justify-between">
                        <span className="text-slate-500 text-sm">
                            Last updated: {lastUpdate.toLocaleTimeString()}
                            {marketData?.meta?.cached && (
                                <span className="ml-2 px-2 py-0.5 bg-amber-500/20 text-amber-400 rounded text-xs">
                                    CACHED ({marketData.meta?.age_minutes || 0}m old)
                                </span>
                            )}
                        </span>
                        <div className="flex items-center gap-4 text-sm">
                            <span className="text-slate-500">BTC</span>
                            <span className="text-white font-bold">
                                ${marketData?.raw?.binance?.["4h"]?.price?.toLocaleString() || 'Loading...'}
                            </span>
                        </div>
                    </div>
                </div>
            )}

            {/* Error Display */}
            {error && (
                <div className="max-w-7xl mx-auto px-6 py-4">
                    <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-3">
                        <XCircle className="w-5 h-5 text-red-400" />
                        <span className="text-red-400">{error}</span>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => fetchMarketData()}
                            className="ml-auto text-red-400 hover:text-red-300"
                        >
                            Retry
                        </Button>
                    </div>
                </div>
            )}

            {/* Main Content */}
            <div className="max-w-7xl mx-auto px-6 py-8">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-8">
                    <TabsList className="bg-slate-800/50 p-1 rounded-xl">
                        <TabsTrigger value="overview" className="rounded-lg px-6 py-2.5 data-[state=active]:bg-purple-600 data-[state=active]:text-white">
                            <Eye className="w-4 h-4 mr-2" />
                            Overview
                        </TabsTrigger>
                        <TabsTrigger value="exchanges" className="rounded-lg px-6 py-2.5 data-[state=active]:bg-purple-600 data-[state=active]:text-white">
                            <ArrowRightLeft className="w-4 h-4 mr-2" />
                            Exchanges
                        </TabsTrigger>
                        <TabsTrigger value="signals" className="rounded-lg px-6 py-2.5 data-[state=active]:bg-purple-600 data-[state=active]:text-white">
                            <Zap className="w-4 h-4 mr-2" />
                            Signals
                        </TabsTrigger>
                        <TabsTrigger value="history" className="rounded-lg px-6 py-2.5 data-[state=active]:bg-purple-600 data-[state=active]:text-white">
                            <LineChart className="w-4 h-4 mr-2" />
                            History
                        </TabsTrigger>
                        <TabsTrigger value="raw" className="rounded-lg px-6 py-2.5 data-[state=active]:bg-purple-600 data-[state=active]:text-white">
                            <Database className="w-4 h-4 mr-2" />
                            Raw Data
                        </TabsTrigger>
                        <TabsTrigger value="debug" className="rounded-lg px-6 py-2.5 data-[state=active]:bg-amber-600 data-[state=active]:text-white">
                            <Activity className="w-4 h-4 mr-2" />
                            Debug
                            {lastFetchDuration && (
                                <span className="ml-2 text-xs bg-slate-700 px-1.5 py-0.5 rounded">
                                    {(lastFetchDuration / 1000).toFixed(1)}s
                                </span>
                            )}
                        </TabsTrigger>
                    </TabsList>

                    {/* ==================== OVERVIEW TAB ==================== */}
                    <TabsContent value="overview">
                        {marketData ? (
                            <div className="space-y-8">
                                {/* Main Bias + Key Metrics */}
                                <div className="grid lg:grid-cols-3 gap-6">
                                    {/* Bias Card - Large */}
                                    <div className="lg:col-span-1">
                                        <BiasIndicator
                                            bias={marketData.finalDecision?.bias || 'WAIT'}
                                            confidence={marketData.finalDecision?.confidence || 0}
                                        />
                                    </div>

                                    {/* Scenario + Regime */}
                                    <div className="lg:col-span-2 grid md:grid-cols-2 gap-6">
                                        <ScenarioTag scenario={marketData.exchangeDivergence?.scenario} />
                                        <RegimeCard
                                            regime={marketData.marketRegime?.regime}
                                            subType={marketData.marketRegime?.subType}
                                            characteristics={marketData.marketRegime?.characteristics}
                                        />
                                    </div>
                                </div>

                                {/* Macro Hierarchy Warning Banner */}
                                {marketData.finalDecision?.macroAnchored && marketData.finalDecision?.warning && (
                                    <div className="bg-amber-500/20 border border-amber-500/30 rounded-xl p-4 flex items-center gap-3">
                                        <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0" />
                                        <div>
                                            <span className="text-amber-400 font-medium">Macro Anchored: </span>
                                            <span className="text-amber-300">{marketData.finalDecision.warning}</span>
                                        </div>
                                    </div>
                                )}

                                {/* Timeframe Buckets: MACRO / MICRO / SCALPING */}
                                {marketData.timeframeBuckets && (
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <TimeframeBucketCard
                                            title="MACRO"
                                            subtitle="D-4H TIMEFRAME"
                                            {...marketData.timeframeBuckets.macro}
                                        />
                                        <TimeframeBucketCard
                                            title="MICRO"
                                            subtitle="4H-1H TIMEFRAME"
                                            {...marketData.timeframeBuckets.micro}
                                        />
                                        <TimeframeBucketCard
                                            title="SCALPING"
                                            subtitle="1H-30M TIMEFRAME"
                                            {...marketData.timeframeBuckets.scalping}
                                        />
                                    </div>
                                )}

                                {/* Score Distribution */}
                                <div className="grid lg:grid-cols-2 gap-6">
                                    <Card className="bg-slate-900/50 border-slate-800 shadow-xl">
                                        <CardHeader>
                                            <CardTitle className="text-white flex items-center gap-2">
                                                <Scale className="w-5 h-5 text-purple-400" />
                                                Decision Scores
                                            </CardTitle>
                                        </CardHeader>
                                        <CardContent>
                                            <div className="h-64">
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <RechartsPie>
                                                        <Pie
                                                            data={getScoresChartData()}
                                                            cx="50%"
                                                            cy="50%"
                                                            innerRadius={60}
                                                            outerRadius={90}
                                                            paddingAngle={5}
                                                            dataKey="value"
                                                            label={({ name, value }) => `${name}: ${value?.toFixed(1)}`}
                                                        >
                                                            {getScoresChartData().map((entry, index) => (
                                                                <Cell key={`cell-${index}`} fill={entry.fill} />
                                                            ))}
                                                        </Pie>
                                                        <Tooltip
                                                            contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                                                        />
                                                    </RechartsPie>
                                                </ResponsiveContainer>
                                            </div>
                                            <div className="flex justify-center gap-6 mt-4">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-3 h-3 rounded-full bg-emerald-500" />
                                                    <span className="text-slate-400 text-sm">LONG: {marketData.finalDecision?.scores?.long?.toFixed(1)}</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <div className="w-3 h-3 rounded-full bg-red-500" />
                                                    <span className="text-slate-400 text-sm">SHORT: {marketData.finalDecision?.scores?.short?.toFixed(1)}</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <div className="w-3 h-3 rounded-full bg-gray-500" />
                                                    <span className="text-slate-400 text-sm">WAIT: {marketData.finalDecision?.scores?.wait?.toFixed(1)}</span>
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>

                                    {/* Warnings */}
                                    <Card className="bg-slate-900/50 border-slate-800 shadow-xl">
                                        <CardHeader>
                                            <CardTitle className="text-white flex items-center gap-2">
                                                <AlertTriangle className="w-5 h-5 text-amber-400" />
                                                Analysis Warnings
                                            </CardTitle>
                                        </CardHeader>
                                        <CardContent>
                                            <div className="space-y-3">
                                                {marketData.exchangeDivergence?.warnings?.map((warning, i) => (
                                                    <div key={i} className="p-3 bg-slate-800/50 rounded-lg border border-slate-700/50">
                                                        <p className="text-slate-300 text-sm">{warning}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </CardContent>
                                    </Card>
                                </div>



                                {/* Compact Data Status Bar */}
                                <div className="p-4 bg-slate-900/50 rounded-xl border border-slate-800 flex items-center justify-between flex-wrap gap-4">
                                    <div className="flex items-center gap-6">
                                        <span className={`px-3 py-1.5 rounded-full text-sm font-medium ${marketData.meta?.demo
                                            ? 'bg-amber-500/20 text-amber-400'
                                            : 'bg-emerald-500/20 text-emerald-400'
                                            }`}>
                                            {marketData.meta?.demo ? '📊 Demo Data' : '🔴 Live Data'}
                                        </span>
                                        <div className="flex items-center gap-2 text-sm">
                                            <Database className="w-4 h-4 text-blue-400" />
                                            <span className="text-slate-400">Binance + Bybit</span>
                                        </div>
                                        <div className="flex items-center gap-2 text-sm">
                                            <Clock className="w-4 h-4 text-purple-400" />
                                            <span className="text-slate-400">4h / 1D</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4 text-sm text-slate-500">
                                        <span>9 Scenarios</span>
                                        <span>•</span>
                                        <span>7 Regimes</span>
                                        <span>•</span>
                                        <span>5 Signals</span>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="flex items-center justify-center h-64">
                                <div className="text-center">
                                    <Loader2 className="w-12 h-12 text-purple-400 animate-spin mx-auto mb-4" />
                                    <p className="text-slate-400">Loading market data...</p>
                                </div>
                            </div>
                        )}
                    </TabsContent>

                    {/* ==================== EXCHANGES TAB ==================== */}
                    <TabsContent value="exchanges">
                        {marketData?.raw ? (
                            <div className="space-y-8">
                                <div className="grid md:grid-cols-2 gap-6">
                                    <ExchangeCard
                                        name="Binance (BTCUSDT)"
                                        data={marketData.raw.binance?.["4h"]}
                                        isWhale={false}
                                    />
                                    <ExchangeCard
                                        name="Bybit (BTCUSD Coin-M)"
                                        data={marketData.raw.bybit?.["4h"]}
                                        isWhale={true}
                                    />
                                </div>

                                {/* Divergence Analysis */}
                                <Card className="bg-slate-900/50 border-slate-800 shadow-xl">
                                    <CardHeader>
                                        <CardTitle className="text-white flex items-center gap-2">
                                            <ArrowRightLeft className="w-5 h-5 text-purple-400" />
                                            Exchange Divergence Analysis
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="grid md:grid-cols-3 gap-6">
                                            <div>
                                                <p className="text-slate-400 text-sm mb-2">OI Delta</p>
                                                <p className={`text-2xl font-bold ${(marketData.exchangeDivergence?.deltas?.oi || 0) > 0 ? 'text-emerald-400' : 'text-red-400'
                                                    }`}>
                                                    {marketData.exchangeDivergence?.deltas?.oi?.toFixed(2) || 0}%
                                                </p>
                                                <p className="text-slate-500 text-xs mt-1">Binance OI change - Bybit OI change</p>
                                            </div>
                                            <div>
                                                <p className="text-slate-400 text-sm mb-2">CVD Delta</p>
                                                <p className={`text-2xl font-bold ${(marketData.exchangeDivergence?.deltas?.cvd_billions || 0) > 0 ? 'text-emerald-400' : 'text-red-400'
                                                    }`}>
                                                    ${marketData.exchangeDivergence?.deltas?.cvd_billions?.toFixed(2) || 0}B
                                                </p>
                                            </div>
                                            <div>
                                                <p className="text-slate-400 text-sm mb-2">Dominant Player</p>
                                                <p className={`text-2xl font-bold capitalize ${marketData.exchangeDivergence?.dominantPlayer === 'whales' ? 'text-purple-400' :
                                                    marketData.exchangeDivergence?.dominantPlayer === 'retail' ? 'text-blue-400' : 'text-slate-400'
                                                    }`}>
                                                    {marketData.exchangeDivergence?.dominantPlayer || 'Balanced'}
                                                </p>
                                                <p className="text-slate-500 text-xs mt-1">
                                                    Whale/Retail Ratio: {marketData.exchangeDivergence?.whaleRetailRatio || 'N/A'}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="h-px bg-slate-800 my-6" />

                                        <div className="grid md:grid-cols-2 gap-6">
                                            <div>
                                                <p className="text-slate-400 text-sm mb-3">Binance Character</p>
                                                <span className="px-3 py-1.5 rounded-full bg-blue-500/20 text-blue-400 text-sm font-medium capitalize">
                                                    {marketData.exchangeDivergence?.binance?.character?.replace(/_/g, ' ') || 'neutral'}
                                                </span>
                                                <p className="text-slate-500 text-xs mt-2">
                                                    Leverage Score: {marketData.exchangeDivergence?.binance?.leverage_score || 'N/A'}
                                                </p>
                                            </div>
                                            <div>
                                                <p className="text-slate-400 text-sm mb-3">Bybit Character</p>
                                                <span className="px-3 py-1.5 rounded-full bg-purple-500/20 text-purple-400 text-sm font-medium capitalize">
                                                    {marketData.exchangeDivergence?.bybit?.character?.replace(/_/g, ' ') || 'neutral'}
                                                </span>
                                                <p className="text-slate-500 text-xs mt-2">
                                                    Conviction: {marketData.exchangeDivergence?.bybit?.conviction || 'N/A'}
                                                </p>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>
                        ) : (
                            <div className="text-center py-12 text-slate-400">No exchange data available</div>
                        )}
                    </TabsContent>

                    {/* ==================== SIGNALS TAB ==================== */}
                    <TabsContent value="signals">
                        {marketData?.finalDecision ? (
                            <div className="grid lg:grid-cols-2 gap-8">
                                <Card className="bg-slate-900/50 border-slate-800 shadow-xl">
                                    <CardHeader>
                                        <CardTitle className="text-white flex items-center gap-2">
                                            <Zap className="w-5 h-5 text-amber-400" />
                                            Signal Components (Weighted)
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <SignalsList signals={marketData.finalDecision.signals} />
                                    </CardContent>
                                </Card>

                                <div className="space-y-6">
                                    <Card className="bg-slate-900/50 border-slate-800 shadow-xl">
                                        <CardHeader>
                                            <CardTitle className="text-white flex items-center gap-2">
                                                <Target className="w-5 h-5 text-emerald-400" />
                                                Decision Reasoning
                                            </CardTitle>
                                        </CardHeader>
                                        <CardContent>
                                            <div className="space-y-3">
                                                {marketData.finalDecision.reasoning?.map((reason, i) => (
                                                    <div key={i} className="flex items-start gap-3 p-3 bg-slate-800/50 rounded-lg">
                                                        <CheckCircle2 className="w-5 h-5 text-emerald-400 mt-0.5 flex-shrink-0" />
                                                        <p className="text-slate-300 text-sm">{reason}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </CardContent>
                                    </Card>

                                    <Card className="bg-slate-900/50 border-slate-800 shadow-xl">
                                        <CardHeader>
                                            <CardTitle className="text-white flex items-center gap-2">
                                                <Activity className="w-5 h-5 text-blue-400" />
                                                OI Analysis
                                            </CardTitle>
                                        </CardHeader>
                                        <CardContent>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <p className="text-slate-400 text-xs">Current OI</p>
                                                    <p className="text-white font-bold">${(marketData.oiAdvanced?.current / 1e9)?.toFixed(2)}B</p>
                                                </div>
                                                <div>
                                                    <p className="text-slate-400 text-xs">24h Change</p>
                                                    <p className={`font-bold ${(marketData.oiAdvanced?.change24h || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                        {marketData.oiAdvanced?.change24h?.toFixed(2) || 0}%
                                                    </p>
                                                </div>
                                                <div>
                                                    <p className="text-slate-400 text-xs">Trend</p>
                                                    <p className="text-white capitalize">{marketData.oiAdvanced?.trend || 'flat'}</p>
                                                </div>
                                                <div>
                                                    <p className="text-slate-400 text-xs">Price Divergence</p>
                                                    <p className={`capitalize ${marketData.oiAdvanced?.priceDivergence?.includes('bullish') ? 'text-emerald-400' :
                                                        marketData.oiAdvanced?.priceDivergence?.includes('bearish') ? 'text-red-400' : 'text-slate-400'
                                                        }`}>
                                                        {marketData.oiAdvanced?.priceDivergence?.replace(/_/g, ' ') || 'aligned'}
                                                    </p>
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                </div>
                            </div>
                        ) : (
                            <div className="text-center py-12 text-slate-400">No signal data available</div>
                        )}
                    </TabsContent>

                    {/* ==================== HISTORY TAB ==================== */}
                    <TabsContent value="history">
                        <div className="space-y-8">
                            {/* Signal History Chart */}
                            <Card className="bg-slate-900/50 border-slate-800 shadow-xl">
                                <CardHeader>
                                    <CardTitle className="text-white flex items-center gap-2">
                                        <LineChart className="w-5 h-5 text-purple-400" />
                                        Signal History (Last 20 fetches)
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="h-64">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <AreaChart data={getSignalHistoryChartData()}>
                                                <defs>
                                                    <linearGradient id="confGradient" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                                                        <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                                                    </linearGradient>
                                                </defs>
                                                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                                                <XAxis dataKey="time" stroke="#64748b" />
                                                <YAxis stroke="#64748b" domain={[0, 10]} />
                                                <Tooltip
                                                    contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                                                    labelStyle={{ color: '#94a3b8' }}
                                                />
                                                <Area
                                                    type="monotone"
                                                    dataKey="confidence"
                                                    stroke="#8b5cf6"
                                                    strokeWidth={2}
                                                    fill="url(#confGradient)"
                                                />
                                            </AreaChart>
                                        </ResponsiveContainer>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Signal History Table */}
                            <Card className="bg-slate-900/50 border-slate-800 shadow-xl">
                                <CardHeader>
                                    <CardTitle className="text-white flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <Clock className="w-5 h-5 text-amber-400" />
                                            Signal Log
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <span className="text-sm text-slate-400 font-normal">{signalHistory.length} signals recorded</span>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={exportSignalHistory}
                                                disabled={signalHistory.length === 0}
                                                className="border-slate-700 text-slate-300 hover:bg-emerald-600 hover:text-white hover:border-emerald-600 disabled:opacity-50"
                                            >
                                                <Download className="w-4 h-4 mr-1" />
                                                Export
                                            </Button>
                                        </div>
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="overflow-x-auto">
                                        <table className="w-full">
                                            <thead>
                                                <tr className="border-b border-slate-800">
                                                    <th className="text-left py-3 px-4 text-slate-400 font-medium">Time</th>
                                                    <th className="text-left py-3 px-4 text-slate-400 font-medium">Bias</th>
                                                    <th className="text-left py-3 px-4 text-slate-400 font-medium">Confidence</th>
                                                    <th className="text-left py-3 px-4 text-slate-400 font-medium">Scenario</th>
                                                    <th className="text-left py-3 px-4 text-slate-400 font-medium">Regime</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {signalHistory.length === 0 ? (
                                                    <tr>
                                                        <td colSpan={5} className="py-8 text-center text-slate-500">
                                                            No signals recorded yet. Fetch data to start recording.
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    signalHistory.map((signal, i) => (
                                                        <motion.tr
                                                            key={i}
                                                            initial={{ opacity: 0, x: -20 }}
                                                            animate={{ opacity: 1, x: 0 }}
                                                            transition={{ delay: i * 0.03 }}
                                                            className="border-b border-slate-800/50 hover:bg-slate-800/30"
                                                        >
                                                            <td className="py-3 px-4 text-slate-400 text-sm">
                                                                {signal.timestamp.toLocaleTimeString()}
                                                            </td>
                                                            <td className="py-3 px-4">
                                                                <BiasIndicator bias={signal.bias} confidence={signal.confidence} size="small" />
                                                            </td>
                                                            <td className="py-3 px-4">
                                                                <div className="flex items-center gap-2">
                                                                    <div className="w-16 h-2 bg-slate-800 rounded-full overflow-hidden">
                                                                        <div
                                                                            className="h-full bg-purple-500 rounded-full"
                                                                            style={{ width: `${signal.confidence * 10}%` }}
                                                                        />
                                                                    </div>
                                                                    <span className="text-white font-medium">{signal.confidence?.toFixed(1)}</span>
                                                                </div>
                                                            </td>
                                                            <td className="py-3 px-4 text-slate-300 text-sm capitalize">
                                                                {signal.scenario?.replace(/_/g, ' ') || 'N/A'}
                                                            </td>
                                                            <td className="py-3 px-4 text-slate-300 text-sm capitalize">
                                                                {signal.regime || 'N/A'}
                                                            </td>
                                                        </motion.tr>
                                                    ))
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    </TabsContent>

                    {/* ==================== RAW DATA TAB ==================== */}
                    <TabsContent value="raw">
                        <div className="space-y-6">
                            <JsonViewer data={marketData?.finalDecision} title="Final Decision" />
                            <JsonViewer data={marketData?.exchangeDivergence} title="Exchange Divergence" />
                            <JsonViewer data={marketData?.marketRegime} title="Market Regime" />
                            <JsonViewer data={marketData?.technical} title="Technical Analysis" />
                            <JsonViewer data={marketData?.fundingAdvanced} title="Funding Advanced" />
                            <JsonViewer data={marketData?.oiAdvanced} title="OI Advanced" />
                            <JsonViewer data={marketData?.raw} title="Raw Exchange Data" />
                        </div>
                    </TabsContent>

                    {/* ==================== DEBUG TAB ==================== */}
                    <TabsContent value="debug">
                        <div className="space-y-6">
                            {/* Performance Summary */}
                            <Card className="bg-slate-900/50 border-slate-800 shadow-xl">
                                <CardHeader>
                                    <CardTitle className="flex items-center justify-between text-white">
                                        <div className="flex items-center gap-2">
                                            <Activity className="w-5 h-5 text-amber-400" />
                                            Performance Metrics
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setDebugLogs([])}
                                            className="text-slate-400 hover:text-white"
                                        >
                                            Clear Logs
                                        </Button>
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                        <div className="p-4 bg-slate-800/50 rounded-xl">
                                            <p className="text-slate-400 text-xs mb-1">Last Fetch Duration</p>
                                            <p className={`text-2xl font-bold ${lastFetchDuration > 30000 ? 'text-red-400' :
                                                lastFetchDuration > 10000 ? 'text-amber-400' : 'text-emerald-400'
                                                }`}>
                                                {lastFetchDuration ? `${(lastFetchDuration / 1000).toFixed(2)}s` : 'N/A'}
                                            </p>
                                        </div>
                                        <div className="p-4 bg-slate-800/50 rounded-xl">
                                            <p className="text-slate-400 text-xs mb-1">Data Status</p>
                                            <p className="text-xl font-bold text-white">
                                                {marketData?.meta?.cached ? '📦 Cached' : '🔴 Live'}
                                            </p>
                                        </div>
                                        <div className="p-4 bg-slate-800/50 rounded-xl">
                                            <p className="text-slate-400 text-xs mb-1">State ID</p>
                                            <p className="text-sm font-mono text-slate-300 truncate">
                                                {marketData?.meta?.stateId || 'N/A'}
                                            </p>
                                        </div>
                                        <div className="p-4 bg-slate-800/50 rounded-xl">
                                            <p className="text-slate-400 text-xs mb-1">Alerts Generated</p>
                                            <p className="text-xl font-bold text-purple-400">
                                                {marketData?.alerts?.length || 0}
                                            </p>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Timeframe Weights & Contributions */}
                            <Card className="bg-slate-900/50 border-slate-800 shadow-xl">
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2 text-white">
                                        <Clock className="w-5 h-5 text-blue-400" />
                                        Timeframe Analysis Breakdown
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-4">
                                        <p className="text-slate-400 text-sm">
                                            Current timeframe weights: 30m (25%), 1h (25%), 4h (30%), 1d (20%)
                                        </p>
                                        <div className="grid grid-cols-4 gap-4">
                                            {['30m', '1h', '4h', '1d'].map((tf, idx) => {
                                                const weight = [25, 25, 30, 20][idx];
                                                const tfData = marketData?.timeframes?.[tf] || marketData?.raw?.binance?.[tf];
                                                return (
                                                    <div key={tf} className="p-4 bg-slate-800/50 rounded-xl border border-slate-700/50">
                                                        <div className="flex items-center justify-between mb-2">
                                                            <span className="text-white font-bold">{tf}</span>
                                                            <span className="text-sm text-blue-400">{weight}%</span>
                                                        </div>
                                                        <div className="h-2 bg-slate-700 rounded-full mb-2">
                                                            <div
                                                                className="h-full bg-blue-500 rounded-full"
                                                                style={{ width: `${weight}%` }}
                                                            />
                                                        </div>
                                                        {tfData && (
                                                            <div className="text-xs text-slate-400 space-y-1">
                                                                <p>Price: ${tfData.price?.toLocaleString() || 'N/A'}</p>
                                                                <p>OI Δ: {tfData.oi_change?.toFixed(2) || 'N/A'}%</p>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Pipeline Status */}
                            <Card className="bg-slate-900/50 border-slate-800 shadow-xl">
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2 text-white">
                                        <Zap className="w-5 h-5 text-purple-400" />
                                        Analysis Pipeline Status
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="flex items-center gap-2 flex-wrap">
                                        {[
                                            { name: 'Data Fetch', done: !!marketData },
                                            { name: 'Exchange Analysis', done: !!marketData?.exchangeDivergence },
                                            { name: 'Regime Detection', done: !!marketData?.marketRegime },
                                            { name: 'Technical Metrics', done: !!marketData?.technical },
                                            { name: 'Funding Analysis', done: !!marketData?.fundingAdvanced },
                                            { name: 'Final Decision', done: !!marketData?.finalDecision },
                                            { name: 'Alerts Check', done: marketData?.alerts !== undefined },
                                        ].map((step, i) => (
                                            <div
                                                key={i}
                                                className={`flex items-center gap-2 px-3 py-2 rounded-lg ${step.done ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-500'
                                                    }`}
                                            >
                                                {step.done ? <CheckCircle2 className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
                                                <span className="text-sm">{step.name}</span>
                                            </div>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Debug Console */}
                            <Card className="bg-slate-900/50 border-slate-800 shadow-xl">
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2 text-white">
                                        <Database className="w-5 h-5 text-green-400" />
                                        Debug Console ({debugLogs.length} entries)
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="bg-slate-950 rounded-xl p-4 max-h-96 overflow-auto font-mono text-sm">
                                        {debugLogs.length === 0 ? (
                                            <p className="text-slate-500">No logs yet. Click "Refresh Data" to see debug output.</p>
                                        ) : (
                                            debugLogs.map((log) => (
                                                <div key={log.id} className="py-1 border-b border-slate-800/50 last:border-0">
                                                    <span className="text-slate-500">
                                                        [{log.timestamp.toLocaleTimeString()}]
                                                    </span>
                                                    <span className={`ml-2 px-1.5 py-0.5 rounded text-xs font-bold ${log.category === 'ERROR' ? 'bg-red-500/20 text-red-400' :
                                                        log.category === 'FETCH' ? 'bg-blue-500/20 text-blue-400' :
                                                            log.category === 'API' ? 'bg-purple-500/20 text-purple-400' :
                                                                log.category === 'DATA' ? 'bg-emerald-500/20 text-emerald-400' :
                                                                    log.category === 'COMPLETE' ? 'bg-green-500/20 text-green-400' :
                                                                        'bg-slate-600/20 text-slate-400'
                                                        }`}>
                                                        {log.category}
                                                    </span>
                                                    <span className="ml-2 text-slate-300">{log.message}</span>
                                                    {log.data && (
                                                        <pre className="mt-1 ml-4 text-xs text-slate-500 overflow-auto">
                                                            {JSON.stringify(log.data, null, 2)}
                                                        </pre>
                                                    )}
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Current Market State Summary */}
                            <Card className="bg-slate-900/50 border-slate-800 shadow-xl">
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2 text-white">
                                        <Target className="w-5 h-5 text-cyan-400" />
                                        Current Analysis Summary
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
                                        <div className="p-3 bg-slate-800/50 rounded-xl">
                                            <p className="text-slate-400 text-xs mb-1">Bias</p>
                                            <p className={`text-lg font-bold ${marketData?.finalDecision?.bias?.includes('LONG') ? 'text-emerald-400' :
                                                marketData?.finalDecision?.bias?.includes('SHORT') ? 'text-red-400' :
                                                    'text-amber-400'
                                                }`}>
                                                {marketData?.finalDecision?.bias || 'N/A'}
                                            </p>
                                        </div>
                                        <div className="p-3 bg-slate-800/50 rounded-xl">
                                            <p className="text-slate-400 text-xs mb-1">Confidence</p>
                                            <p className="text-lg font-bold text-white">
                                                {marketData?.finalDecision?.confidence?.toFixed(1) || 'N/A'}/10
                                            </p>
                                        </div>
                                        <div className="p-3 bg-slate-800/50 rounded-xl">
                                            <p className="text-slate-400 text-xs mb-1">Trade Stance</p>
                                            <p className="text-sm font-bold text-purple-400">
                                                {marketData?.finalDecision?.tradeStance?.replace(/_/g, ' ') || 'N/A'}
                                            </p>
                                        </div>
                                        <div className="p-3 bg-slate-800/50 rounded-xl">
                                            <p className="text-slate-400 text-xs mb-1">Regime</p>
                                            <p className="text-sm font-bold text-blue-400 capitalize">
                                                {marketData?.marketRegime?.regime || 'N/A'}
                                            </p>
                                        </div>
                                        <div className="p-3 bg-slate-800/50 rounded-xl">
                                            <p className="text-slate-400 text-xs mb-1">Risk Mode</p>
                                            <p className={`text-sm font-bold ${marketData?.finalDecision?.riskMode === 'DEFENSIVE' ? 'text-amber-400' :
                                                marketData?.finalDecision?.riskMode === 'AGGRESSIVE' ? 'text-red-400' :
                                                    'text-emerald-400'
                                                }`}>
                                                {marketData?.finalDecision?.riskMode || 'N/A'}
                                            </p>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    </TabsContent>
                </Tabs>
            </div>

            {/* Footer */}
            <div className="border-t border-slate-800/50 mt-16">
                <div className="max-w-7xl mx-auto px-6 py-8">
                    <p className="text-center text-slate-500 text-sm">
                        ⚠️ For educational purposes only. Not financial advice. Trading involves significant risk.
                    </p>
                </div>
            </div>
        </div>
    );
}
