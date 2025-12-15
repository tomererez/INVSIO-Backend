import React, { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import {
    Activity,
    RefreshCw,
    Database,
    AlertTriangle,
    CheckCircle2,
    Clock,
    Zap,
    Server,
    Trash2,
    Loader2,
    TrendingUp,
    TrendingDown,
    Minus,
    Bell,
    Brain,
    Settings,
    Wifi,
    WifiOff,
    ChevronDown,
    ChevronUp,
    Cpu
} from "lucide-react";

// ==================== Debug Dashboard ====================
export default function DebugDashboard() {
    const [status, setStatus] = useState(null);
    const [dbStats, setDbStats] = useState(null);
    const [alertStats, setAlertStats] = useState(null);
    const [llmStats, setLlmStats] = useState(null);
    const [config, setConfig] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [lastUpdate, setLastUpdate] = useState(null);
    const [error, setError] = useState(null);

    // Collapsible sections
    const [expandedSections, setExpandedSections] = useState({
        timeframes: false,
        macroAnchoring: false,
        exchanges: false,
        cooldowns: true,
        thresholds: false,
        apiLimits: false
    });

    const toggleSection = (section) => {
        setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
    };

    // Fetch all debug data
    const fetchDebugData = useCallback(async () => {
        setIsLoading(true);
        setError(null);

        try {
            const [statusRes, dbRes, alertRes, llmRes, configRes] = await Promise.all([
                fetch('/api/ai-market-analyzer/debug/status'),
                fetch('/api/ai-market-analyzer/debug/db-stats'),
                fetch('/api/ai-market-analyzer/debug/alert-stats'),
                fetch('/api/ai-market-analyzer/debug/llm-stats'),
                fetch('/api/ai-market-analyzer/debug/config')
            ]);

            const statusData = await statusRes.json();
            const dbData = await dbRes.json();
            const alertData = await alertRes.json();
            const llmData = await llmRes.json();
            const configData = await configRes.json();

            if (statusData.success) setStatus(statusData.data);
            if (dbData.success) setDbStats(dbData.data);
            if (alertData.success) setAlertStats(alertData.data);
            if (llmData.success) setLlmStats(llmData.data);
            if (configData.success) setConfig(configData.data);

            setLastUpdate(new Date());
        } catch (err) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    }, []);

    // Auto-refresh every 30 seconds
    useEffect(() => {
        fetchDebugData();
        const interval = setInterval(fetchDebugData, 30000);
        return () => clearInterval(interval);
    }, [fetchDebugData]);

    // Force refresh handler
    const handleForceRefresh = async () => {
        setIsRefreshing(true);
        try {
            const res = await fetch('/api/ai-market-analyzer/debug/force-refresh', {
                method: 'POST'
            });
            const data = await res.json();
            if (data.success) {
                await fetchDebugData();
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setIsRefreshing(false);
        }
    };

    // Clear cache handler
    const handleClearCache = async () => {
        try {
            await fetch('/api/ai-market-analyzer/clear-cache', { method: 'POST' });
            await fetchDebugData();
        } catch (err) {
            setError(err.message);
        }
    };

    // Clear alerts handler
    const handleClearAlerts = async () => {
        try {
            await fetch('/api/ai-market-analyzer/clear-alerts', { method: 'POST' });
            await fetchDebugData();
        } catch (err) {
            setError(err.message);
        }
    };

    // Bias color helper
    const getBiasColor = (bias) => {
        if (!bias) return 'text-slate-400';
        if (bias.includes('LONG')) return 'text-emerald-400';
        if (bias.includes('SHORT')) return 'text-red-400';
        return 'text-amber-400';
    };

    // Collapsible Section Component
    const CollapsibleSection = ({ title, sectionKey, children }) => (
        <div className="border-t border-slate-700/50 pt-3 mt-3">
            <button
                onClick={() => toggleSection(sectionKey)}
                className="flex items-center justify-between w-full text-left"
            >
                <span className="text-slate-300 font-medium text-sm">{title}</span>
                {expandedSections[sectionKey] ? (
                    <ChevronUp className="w-4 h-4 text-slate-400" />
                ) : (
                    <ChevronDown className="w-4 h-4 text-slate-400" />
                )}
            </button>
            {expandedSections[sectionKey] && (
                <div className="mt-3 space-y-2">
                    {children}
                </div>
            )}
        </div>
    );

    if (isLoading && !status) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white p-6">
            {/* Header */}
            <div className="max-w-7xl mx-auto mb-8">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-pink-500 bg-clip-text text-transparent">
                            Debug Dashboard
                        </h1>
                        <p className="text-slate-400 mt-1">
                            AI Market Analyzer System Status
                        </p>
                    </div>
                    <div className="flex items-center gap-4">
                        <span className="text-sm text-slate-500">
                            Last update: {lastUpdate?.toLocaleTimeString() || 'N/A'}
                        </span>
                        <Button
                            onClick={handleForceRefresh}
                            disabled={isRefreshing}
                            className="bg-purple-600 hover:bg-purple-700"
                        >
                            {isRefreshing ? (
                                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                            ) : (
                                <RefreshCw className="w-4 h-4 mr-2" />
                            )}
                            Force Refresh
                        </Button>
                    </div>
                </div>
            </div>

            {/* Error Display */}
            {error && (
                <div className="max-w-7xl mx-auto mb-6">
                    <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-3">
                        <AlertTriangle className="w-5 h-5 text-red-400" />
                        <span className="text-red-400">{error}</span>
                    </div>
                </div>
            )}

            <div className="max-w-7xl mx-auto space-y-6">
                {/* Current State Card */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                >
                    <Card className="bg-slate-900/50 border-slate-800 shadow-xl">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-white">
                                <Activity className="w-5 h-5 text-purple-400" />
                                Current Market State
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {status?.currentState ? (
                                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                                    <div className="p-4 bg-slate-800/50 rounded-xl text-center">
                                        <p className="text-slate-400 text-xs mb-1">Bias</p>
                                        <p className={`text-2xl font-bold ${getBiasColor(status.currentState.bias)}`}>
                                            {status.currentState.bias === 'LONG' && <TrendingUp className="inline w-6 h-6 mr-1" />}
                                            {status.currentState.bias === 'SHORT' && <TrendingDown className="inline w-6 h-6 mr-1" />}
                                            {status.currentState.bias === 'WAIT' && <Minus className="inline w-6 h-6 mr-1" />}
                                            {status.currentState.bias || 'N/A'}
                                        </p>
                                    </div>
                                    <div className="p-4 bg-slate-800/50 rounded-xl text-center">
                                        <p className="text-slate-400 text-xs mb-1">Confidence</p>
                                        <p className="text-2xl font-bold text-white">
                                            {status.currentState.confidence?.toFixed(1) || 'N/A'}/10
                                        </p>
                                    </div>
                                    <div className="p-4 bg-slate-800/50 rounded-xl text-center">
                                        <p className="text-slate-400 text-xs mb-1">Trade Stance</p>
                                        <p className="text-sm font-bold text-purple-400">
                                            {status.currentState.tradeStance?.replace(/_/g, ' ') || 'N/A'}
                                        </p>
                                    </div>
                                    <div className="p-4 bg-slate-800/50 rounded-xl text-center">
                                        <p className="text-slate-400 text-xs mb-1">Regime</p>
                                        <p className="text-sm font-bold text-blue-400 capitalize">
                                            {status.currentState.regime || 'N/A'}
                                        </p>
                                    </div>
                                    <div className="p-4 bg-slate-800/50 rounded-xl text-center">
                                        <p className="text-slate-400 text-xs mb-1">Risk Mode</p>
                                        <p className={`text-sm font-bold ${status.currentState.riskMode === 'DEFENSIVE' ? 'text-amber-400' :
                                                status.currentState.riskMode === 'AGGRESSIVE' ? 'text-red-400' :
                                                    'text-emerald-400'
                                            }`}>
                                            {status.currentState.riskMode || 'N/A'}
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <p className="text-slate-500">No data available</p>
                            )}

                            {/* Macro Override Warning */}
                            {status?.currentState?.macroOverride?.triggered && (
                                <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-center gap-2">
                                    <AlertTriangle className="w-5 h-5 text-amber-400" />
                                    <span className="text-amber-400 text-sm">
                                        {status.currentState.macroOverride.reason}
                                    </span>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </motion.div>

                {/* Stats Grid - Row 1 */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Server Status */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                    >
                        <Card className="bg-slate-900/50 border-slate-800 shadow-xl h-full">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-white text-lg">
                                    <Server className="w-5 h-5 text-green-400" />
                                    Server Status
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <div className="flex justify-between">
                                    <span className="text-slate-400">Uptime</span>
                                    <span className="text-white font-mono">
                                        {status?.server?.uptime
                                            ? `${Math.floor(status.server.uptime / 3600)}h ${Math.floor((status.server.uptime % 3600) / 60)}m`
                                            : 'N/A'}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-400">Memory (Heap)</span>
                                    <span className="text-white font-mono">
                                        {status?.server?.memory?.heapUsed
                                            ? `${Math.round(status.server.memory.heapUsed / 1048576)}MB`
                                            : 'N/A'}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-400">Environment</span>
                                    <span className="text-white font-mono">
                                        {status?.server?.environment || 'N/A'}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-400">Response Time</span>
                                    <span className="text-emerald-400 font-mono">
                                        {status?.responseTime || 'N/A'}
                                    </span>
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>

                    {/* API Health Card - NEW */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.15 }}
                    >
                        <Card className="bg-slate-900/50 border-slate-800 shadow-xl h-full">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-white text-lg">
                                    <Wifi className="w-5 h-5 text-cyan-400" />
                                    API Health
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <div className="flex justify-between items-center">
                                    <span className="text-slate-400">Coinglass API</span>
                                    <span className="flex items-center gap-2">
                                        {status?.currentState ? (
                                            <>
                                                <Wifi className="w-4 h-4 text-emerald-400" />
                                                <span className="text-emerald-400 font-mono">Connected</span>
                                            </>
                                        ) : (
                                            <>
                                                <WifiOff className="w-4 h-4 text-red-400" />
                                                <span className="text-red-400 font-mono">Error</span>
                                            </>
                                        )}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-400">Last API Call</span>
                                    <span className="text-white font-mono">
                                        {status?.currentState?.timestamp
                                            ? new Date(status.currentState.timestamp).toLocaleTimeString()
                                            : 'N/A'}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-400">Cache Status</span>
                                    <span className={`font-mono ${status?.currentState?.cached ? 'text-amber-400' : 'text-emerald-400'}`}>
                                        {status?.currentState?.cached ? 'Cached' : 'Live'}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-slate-400">Data Freshness</span>
                                    <span className="text-emerald-400 font-mono flex items-center gap-1">
                                        <CheckCircle2 className="w-4 h-4" />
                                        Fresh
                                    </span>
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>

                    {/* Database Stats */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                    >
                        <Card className="bg-slate-900/50 border-slate-800 shadow-xl h-full">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-white text-lg">
                                    <Database className="w-5 h-5 text-blue-400" />
                                    Database Stats
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <div className="flex justify-between">
                                    <span className="text-slate-400">Total States</span>
                                    <span className="text-white font-mono">
                                        {dbStats?.totalStates ?? status?.database?.totalStates ?? 'N/A'}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-400">Total Alerts</span>
                                    <span className="text-white font-mono">
                                        {dbStats?.totalAlerts ?? status?.database?.totalAlerts ?? 'N/A'}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-400">Daily Summaries</span>
                                    <span className="text-white font-mono">
                                        {dbStats?.totalSummaries ?? status?.database?.totalSummaries ?? 'N/A'}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-400">DB Size</span>
                                    <span className="text-white font-mono">
                                        {dbStats?.dbSizeMB ?? status?.database?.dbSizeMB ?? 'N/A'} MB
                                    </span>
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>
                </div>

                {/* Stats Grid - Row 2 */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Alert Stats */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.25 }}
                    >
                        <Card className="bg-slate-900/50 border-slate-800 shadow-xl h-full">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-white text-lg">
                                    <Bell className="w-5 h-5 text-amber-400" />
                                    Alert System
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <div className="flex justify-between items-center">
                                    <span className="text-slate-400">Previous State</span>
                                    <span className={`font-mono ${alertStats?.previousStateExists || status?.alerts?.previousStateExists
                                            ? 'text-emerald-400' : 'text-red-400'
                                        }`}>
                                        {(alertStats?.previousStateExists || status?.alerts?.previousStateExists)
                                            ? <CheckCircle2 className="inline w-4 h-4" />
                                            : 'None'}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-400">Bias History</span>
                                    <span className="text-white font-mono">
                                        {alertStats?.biasHistoryLength ?? status?.alerts?.biasHistoryLength ?? 0} entries
                                    </span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-slate-400">Oscillating</span>
                                    <span className={`font-mono ${alertStats?.isOscillating || status?.alerts?.isOscillating
                                            ? 'text-amber-400' : 'text-slate-500'
                                        }`}>
                                        {(alertStats?.isOscillating || status?.alerts?.isOscillating) ? 'Yes' : 'No'}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-400">Active Cooldowns</span>
                                    <span className="text-white font-mono">
                                        {(alertStats?.activeCooldowns || status?.alerts?.activeCooldowns)?.length ?? 0}
                                    </span>
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>

                    {/* LLM Stats Card - NEW */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                    >
                        <Card className="bg-slate-900/50 border-slate-800 shadow-xl h-full">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-white text-lg">
                                    <Brain className="w-5 h-5 text-pink-400" />
                                    LLM Stats
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <div className="flex justify-between">
                                    <span className="text-slate-400">Model</span>
                                    <span className="text-white font-mono text-xs">
                                        {llmStats?.config?.model?.split('-').slice(0, 2).join('-') || 'N/A'}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-400">Cache Size</span>
                                    <span className="text-white font-mono">
                                        {llmStats?.cacheSize ?? 0} entries
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-400">Cache TTL</span>
                                    <span className="text-white font-mono">
                                        {llmStats?.config?.cacheTtlMinutes ?? 5} min
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-400">Timeout</span>
                                    <span className="text-white font-mono">
                                        {llmStats?.config?.timeoutSeconds ?? 60}s
                                    </span>
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>

                    {/* System Configuration Card - NEW */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.35 }}
                    >
                        <Card className="bg-slate-900/50 border-slate-800 shadow-xl h-full">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-white text-lg">
                                    <Settings className="w-5 h-5 text-slate-400" />
                                    System Config
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-1">
                                {/* Timeframe Weights */}
                                <CollapsibleSection title="Timeframe Weights" sectionKey="timeframes">
                                    {config?.timeframeWeights && Object.entries(config.timeframeWeights)
                                        .filter(([k]) => k !== 'description')
                                        .map(([tf, weight]) => (
                                            <div key={tf} className="flex justify-between text-sm">
                                                <span className="text-slate-400">{tf}</span>
                                                <span className="text-white font-mono">{weight}</span>
                                            </div>
                                        ))}
                                </CollapsibleSection>

                                {/* Macro Anchoring */}
                                <CollapsibleSection title="Macro Anchoring" sectionKey="macroAnchoring">
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-400">Enabled</span>
                                        <span className="text-emerald-400 font-mono">
                                            {config?.macroAnchoring?.enabled ? 'Yes' : 'No'}
                                        </span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-400">Threshold</span>
                                        <span className="text-white font-mono">
                                            {config?.macroAnchoring?.consensusThreshold ?? 6}
                                        </span>
                                    </div>
                                </CollapsibleSection>

                                {/* Alert Cooldowns */}
                                <CollapsibleSection title="Alert Cooldowns" sectionKey="cooldowns">
                                    {config?.alertCooldowns && Object.entries(config.alertCooldowns).map(([type, duration]) => (
                                        <div key={type} className="flex justify-between text-sm">
                                            <span className="text-slate-400 text-xs">{type.replace(/_/g, ' ')}</span>
                                            <span className="text-white font-mono text-xs">{duration}</span>
                                        </div>
                                    ))}
                                </CollapsibleSection>

                                {/* Thresholds */}
                                <CollapsibleSection title="Thresholds" sectionKey="thresholds">
                                    {config?.thresholds && Object.entries(config.thresholds).map(([key, value]) => (
                                        <div key={key} className="flex justify-between text-sm">
                                            <span className="text-slate-400 text-xs">{key}</span>
                                            <span className="text-white font-mono text-xs">{value}</span>
                                        </div>
                                    ))}
                                </CollapsibleSection>
                            </CardContent>
                        </Card>
                    </motion.div>
                </div>

                {/* Active Cooldowns */}
                {(alertStats?.activeCooldowns?.length > 0 || status?.alerts?.activeCooldowns?.length > 0) && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.4 }}
                    >
                        <Card className="bg-slate-900/50 border-slate-800 shadow-xl">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-white">
                                    <Clock className="w-5 h-5 text-orange-400" />
                                    Active Alert Cooldowns
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="flex flex-wrap gap-3">
                                    {(alertStats?.activeCooldowns || status?.alerts?.activeCooldowns || []).map((cd, i) => (
                                        <div
                                            key={i}
                                            className="px-3 py-2 bg-slate-800/50 rounded-lg flex items-center gap-2"
                                        >
                                            <Clock className="w-4 h-4 text-orange-400" />
                                            <span className="text-white font-medium">{cd.category}</span>
                                            <span className="text-slate-400 text-sm">
                                                {Math.round(cd.expiresIn / 60000)}m remaining
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>
                )}

                {/* LLM Cache Entries */}
                {llmStats?.entries?.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.45 }}
                    >
                        <Card className="bg-slate-900/50 border-slate-800 shadow-xl">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-white">
                                    <Cpu className="w-5 h-5 text-pink-400" />
                                    LLM Cache Entries
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="flex flex-wrap gap-3">
                                    {llmStats.entries.map((entry, i) => (
                                        <div
                                            key={i}
                                            className={`px-3 py-2 rounded-lg flex items-center gap-2 ${entry.valid ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-slate-800/50'
                                                }`}
                                        >
                                            <span className="text-white font-mono text-xs">{entry.key}</span>
                                            <span className={`text-sm ${entry.valid ? 'text-emerald-400' : 'text-slate-500'}`}>
                                                {entry.ageFormatted}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>
                )}

                {/* Action Buttons */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                >
                    <Card className="bg-slate-900/50 border-slate-800 shadow-xl">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-white">
                                <Zap className="w-5 h-5 text-yellow-400" />
                                Debug Actions
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="flex flex-wrap gap-4">
                                <Button
                                    onClick={handleClearCache}
                                    variant="outline"
                                    className="border-slate-700 hover:bg-slate-800"
                                >
                                    <Trash2 className="w-4 h-4 mr-2" />
                                    Clear Cache
                                </Button>
                                <Button
                                    onClick={handleClearAlerts}
                                    variant="outline"
                                    className="border-slate-700 hover:bg-slate-800"
                                >
                                    <Bell className="w-4 h-4 mr-2" />
                                    Clear Alert Cooldowns
                                </Button>
                                <Button
                                    onClick={fetchDebugData}
                                    variant="outline"
                                    className="border-slate-700 hover:bg-slate-800"
                                >
                                    <RefreshCw className="w-4 h-4 mr-2" />
                                    Refresh Stats
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>
            </div>

            {/* Footer */}
            <div className="max-w-7xl mx-auto mt-8 text-center">
                <p className="text-slate-500 text-sm">
                    Auto-refresh: 30 seconds • State ID: {status?.currentState?.stateId || 'N/A'}
                </p>
            </div>
        </div>
    );
}
