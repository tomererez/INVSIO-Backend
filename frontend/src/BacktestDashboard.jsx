import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { motion, AnimatePresence } from "framer-motion";
import {
    TrendingUp,
    TrendingDown,
    DollarSign,
    Target,
    Activity,
    Play,
    Settings,
    BarChart3,
    PieChart,
    Clock,
    Percent,
    Shield,
    Zap,
    RefreshCw,
    Download,
    ChevronDown,
    ChevronUp,
    AlertTriangle,
    CheckCircle2,
    XCircle,
    Loader2
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, PieChart as RechartsPie, Pie, Cell } from 'recharts';

export default function BacktestDashboard() {
    const [theme] = useState('dark');
    const isDark = theme === 'dark';

    // Backtest Parameters
    const [params, setParams] = useState({
        symbol: 'BTCUSDT',
        interval: '4h',
        days: 60,
        initialCapital: 10000,
        leverage: 2,
        stopLossPercent: 2,
        takeProfitPercent: 4,
        minConfidence: 7,
        positionSizePercent: 10
    });

    // State
    const [isRunning, setIsRunning] = useState(false);
    const [results, setResults] = useState(null);
    const [error, setError] = useState(null);
    const [progress, setProgress] = useState(0);
    const [activeTab, setActiveTab] = useState('parameters');
    const [isDemo, setIsDemo] = useState(false);

    // Run backtest
    const runBacktest = async () => {
        setIsRunning(true);
        setError(null);
        setProgress(0);

        try {
            // Simulate progress for UX
            const progressInterval = setInterval(() => {
                setProgress(p => Math.min(p + 5, 90));
            }, 300);

            const response = await fetch('/api/backtest/run', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(params)
            });

            clearInterval(progressInterval);
            setProgress(100);

            const data = await response.json();

            if (data.success || data.stats) {
                setResults(data);
                setIsDemo(!!data.demo);
                setActiveTab('results');
            } else {
                throw new Error(data.error || 'Backtest failed');
            }

        } catch (err) {
            setError(err.message);
            console.error('Backtest error:', err);
        } finally {
            setIsRunning(false);
        }
    };

    // Demo results for UI development
    const demoResults = {
        stats: {
            totalReturn: 9.68,
            finalCapital: 10967.51,
            maxDrawdown: 4.94,
            totalTrades: 96,
            winRate: 47.92,
            winningTrades: 46,
            losingTrades: 50,
            avgWin: 3.54,
            avgLoss: 2.31,
            profitFactor: 1.53,
            sharpeRatio: 1.42
        },
        signalDistribution: { LONG: 33, SHORT: 121, WAIT: 156 },
        scenarioDistribution: {
            unclear: 152,
            bybit_leading: 69,
            synchronized_bearish: 36,
            whale_distribution: 22,
            whale_accumulation: 11,
            retail_fomo_rally: 11,
            binance_noise: 8,
            whale_hedging: 1
        },
        regimeDistribution: {
            unclear: 248,
            distribution: 22,
            trap: 15,
            accumulation: 11,
            covering: 8,
            trending: 6
        },
        trades: [
            { direction: 'SHORT', entryPrice: 86947, exitPrice: 87089, pnlPercent: -0.33, reason: 'signal_reversal' },
            { direction: 'LONG', entryPrice: 87089, exitPrice: 87896, pnlPercent: 1.85, reason: 'signal_reversal' },
            { direction: 'SHORT', entryPrice: 87896, exitPrice: 87050, pnlPercent: 1.93, reason: 'signal_reversal' },
            { direction: 'LONG', entryPrice: 87050, exitPrice: 87075, pnlPercent: 0.06, reason: 'signal_reversal' },
            { direction: 'SHORT', entryPrice: 87075, exitPrice: 87075, pnlPercent: 0, reason: 'end_of_backtest' }
        ],
        equityCurve: Array.from({ length: 50 }, (_, i) => ({
            time: i,
            equity: 10000 + (Math.random() - 0.3) * 500 * (i / 10)
        }))
    };

    // Use results if available, otherwise show placeholder
    const displayResults = results || demoResults;
    const hasRealResults = results !== null;

    const COLORS = ['#10b981', '#ef4444', '#6b7280'];
    const SCENARIO_COLORS = ['#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e', '#f97316', '#eab308'];

    return (
        <div className={`min-h-screen ${isDark ? 'bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950' : 'bg-gray-50'}`}>
            {/* Header */}
            <div className="border-b border-slate-800/50 backdrop-blur-sm sticky top-0 z-40">
                <div className="max-w-7xl mx-auto px-6 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                                <BarChart3 className="w-6 h-6 text-white" />
                            </div>
                            <div>
                                <h1 className="text-2xl font-bold text-white">Backtest Lab</h1>
                                <p className="text-slate-400 text-sm">Test your strategy with historical data</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-4">
                            {/* Demo Mode Indicator */}
                            {(isDemo || !hasRealResults) && (
                                <span className="px-3 py-1.5 rounded-full bg-amber-500/20 text-amber-400 text-sm font-medium">
                                    📊 Demo Mode
                                </span>
                            )}

                            {/* Error Display */}
                            {error && (
                                <span className="px-3 py-1.5 rounded-full bg-red-500/20 text-red-400 text-sm">
                                    ⚠️ {error}
                                </span>
                            )}

                            <Button
                                onClick={runBacktest}
                                disabled={isRunning}
                                size="lg"
                                className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white hover:from-emerald-700 hover:to-teal-700 shadow-lg shadow-emerald-500/20 gap-2"
                            >
                                {isRunning ? (
                                    <>
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                        Running... {progress}%
                                    </>
                                ) : (
                                    <>
                                        <Play className="w-5 h-5" />
                                        Run Backtest
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-6 py-8">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-8">
                    <TabsList className={`${isDark ? 'bg-slate-800/50' : 'bg-gray-200'} p-1 rounded-xl`}>
                        <TabsTrigger value="parameters" className="rounded-lg px-6 py-2.5 data-[state=active]:bg-emerald-600 data-[state=active]:text-white">
                            <Settings className="w-4 h-4 mr-2" />
                            Parameters
                        </TabsTrigger>
                        <TabsTrigger value="results" className="rounded-lg px-6 py-2.5 data-[state=active]:bg-emerald-600 data-[state=active]:text-white">
                            <BarChart3 className="w-4 h-4 mr-2" />
                            Results
                        </TabsTrigger>
                        <TabsTrigger value="analysis" className="rounded-lg px-6 py-2.5 data-[state=active]:bg-emerald-600 data-[state=active]:text-white">
                            <PieChart className="w-4 h-4 mr-2" />
                            Analysis
                        </TabsTrigger>
                        <TabsTrigger value="trades" className="rounded-lg px-6 py-2.5 data-[state=active]:bg-emerald-600 data-[state=active]:text-white">
                            <Activity className="w-4 h-4 mr-2" />
                            Trades
                        </TabsTrigger>
                    </TabsList>

                    {/* PARAMETERS TAB */}
                    <TabsContent value="parameters">
                        <div className="grid lg:grid-cols-2 gap-8">
                            {/* Data Settings */}
                            <Card className={`${isDark ? 'bg-slate-900/50 border-slate-800' : 'bg-white border-gray-200'} shadow-xl`}>
                                <CardHeader>
                                    <CardTitle className={`flex items-center gap-3 text-xl ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                        <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                                            <Clock className="w-5 h-5 text-blue-400" />
                                        </div>
                                        Data Settings
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-6">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <Label className={`font-bold ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>Symbol</Label>
                                            <Input
                                                value={params.symbol}
                                                onChange={(e) => setParams({ ...params, symbol: e.target.value })}
                                                className={`mt-2 h-12 ${isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-gray-300'}`}
                                            />
                                        </div>
                                        <div>
                                            <Label className={`font-bold ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>Interval</Label>
                                            <select
                                                value={params.interval}
                                                onChange={(e) => setParams({ ...params, interval: e.target.value })}
                                                className={`mt-2 h-12 w-full rounded-md px-3 ${isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-gray-300'} border`}
                                            >
                                                <option value="1h">1 Hour</option>
                                                <option value="4h">4 Hours</option>
                                                <option value="1d">1 Day</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div>
                                        <Label className={`font-bold ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>Historical Days</Label>
                                        <Input
                                            type="number"
                                            value={params.days}
                                            onChange={(e) => setParams({ ...params, days: parseInt(e.target.value) })}
                                            className={`mt-2 h-12 ${isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-gray-300'}`}
                                        />
                                        <p className="text-sm text-slate-500 mt-2">Max 500 candles due to API limits</p>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Capital & Position */}
                            <Card className={`${isDark ? 'bg-slate-900/50 border-slate-800' : 'bg-white border-gray-200'} shadow-xl`}>
                                <CardHeader>
                                    <CardTitle className={`flex items-center gap-3 text-xl ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                                            <DollarSign className="w-5 h-5 text-emerald-400" />
                                        </div>
                                        Capital & Position
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-6">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <Label className={`font-bold ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>Initial Capital ($)</Label>
                                            <Input
                                                type="number"
                                                value={params.initialCapital}
                                                onChange={(e) => setParams({ ...params, initialCapital: parseInt(e.target.value) })}
                                                className={`mt-2 h-12 ${isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-gray-300'}`}
                                            />
                                        </div>
                                        <div>
                                            <Label className={`font-bold ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>Leverage</Label>
                                            <Input
                                                type="number"
                                                value={params.leverage}
                                                onChange={(e) => setParams({ ...params, leverage: parseInt(e.target.value) })}
                                                className={`mt-2 h-12 ${isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-gray-300'}`}
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <Label className={`font-bold ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>Position Size (%)</Label>
                                        <Input
                                            type="number"
                                            value={params.positionSizePercent}
                                            onChange={(e) => setParams({ ...params, positionSizePercent: parseInt(e.target.value) })}
                                            className={`mt-2 h-12 ${isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-gray-300'}`}
                                        />
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Risk Management */}
                            <Card className={`${isDark ? 'bg-slate-900/50 border-slate-800' : 'bg-white border-gray-200'} shadow-xl lg:col-span-2`}>
                                <CardHeader>
                                    <CardTitle className={`flex items-center gap-3 text-xl ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                        <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center">
                                            <Shield className="w-5 h-5 text-red-400" />
                                        </div>
                                        Risk / Reward Settings
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="grid md:grid-cols-3 gap-6">
                                        <div>
                                            <Label className={`font-bold ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>
                                                Stop Loss (%)
                                            </Label>
                                            <div className="mt-2 space-y-3">
                                                <Input
                                                    type="number"
                                                    step="0.5"
                                                    value={params.stopLossPercent}
                                                    onChange={(e) => setParams({ ...params, stopLossPercent: parseFloat(e.target.value) })}
                                                    className={`h-12 ${isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-gray-300'}`}
                                                />
                                                <input
                                                    type="range"
                                                    min="0.5"
                                                    max="10"
                                                    step="0.5"
                                                    value={params.stopLossPercent}
                                                    onChange={(e) => setParams({ ...params, stopLossPercent: parseFloat(e.target.value) })}
                                                    className="w-full accent-red-500"
                                                />
                                                <div className="flex justify-between text-xs text-slate-500">
                                                    <span>0.5%</span>
                                                    <span className="text-red-400 font-bold">{params.stopLossPercent}%</span>
                                                    <span>10%</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div>
                                            <Label className={`font-bold ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>
                                                Take Profit (%)
                                            </Label>
                                            <div className="mt-2 space-y-3">
                                                <Input
                                                    type="number"
                                                    step="0.5"
                                                    value={params.takeProfitPercent}
                                                    onChange={(e) => setParams({ ...params, takeProfitPercent: parseFloat(e.target.value) })}
                                                    className={`h-12 ${isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-gray-300'}`}
                                                />
                                                <input
                                                    type="range"
                                                    min="1"
                                                    max="20"
                                                    step="0.5"
                                                    value={params.takeProfitPercent}
                                                    onChange={(e) => setParams({ ...params, takeProfitPercent: parseFloat(e.target.value) })}
                                                    className="w-full accent-emerald-500"
                                                />
                                                <div className="flex justify-between text-xs text-slate-500">
                                                    <span>1%</span>
                                                    <span className="text-emerald-400 font-bold">{params.takeProfitPercent}%</span>
                                                    <span>20%</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div>
                                            <Label className={`font-bold ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>
                                                Min Confidence (1-10)
                                            </Label>
                                            <div className="mt-2 space-y-3">
                                                <Input
                                                    type="number"
                                                    min="1"
                                                    max="10"
                                                    value={params.minConfidence}
                                                    onChange={(e) => setParams({ ...params, minConfidence: parseInt(e.target.value) })}
                                                    className={`h-12 ${isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-gray-300'}`}
                                                />
                                                <input
                                                    type="range"
                                                    min="1"
                                                    max="10"
                                                    value={params.minConfidence}
                                                    onChange={(e) => setParams({ ...params, minConfidence: parseInt(e.target.value) })}
                                                    className="w-full accent-purple-500"
                                                />
                                                <div className="flex justify-between text-xs text-slate-500">
                                                    <span>1</span>
                                                    <span className="text-purple-400 font-bold">{params.minConfidence}</span>
                                                    <span>10</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* R:R Ratio Display */}
                                    <div className="mt-8 p-6 bg-gradient-to-r from-slate-800/50 to-slate-800/30 rounded-xl border border-slate-700/50">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="text-slate-400 text-sm">Risk/Reward Ratio</p>
                                                <p className="text-4xl font-bold text-white mt-1">
                                                    1:{(params.takeProfitPercent / params.stopLossPercent).toFixed(2)}
                                                </p>
                                            </div>
                                            <div className="flex gap-4">
                                                <div className="text-center">
                                                    <p className="text-red-400 text-sm">Max Loss</p>
                                                    <p className="text-xl font-bold text-white">
                                                        -${((params.initialCapital * params.positionSizePercent / 100) * params.stopLossPercent / 100 * params.leverage).toFixed(0)}
                                                    </p>
                                                </div>
                                                <div className="text-center">
                                                    <p className="text-emerald-400 text-sm">Max Profit</p>
                                                    <p className="text-xl font-bold text-white">
                                                        +${((params.initialCapital * params.positionSizePercent / 100) * params.takeProfitPercent / 100 * params.leverage).toFixed(0)}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    </TabsContent>

                    {/* RESULTS TAB */}
                    <TabsContent value="results">
                        <div className="space-y-8">
                            {/* Key Metrics */}
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                                    <Card className={`${isDark ? 'bg-slate-900/50 border-slate-800' : 'bg-white'} shadow-xl overflow-hidden`}>
                                        <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 to-transparent" />
                                        <CardContent className="p-6 relative">
                                            <div className="flex items-center justify-between mb-4">
                                                <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                                                    <TrendingUp className="w-6 h-6 text-emerald-400" />
                                                </div>
                                                <span className={`text-sm font-medium px-2 py-1 rounded-full ${displayResults.stats.totalReturn >= 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                                                    {displayResults.stats.totalReturn >= 0 ? '+' : ''}{displayResults.stats.totalReturn}%
                                                </span>
                                            </div>
                                            <p className="text-slate-400 text-sm">Total Return</p>
                                            <p className="text-3xl font-bold text-white mt-1">
                                                ${displayResults.stats.finalCapital.toLocaleString()}
                                            </p>
                                        </CardContent>
                                    </Card>
                                </motion.div>

                                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                                    <Card className={`${isDark ? 'bg-slate-900/50 border-slate-800' : 'bg-white'} shadow-xl overflow-hidden`}>
                                        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-transparent" />
                                        <CardContent className="p-6 relative">
                                            <div className="flex items-center justify-between mb-4">
                                                <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center">
                                                    <Target className="w-6 h-6 text-blue-400" />
                                                </div>
                                            </div>
                                            <p className="text-slate-400 text-sm">Win Rate</p>
                                            <p className="text-3xl font-bold text-white mt-1">
                                                {displayResults.stats.winRate}%
                                            </p>
                                            <p className="text-slate-500 text-sm mt-1">
                                                {displayResults.stats.winningTrades}W / {displayResults.stats.losingTrades}L
                                            </p>
                                        </CardContent>
                                    </Card>
                                </motion.div>

                                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                                    <Card className={`${isDark ? 'bg-slate-900/50 border-slate-800' : 'bg-white'} shadow-xl overflow-hidden`}>
                                        <div className="absolute inset-0 bg-gradient-to-br from-red-500/10 to-transparent" />
                                        <CardContent className="p-6 relative">
                                            <div className="flex items-center justify-between mb-4">
                                                <div className="w-12 h-12 rounded-xl bg-red-500/20 flex items-center justify-center">
                                                    <TrendingDown className="w-6 h-6 text-red-400" />
                                                </div>
                                            </div>
                                            <p className="text-slate-400 text-sm">Max Drawdown</p>
                                            <p className="text-3xl font-bold text-white mt-1">
                                                {displayResults.stats.maxDrawdown}%
                                            </p>
                                        </CardContent>
                                    </Card>
                                </motion.div>

                                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
                                    <Card className={`${isDark ? 'bg-slate-900/50 border-slate-800' : 'bg-white'} shadow-xl overflow-hidden`}>
                                        <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 to-transparent" />
                                        <CardContent className="p-6 relative">
                                            <div className="flex items-center justify-between mb-4">
                                                <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center">
                                                    <Activity className="w-6 h-6 text-purple-400" />
                                                </div>
                                            </div>
                                            <p className="text-slate-400 text-sm">Total Trades</p>
                                            <p className="text-3xl font-bold text-white mt-1">
                                                {displayResults.stats.totalTrades}
                                            </p>
                                        </CardContent>
                                    </Card>
                                </motion.div>
                            </div>

                            {/* Equity Curve */}
                            <Card className={`${isDark ? 'bg-slate-900/50 border-slate-800' : 'bg-white'} shadow-xl`}>
                                <CardHeader>
                                    <CardTitle className="text-white flex items-center gap-2">
                                        <BarChart3 className="w-5 h-5 text-emerald-400" />
                                        Equity Curve
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="h-80">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <AreaChart data={displayResults.equityCurve}>
                                                <defs>
                                                    <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                                                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                                    </linearGradient>
                                                </defs>
                                                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                                                <XAxis dataKey="time" stroke="#64748b" />
                                                <YAxis stroke="#64748b" domain={['dataMin - 500', 'dataMax + 500']} />
                                                <Tooltip
                                                    contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                                                    labelStyle={{ color: '#94a3b8' }}
                                                />
                                                <Area
                                                    type="monotone"
                                                    dataKey="equity"
                                                    stroke="#10b981"
                                                    strokeWidth={2}
                                                    fill="url(#equityGradient)"
                                                />
                                            </AreaChart>
                                        </ResponsiveContainer>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Additional Stats */}
                            <div className="grid md:grid-cols-2 gap-6">
                                <Card className={`${isDark ? 'bg-slate-900/50 border-slate-800' : 'bg-white'} shadow-xl`}>
                                    <CardHeader>
                                        <CardTitle className="text-white">Performance Metrics</CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        <div className="flex justify-between py-3 border-b border-slate-800">
                                            <span className="text-slate-400">Average Win</span>
                                            <span className="text-emerald-400 font-bold">+{displayResults.stats.avgWin}%</span>
                                        </div>
                                        <div className="flex justify-between py-3 border-b border-slate-800">
                                            <span className="text-slate-400">Average Loss</span>
                                            <span className="text-red-400 font-bold">-{displayResults.stats.avgLoss}%</span>
                                        </div>
                                        <div className="flex justify-between py-3 border-b border-slate-800">
                                            <span className="text-slate-400">Profit Factor</span>
                                            <span className="text-white font-bold">{displayResults.stats.profitFactor}</span>
                                        </div>
                                        <div className="flex justify-between py-3">
                                            <span className="text-slate-400">Sharpe Ratio</span>
                                            <span className="text-white font-bold">{displayResults.stats.sharpeRatio}</span>
                                        </div>
                                    </CardContent>
                                </Card>

                                <Card className={`${isDark ? 'bg-slate-900/50 border-slate-800' : 'bg-white'} shadow-xl`}>
                                    <CardHeader>
                                        <CardTitle className="text-white">Signal Distribution</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="h-48 flex items-center justify-center">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <RechartsPie>
                                                    <Pie
                                                        data={[
                                                            { name: 'LONG', value: displayResults.signalDistribution.LONG },
                                                            { name: 'SHORT', value: displayResults.signalDistribution.SHORT },
                                                            { name: 'WAIT', value: displayResults.signalDistribution.WAIT }
                                                        ]}
                                                        cx="50%"
                                                        cy="50%"
                                                        innerRadius={40}
                                                        outerRadius={70}
                                                        paddingAngle={5}
                                                        dataKey="value"
                                                    >
                                                        {COLORS.map((color, index) => (
                                                            <Cell key={`cell-${index}`} fill={color} />
                                                        ))}
                                                    </Pie>
                                                    <Tooltip />
                                                </RechartsPie>
                                            </ResponsiveContainer>
                                        </div>
                                        <div className="flex justify-center gap-6 mt-4">
                                            <div className="flex items-center gap-2">
                                                <div className="w-3 h-3 rounded-full bg-emerald-500" />
                                                <span className="text-slate-400 text-sm">LONG</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <div className="w-3 h-3 rounded-full bg-red-500" />
                                                <span className="text-slate-400 text-sm">SHORT</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <div className="w-3 h-3 rounded-full bg-gray-500" />
                                                <span className="text-slate-400 text-sm">WAIT</span>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>
                        </div>
                    </TabsContent>

                    {/* ANALYSIS TAB */}
                    <TabsContent value="analysis">
                        <div className="grid md:grid-cols-2 gap-8">
                            {/* Exchange Divergence Scenarios */}
                            <Card className={`${isDark ? 'bg-slate-900/50 border-slate-800' : 'bg-white'} shadow-xl`}>
                                <CardHeader>
                                    <CardTitle className="text-white flex items-center gap-2">
                                        <Zap className="w-5 h-5 text-amber-400" />
                                        Exchange Divergence Scenarios
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    {Object.entries(displayResults.scenarioDistribution)
                                        .sort((a, b) => b[1] - a[1])
                                        .map(([scenario, count], i) => {
                                            const total = Object.values(displayResults.scenarioDistribution).reduce((a, b) => a + b, 0);
                                            const percent = ((count / total) * 100).toFixed(1);
                                            return (
                                                <div key={scenario} className="space-y-1">
                                                    <div className="flex justify-between text-sm">
                                                        <span className="text-slate-300 capitalize">{scenario.replace(/_/g, ' ')}</span>
                                                        <span className="text-slate-400">{count} ({percent}%)</span>
                                                    </div>
                                                    <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                                                        <motion.div
                                                            initial={{ width: 0 }}
                                                            animate={{ width: `${percent}%` }}
                                                            className="h-full rounded-full"
                                                            style={{ backgroundColor: SCENARIO_COLORS[i % SCENARIO_COLORS.length] }}
                                                        />
                                                    </div>
                                                </div>
                                            );
                                        })}
                                </CardContent>
                            </Card>

                            {/* Market Regimes */}
                            <Card className={`${isDark ? 'bg-slate-900/50 border-slate-800' : 'bg-white'} shadow-xl`}>
                                <CardHeader>
                                    <CardTitle className="text-white flex items-center gap-2">
                                        <Activity className="w-5 h-5 text-blue-400" />
                                        Market Regimes
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    {Object.entries(displayResults.regimeDistribution)
                                        .sort((a, b) => b[1] - a[1])
                                        .map(([regime, count], i) => {
                                            const total = Object.values(displayResults.regimeDistribution).reduce((a, b) => a + b, 0);
                                            const percent = ((count / total) * 100).toFixed(1);
                                            return (
                                                <div key={regime} className="space-y-1">
                                                    <div className="flex justify-between text-sm">
                                                        <span className="text-slate-300 capitalize">{regime}</span>
                                                        <span className="text-slate-400">{count} ({percent}%)</span>
                                                    </div>
                                                    <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                                                        <motion.div
                                                            initial={{ width: 0 }}
                                                            animate={{ width: `${percent}%` }}
                                                            className="h-full rounded-full"
                                                            style={{ backgroundColor: SCENARIO_COLORS[(i + 3) % SCENARIO_COLORS.length] }}
                                                        />
                                                    </div>
                                                </div>
                                            );
                                        })}
                                </CardContent>
                            </Card>
                        </div>
                    </TabsContent>

                    {/* TRADES TAB */}
                    <TabsContent value="trades">
                        <Card className={`${isDark ? 'bg-slate-900/50 border-slate-800' : 'bg-white'} shadow-xl`}>
                            <CardHeader>
                                <CardTitle className="text-white flex items-center gap-2">
                                    <Activity className="w-5 h-5 text-emerald-400" />
                                    Trade History
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="overflow-x-auto">
                                    <table className="w-full">
                                        <thead>
                                            <tr className="border-b border-slate-800">
                                                <th className="text-left py-3 px-4 text-slate-400 font-medium">Direction</th>
                                                <th className="text-left py-3 px-4 text-slate-400 font-medium">Entry</th>
                                                <th className="text-left py-3 px-4 text-slate-400 font-medium">Exit</th>
                                                <th className="text-left py-3 px-4 text-slate-400 font-medium">P&L</th>
                                                <th className="text-left py-3 px-4 text-slate-400 font-medium">Reason</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {displayResults.trades.map((trade, i) => (
                                                <motion.tr
                                                    key={i}
                                                    initial={{ opacity: 0, x: -20 }}
                                                    animate={{ opacity: 1, x: 0 }}
                                                    transition={{ delay: i * 0.05 }}
                                                    className="border-b border-slate-800/50 hover:bg-slate-800/30"
                                                >
                                                    <td className="py-3 px-4">
                                                        <span className={`px-2 py-1 rounded text-sm font-medium ${trade.direction === 'LONG'
                                                            ? 'bg-emerald-500/20 text-emerald-400'
                                                            : 'bg-red-500/20 text-red-400'
                                                            }`}>
                                                            {trade.direction}
                                                        </span>
                                                    </td>
                                                    <td className="py-3 px-4 text-white font-mono">
                                                        ${trade.entryPrice.toLocaleString()}
                                                    </td>
                                                    <td className="py-3 px-4 text-white font-mono">
                                                        ${trade.exitPrice.toLocaleString()}
                                                    </td>
                                                    <td className="py-3 px-4">
                                                        <span className={`font-bold ${trade.pnlPercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                            {trade.pnlPercent >= 0 ? '+' : ''}{trade.pnlPercent}%
                                                        </span>
                                                    </td>
                                                    <td className="py-3 px-4 text-slate-400 text-sm capitalize">
                                                        {trade.reason.replace(/_/g, ' ')}
                                                    </td>
                                                </motion.tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            </div>

            {/* Footer */}
            <div className="border-t border-slate-800/50 mt-16">
                <div className="max-w-7xl mx-auto px-6 py-8">
                    <p className="text-center text-slate-500 text-sm">
                        ⚠️ Past performance does not guarantee future results. Use at your own risk.
                    </p>
                </div>
            </div>
        </div>
    );
}
