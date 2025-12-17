// src/AdminDataTools.jsx
// ============================================================================
// Admin Data Tools - Standalone Page
// ============================================================================
// Comprehensive admin panel for managing historical data sync with:
// - Exchange, timeframe, and data type filters
// - Data coverage display
// - Clear data functionality
// - Database verification against Coinglass API
//
// Created: 2025-12-17
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
    Database,
    RefreshCw,
    Loader2,
    CheckCircle2,
    XCircle,
    Calendar,
    Clock,
    Download,
    Pause,
    Play,
    AlertTriangle,
    Trash2,
    Shield,
    Settings,
    Server
} from "lucide-react";

const API_BASE = '/api/data';

export default function AdminDataTools() {
    // State
    const [coverage, setCoverage] = useState(null);
    const [syncStatus, setSyncStatus] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Sync options
    const [daysBack, setDaysBack] = useState(7);
    const [selectedExchanges, setSelectedExchanges] = useState(['Binance', 'Bybit']);
    const [selectedTimeframes, setSelectedTimeframes] = useState(['30m', '1h', '4h', '1d']);
    const [selectedDataTypes, setSelectedDataTypes] = useState(['price', 'oi', 'funding', 'taker_volume']);
    const [forceSync, setForceSync] = useState(false);

    // Verification state
    const [verifying, setVerifying] = useState(false);
    const [verifyResult, setVerifyResult] = useState(null);
    const [verifyMode, setVerifyMode] = useState('random'); // 'random' or 'range'
    const [verifySampleSize, setVerifySampleSize] = useState(10);
    const [verifyExchange, setVerifyExchange] = useState('Binance');
    const [verifyTimeframe, setVerifyTimeframe] = useState('4h');
    const [verifyStartTime, setVerifyStartTime] = useState('');
    const [verifyEndTime, setVerifyEndTime] = useState('');

    // Clear data state
    const [clearing, setClearing] = useState(false);
    const [clearConfirm, setClearConfirm] = useState(false);
    const [securityPhrase, setSecurityPhrase] = useState('');

    // Load coverage data
    const loadCoverage = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE}/coverage`);
            const data = await res.json();
            if (data.success) {
                setCoverage(data);
            }
        } catch (err) {
            console.error('Failed to load coverage:', err);
        }
    }, []);

    // Load sync status
    const loadSyncStatus = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE}/sync/status`);
            const data = await res.json();
            if (data.success !== false) {
                setSyncStatus(data);
            }
        } catch (err) {
            console.error('Failed to load sync status:', err);
        }
    }, []);

    // Initial load
    useEffect(() => {
        const load = async () => {
            setLoading(true);
            await Promise.all([loadCoverage(), loadSyncStatus()]);
            setLoading(false);
        };
        load();
    }, [loadCoverage, loadSyncStatus]);

    // Poll sync status while running
    useEffect(() => {
        if (syncStatus?.isRunning) {
            const interval = setInterval(loadSyncStatus, 2000);
            return () => clearInterval(interval);
        }
    }, [syncStatus?.isRunning, loadSyncStatus]);

    // Start sync with filters
    const startSync = async () => {
        setError(null);
        try {
            const res = await fetch(`${API_BASE}/sync`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    daysBack,
                    force: forceSync,
                    exchanges: selectedExchanges,
                    timeframes: selectedTimeframes,
                    dataTypes: selectedDataTypes
                })
            });
            const data = await res.json();
            if (data.success) {
                setSyncStatus(data.status);
            } else {
                setError(data.error || 'Failed to start sync');
            }
        } catch (err) {
            setError(err.message);
        }
    };

    // Abort sync
    const abortSync = async () => {
        try {
            await fetch(`${API_BASE}/sync/abort`, { method: 'POST' });
            await loadSyncStatus();
        } catch (err) {
            console.error('Failed to abort:', err);
        }
    };

    // Clear data with security phrase
    const clearData = async () => {
        if (!clearConfirm) {
            setClearConfirm(true);
            return;
        }

        if (securityPhrase !== 'Tomer Is The King') {
            setError('Security phrase incorrect');
            return;
        }

        setClearing(true);
        setError(null);
        try {
            const res = await fetch(`${API_BASE}/clear`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phrase: securityPhrase })
            });
            const data = await res.json();
            if (data.success) {
                await loadCoverage();
                setClearConfirm(false);
                setSecurityPhrase('');
            } else {
                setError(data.error);
            }
        } catch (err) {
            setError(err.message);
        }
        setClearing(false);
    };

    // Verify database
    const verifyDatabase = async () => {
        setVerifying(true);
        setVerifyResult(null);
        setError(null);
        try {
            const body = {
                sampleSize: verifySampleSize,
                exchange: verifyExchange,
                timeframe: verifyTimeframe
            };

            // Add time range only if mode is 'range'
            if (verifyMode === 'range') {
                if (verifyStartTime) {
                    body.startTime = new Date(verifyStartTime).getTime();
                }
                if (verifyEndTime) {
                    body.endTime = new Date(verifyEndTime).getTime();
                }
            }

            const res = await fetch(`${API_BASE}/verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const data = await res.json();
            setVerifyResult(data);
        } catch (err) {
            setError(err.message);
        }
        setVerifying(false);
    };

    // Toggle selection helpers
    const toggleExchange = (ex) => {
        setSelectedExchanges(prev =>
            prev.includes(ex) ? prev.filter(e => e !== ex) : [...prev, ex]
        );
    };

    const toggleTimeframe = (tf) => {
        setSelectedTimeframes(prev =>
            prev.includes(tf) ? prev.filter(t => t !== tf) : [...prev, tf]
        );
    };

    const toggleDataType = (dt) => {
        setSelectedDataTypes(prev =>
            prev.includes(dt) ? prev.filter(d => d !== dt) : [...prev, dt]
        );
    };

    // Calculate progress
    const progressPercent = syncStatus?.isRunning && syncStatus.progress?.total > 0
        ? Math.round((syncStatus.progress.current / syncStatus.progress.total) * 100)
        : 0;

    if (loading) {
        return (
            <div className="p-6">
                <Card className="bg-slate-800/50 border-slate-700">
                    <CardContent className="p-6 flex items-center justify-center">
                        <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
                        <span className="ml-2 text-slate-400">Loading admin tools...</span>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="p-6 max-w-6xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center">
                        <Server className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-white">Admin Data Tools</h1>
                        <p className="text-sm text-slate-400">Manage historical data sync and verification</p>
                    </div>
                </div>
                <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => { loadCoverage(); loadSyncStatus(); }}
                    className="text-slate-400 hover:text-white"
                >
                    <RefreshCw className="w-4 h-4" />
                </Button>
            </div>

            {/* Error Display */}
            {error && (
                <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-2">
                    <XCircle className="w-5 h-5 text-red-400" />
                    <span className="text-red-400">{error}</span>
                    <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-300">×</button>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Sync Configuration Card */}
                <Card className="bg-slate-800/50 border-slate-700">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-lg text-white flex items-center gap-2">
                            <Settings className="w-5 h-5 text-purple-400" />
                            Sync Configuration
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {/* Exchange Selection */}
                        <div>
                            <label className="text-xs text-slate-400 mb-2 block">Exchanges</label>
                            <div className="flex gap-2">
                                {['Binance', 'Bybit'].map(ex => (
                                    <button
                                        key={ex}
                                        onClick={() => toggleExchange(ex)}
                                        disabled={syncStatus?.isRunning}
                                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${selectedExchanges.includes(ex)
                                            ? 'bg-purple-600 text-white'
                                            : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                                            } ${syncStatus?.isRunning ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    >
                                        {ex}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Timeframe Selection */}
                        <div>
                            <label className="text-xs text-slate-400 mb-2 block">Timeframes</label>
                            <div className="flex gap-2 flex-wrap">
                                {['30m', '1h', '4h', '1d'].map(tf => (
                                    <button
                                        key={tf}
                                        onClick={() => toggleTimeframe(tf)}
                                        disabled={syncStatus?.isRunning}
                                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${selectedTimeframes.includes(tf)
                                            ? 'bg-cyan-600 text-white'
                                            : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                                            } ${syncStatus?.isRunning ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    >
                                        {tf}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Data Type Selection */}
                        <div>
                            <label className="text-xs text-slate-400 mb-2 block">Data Types</label>
                            <div className="flex gap-2 flex-wrap">
                                {[
                                    { id: 'price', label: 'Price' },
                                    { id: 'oi', label: 'OI' },
                                    { id: 'funding', label: 'Funding' },
                                    { id: 'taker_volume', label: 'CVD' }
                                ].map(dt => (
                                    <button
                                        key={dt.id}
                                        onClick={() => toggleDataType(dt.id)}
                                        disabled={syncStatus?.isRunning}
                                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${selectedDataTypes.includes(dt.id)
                                            ? 'bg-emerald-600 text-white'
                                            : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                                            } ${syncStatus?.isRunning ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    >
                                        {dt.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Days Selection */}
                        <div>
                            <label className="text-xs text-slate-400 mb-2 block">Days Back</label>
                            <div className="flex gap-2">
                                {[7, 30, 60, 90].map(days => (
                                    <button
                                        key={days}
                                        onClick={() => setDaysBack(days)}
                                        disabled={syncStatus?.isRunning}
                                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${daysBack === days
                                            ? 'bg-amber-600 text-white'
                                            : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                                            } ${syncStatus?.isRunning ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    >
                                        {days}d
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Force Sync Toggle */}
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setForceSync(!forceSync)}
                                disabled={syncStatus?.isRunning}
                                className={`w-10 h-5 rounded-full transition-all ${forceSync ? 'bg-amber-600' : 'bg-slate-700'
                                    }`}
                            >
                                <div className={`w-4 h-4 rounded-full bg-white transition-all ${forceSync ? 'translate-x-5' : 'translate-x-0.5'
                                    }`} />
                            </button>
                            <span className="text-sm text-slate-400">Force re-download (ignore existing data)</span>
                        </div>

                        {/* Sync Button */}
                        <div className="pt-2">
                            {syncStatus?.isRunning ? (
                                <Button
                                    onClick={abortSync}
                                    variant="outline"
                                    className="w-full border-red-500/50 text-red-400 hover:bg-red-500/10"
                                >
                                    <Pause className="w-4 h-4 mr-2" />
                                    Stop Sync
                                </Button>
                            ) : (
                                <Button
                                    onClick={startSync}
                                    className="w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:from-purple-700 hover:to-pink-700"
                                    disabled={selectedExchanges.length === 0 || selectedTimeframes.length === 0 || selectedDataTypes.length === 0}
                                >
                                    <Download className="w-4 h-4 mr-2" />
                                    Start Sync
                                </Button>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* Data Coverage Card */}
                <Card className="bg-slate-800/50 border-slate-700">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-lg text-white flex items-center gap-2">
                            <Database className="w-5 h-5 text-cyan-400" />
                            Data Coverage
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {/* Sync Progress (when running) */}
                        {syncStatus?.isRunning && (
                            <div className="p-4 bg-purple-500/10 border border-purple-500/30 rounded-lg">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-sm font-medium text-purple-400 flex items-center gap-2">
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Syncing...
                                    </span>
                                    <span className="text-xs text-purple-300">{progressPercent}%</span>
                                </div>
                                <div className="w-full bg-slate-700 rounded-full h-2 mb-2">
                                    <div
                                        className="bg-gradient-to-r from-purple-500 to-pink-500 h-2 rounded-full transition-all duration-300"
                                        style={{ width: `${progressPercent}%` }}
                                    />
                                </div>
                                <div className="text-xs text-slate-400 truncate">
                                    {syncStatus.progress?.currentTask || 'Processing...'}
                                </div>
                                <div className="grid grid-cols-2 gap-2 mt-2 text-xs">
                                    <div className="bg-slate-800/50 rounded p-1.5 text-center">
                                        <div className="text-slate-500">Candles</div>
                                        <div className="text-cyan-400 font-medium">
                                            {(syncStatus.progress?.candlesStored || 0).toLocaleString()}
                                        </div>
                                    </div>
                                    <div className="bg-slate-800/50 rounded p-1.5 text-center">
                                        <div className="text-slate-500">Tasks</div>
                                        <div className="text-white font-medium">
                                            {syncStatus.progress?.current || 0}/{syncStatus.progress?.total || 0}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Coverage Stats */}
                        {coverage?.overall && (
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-slate-400">Total Rows:</span>
                                    <span className="text-lg font-bold text-white">
                                        {coverage.overall.totalRows?.toLocaleString() || 0}
                                    </span>
                                </div>

                                {coverage.overall.earliest && (
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="text-slate-400">Date Range:</span>
                                        <span className="text-cyan-400">
                                            {new Date(coverage.overall.earliest).toLocaleDateString()} → {new Date(coverage.overall.latest).toLocaleDateString()}
                                        </span>
                                    </div>
                                )}

                                {/* Per-exchange breakdown */}
                                {coverage.byExchange && (
                                    <div className="grid grid-cols-2 gap-4 pt-2">
                                        {Object.entries(coverage.byExchange).map(([exchange, timeframes]) => (
                                            <div key={exchange} className="text-xs">
                                                <span className="text-slate-400 font-medium">{exchange}</span>
                                                <div className="mt-1 space-y-0.5">
                                                    {Object.entries(timeframes).map(([tf, data]) => (
                                                        <div key={tf} className="flex justify-between">
                                                            <span className="text-slate-500">{tf}</span>
                                                            <span className={data.count > 0 ? "text-emerald-400" : "text-slate-500"}>
                                                                {data.count || 0}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {(!coverage?.overall || coverage.overall.totalRows === 0) && !syncStatus?.isRunning && (
                            <div className="flex items-center gap-2 text-amber-400 text-sm p-3 bg-amber-500/10 rounded-lg">
                                <AlertTriangle className="w-4 h-4" />
                                No data stored yet. Run sync to download.
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Verification Card */}
                <Card className="bg-slate-800/50 border-slate-700">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-lg text-white flex items-center gap-2">
                            <Shield className="w-5 h-5 text-emerald-400" />
                            Database Verification
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <p className="text-sm text-slate-400">
                            Compare database samples with Coinglass API to verify data integrity.
                        </p>

                        {/* Verification Mode Toggle */}
                        <div>
                            <label className="text-xs text-slate-400 mb-2 block">Verification Mode</label>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setVerifyMode('random')}
                                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex-1 ${verifyMode === 'random'
                                        ? 'bg-emerald-600 text-white'
                                        : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                                        }`}
                                >
                                    🎲 Random Samples
                                </button>
                                <button
                                    onClick={() => setVerifyMode('range')}
                                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex-1 ${verifyMode === 'range'
                                        ? 'bg-emerald-600 text-white'
                                        : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                                        }`}
                                >
                                    📅 Time Range
                                </button>
                            </div>
                        </div>

                        {/* Exchange Selection */}
                        <div>
                            <label className="text-xs text-slate-400 mb-2 block">Exchange</label>
                            <div className="flex gap-2">
                                {['Binance', 'Bybit'].map(ex => (
                                    <button
                                        key={ex}
                                        onClick={() => setVerifyExchange(ex)}
                                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${verifyExchange === ex
                                            ? 'bg-emerald-600 text-white'
                                            : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                                            }`}
                                    >
                                        {ex}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Timeframe Selection */}
                        <div>
                            <label className="text-xs text-slate-400 mb-2 block">Timeframe</label>
                            <div className="flex gap-2">
                                {['30m', '1h', '4h', '1d'].map(tf => (
                                    <button
                                        key={tf}
                                        onClick={() => setVerifyTimeframe(tf)}
                                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${verifyTimeframe === tf
                                            ? 'bg-emerald-600 text-white'
                                            : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                                            }`}
                                    >
                                        {tf}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Time Range (only for range mode) */}
                        {verifyMode === 'range' && (
                            <div className="grid grid-cols-2 gap-3 p-3 bg-slate-900/50 rounded-lg border border-emerald-500/30">
                                <div>
                                    <label className="text-xs text-emerald-400 mb-1 block">From</label>
                                    <input
                                        type="datetime-local"
                                        value={verifyStartTime}
                                        onChange={(e) => setVerifyStartTime(e.target.value)}
                                        className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-emerald-400 mb-1 block">To</label>
                                    <input
                                        type="datetime-local"
                                        value={verifyEndTime}
                                        onChange={(e) => setVerifyEndTime(e.target.value)}
                                        className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm"
                                    />
                                </div>
                            </div>
                        )}

                        {/* Sample Size */}
                        <div className="flex items-center gap-3">
                            <label className="text-xs text-slate-400">Samples to verify:</label>
                            <div className="flex gap-1">
                                {[5, 10, 20].map(n => (
                                    <button
                                        key={n}
                                        onClick={() => setVerifySampleSize(n)}
                                        className={`px-2 py-1 rounded text-xs ${verifySampleSize === n
                                            ? 'bg-emerald-600 text-white'
                                            : 'bg-slate-700 text-slate-400'
                                            }`}
                                    >
                                        {n}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <Button
                            onClick={verifyDatabase}
                            disabled={verifying || !coverage?.overall?.totalRows}
                            className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 text-white"
                        >
                            {verifying ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Verifying...
                                </>
                            ) : (
                                <>
                                    <Shield className="w-4 h-4 mr-2" />
                                    Verify Database
                                </>
                            )}
                        </Button>

                        {verifyResult && (
                            <div className={`p-4 rounded-lg ${verifyResult.success && parseInt(verifyResult.accuracy) >= 90
                                ? 'bg-emerald-500/10 border border-emerald-500/30'
                                : 'bg-amber-500/10 border border-amber-500/30'
                                }`}>
                                <div className="flex items-center justify-between mb-2">
                                    <span className="font-medium text-white">Verification Result</span>
                                    <span className={`text-lg font-bold ${parseInt(verifyResult.accuracy) >= 90 ? 'text-emerald-400' : 'text-amber-400'
                                        }`}>
                                        {verifyResult.accuracy}
                                    </span>
                                </div>
                                <div className="grid grid-cols-3 gap-2 text-xs">
                                    <div className="bg-slate-800/50 rounded p-2 text-center">
                                        <div className="text-slate-500">Verified</div>
                                        <div className="text-white">{verifyResult.verified}</div>
                                    </div>
                                    <div className="bg-slate-800/50 rounded p-2 text-center">
                                        <div className="text-slate-500">Matches</div>
                                        <div className="text-emerald-400">{verifyResult.matches}</div>
                                    </div>
                                    <div className="bg-slate-800/50 rounded p-2 text-center">
                                        <div className="text-slate-500">Mismatches</div>
                                        <div className="text-red-400">{verifyResult.mismatches}</div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Clear Data Card */}
                <Card className="bg-slate-800/50 border-slate-700">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-lg text-white flex items-center gap-2">
                            <Trash2 className="w-5 h-5 text-red-400" />
                            Clear Data
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <p className="text-sm text-slate-400">
                            Delete all historical data from the database. Use this before re-syncing with a new structure.
                        </p>

                        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                            <div className="flex items-center gap-2 text-red-400 text-sm">
                                <AlertTriangle className="w-4 h-4" />
                                <span>This action cannot be undone!</span>
                            </div>
                        </div>

                        {clearConfirm ? (
                            <div className="space-y-3">
                                <div>
                                    <label className="text-xs text-red-400 mb-1 block">
                                        Type "Tomer Is The King" to confirm:
                                    </label>
                                    <input
                                        type="text"
                                        value={securityPhrase}
                                        onChange={(e) => setSecurityPhrase(e.target.value)}
                                        placeholder="Enter security phrase..."
                                        className="w-full px-3 py-2 bg-slate-700 border border-red-500/50 rounded-lg text-white text-sm"
                                    />
                                </div>
                                <div className="flex gap-2">
                                    <Button
                                        onClick={clearData}
                                        disabled={clearing || securityPhrase !== 'Tomer Is The King'}
                                        className="flex-1 bg-red-600 hover:bg-red-700 text-white disabled:opacity-50"
                                    >
                                        {clearing ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            'Delete All Data'
                                        )}
                                    </Button>
                                    <Button
                                        onClick={() => { setClearConfirm(false); setSecurityPhrase(''); }}
                                        variant="outline"
                                        className="border-slate-600 text-slate-400"
                                    >
                                        Cancel
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <Button
                                onClick={clearData}
                                variant="outline"
                                className="w-full border-red-500/50 text-red-400 hover:bg-red-500/10"
                                disabled={syncStatus?.isRunning}
                            >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Clear All Data
                            </Button>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
