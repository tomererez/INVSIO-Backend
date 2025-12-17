// src/DataSyncPanel.jsx
// ============================================================================
// Historical Data Sync Panel
// ============================================================================
// UI for managing historical data synchronization for backtesting.
// 
// Features:
// - Shows data coverage (date range, row counts)
// - Start/stop sync jobs
// - Progress tracking
// - Sync recent data
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
    BarChart3
} from "lucide-react";

const API_BASE = '/api/data';

export default function DataSyncPanel() {
    // State
    const [coverage, setCoverage] = useState(null);
    const [syncStatus, setSyncStatus] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [daysBack, setDaysBack] = useState(90);

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

    // Start full sync
    const startSync = async () => {
        setError(null);
        try {
            const res = await fetch(`${API_BASE}/sync`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ daysBack, force: false })
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

    // Sync recent data only
    const syncRecent = async () => {
        setError(null);
        try {
            const res = await fetch(`${API_BASE}/sync/recent`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ days: 1 })
            });
            const data = await res.json();
            if (data.success) {
                setSyncStatus(data.status);
            } else {
                setError(data.error || 'Failed to start recent sync');
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

    // Format date
    const formatDate = (dateStr) => {
        if (!dateStr) return 'N/A';
        return new Date(dateStr).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    };

    // Calculate expected date range based on selected daysBack
    const getExpectedRange = () => {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - daysBack);
        return {
            start: formatDate(startDate),
            end: formatDate(endDate)
        };
    };

    // Estimate sync time based on days
    const getEstimatedTime = () => {
        // ~70 requests/min with rate limiting
        // 2 exchanges × 4 timeframes × 4 data types = 32 tasks
        // Each task may make multiple batch requests depending on days
        const batchesPerTask = Math.ceil(daysBack / 90); // More batches for longer periods
        const totalTasks = 32 * batchesPerTask;
        const minutesNeeded = Math.ceil(totalTasks / 3); // ~3 tasks per minute with throttling

        if (minutesNeeded < 10) return '~5-10 min';
        if (minutesNeeded < 20) return '~15-20 min';
        if (minutesNeeded < 30) return '~20-25 min';
        if (minutesNeeded < 45) return '~30-40 min';
        return '~45+ min';
    };

    // Estimate expected rows based on days
    const getExpectedRows = () => {
        // Per exchange, per timeframe:
        // 30m: 48 candles/day, 1h: 24, 4h: 6, 1d: 1 = 79 candles/day/exchange
        // 2 exchanges = 158 candles/day
        const candlesPerDay = 158;
        return (daysBack * candlesPerDay).toLocaleString();
    };

    // Calculate progress percentage
    const progressPercent = syncStatus?.isRunning && syncStatus.progress?.total > 0
        ? Math.round((syncStatus.progress.current / syncStatus.progress.total) * 100)
        : 0;

    const expectedRange = getExpectedRange();

    if (loading) {
        return (
            <Card className="bg-slate-800/50 border-slate-700">
                <CardContent className="p-6 flex items-center justify-center">
                    <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
                    <span className="ml-2 text-slate-400">Loading data coverage...</span>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
                            <Database className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <CardTitle className="text-lg text-white">Historical Data Storage</CardTitle>
                            <p className="text-xs text-slate-400 mt-0.5">
                                Local data for instant backtesting
                            </p>
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
            </CardHeader>

            <CardContent className="space-y-4">
                {/* Error Display */}
                {error && (
                    <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-2">
                        <XCircle className="w-4 h-4 text-red-400" />
                        <span className="text-red-400 text-sm">{error}</span>
                    </div>
                )}

                {/* Data Coverage */}
                <div className="p-4 bg-slate-900/50 rounded-lg">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-medium text-white flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-cyan-400" />
                            Sync Plan ({daysBack} days)
                        </span>
                        <span className="text-xs px-2 py-0.5 bg-slate-700 text-slate-300 rounded">
                            ~{getExpectedRows()} rows
                        </span>
                    </div>

                    {/* Expected date range based on selected period */}
                    <div className="text-sm text-slate-300 mb-2">
                        <span className="text-cyan-400">{expectedRange.start}</span>
                        <span className="text-slate-500 mx-2">→</span>
                        <span className="text-cyan-400">{expectedRange.end}</span>
                    </div>

                    {/* Estimated time */}
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                        <Clock className="w-3 h-3" />
                        Estimated time: <span className="text-amber-400">{getEstimatedTime()}</span>
                    </div>

                    {/* Already stored data info */}
                    {coverage?.overall?.totalRows > 0 && (
                        <div className="mt-3 pt-3 border-t border-slate-700">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-xs text-slate-400">Already stored:</span>
                                <span className="text-xs px-2 py-0.5 bg-emerald-500/20 text-emerald-400 rounded">
                                    {coverage.overall.totalRows.toLocaleString()} rows
                                </span>
                            </div>

                            {/* Per-exchange breakdown */}
                            {coverage.byExchange && (
                                <div className="grid grid-cols-2 gap-4">
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

                    {/* No data warning */}
                    {(!coverage?.overall || coverage.overall.totalRows === 0) && (
                        <div className="mt-2 flex items-center gap-2 text-amber-400 text-xs">
                            <AlertTriangle className="w-3 h-3" />
                            No data stored yet. Run sync to download.
                        </div>
                    )}
                </div>

                {/* Sync Status (when running) */}
                {syncStatus?.isRunning && (
                    <div className="p-4 bg-purple-500/10 border border-purple-500/30 rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium text-purple-400 flex items-center gap-2">
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Syncing...
                            </span>
                            <span className="text-xs text-purple-300">{progressPercent}%</span>
                        </div>

                        {/* Progress bar */}
                        <div className="w-full bg-slate-700 rounded-full h-2 mb-2">
                            <div
                                className="bg-gradient-to-r from-purple-500 to-cyan-500 h-2 rounded-full transition-all duration-300"
                                style={{ width: `${progressPercent}%` }}
                            />
                        </div>

                        {/* Current task */}
                        <div className="text-xs text-slate-400 mb-2 truncate">
                            {syncStatus.progress?.currentTask || 'Processing...'}
                        </div>

                        {/* Stats row */}
                        <div className="grid grid-cols-3 gap-2 text-xs">
                            <div className="bg-slate-800/50 rounded p-1.5 text-center">
                                <div className="text-slate-500">Tasks</div>
                                <div className="text-white font-medium">
                                    {syncStatus.progress?.current || 0}/{syncStatus.progress?.total || 0}
                                </div>
                            </div>
                            <div className="bg-slate-800/50 rounded p-1.5 text-center">
                                <div className="text-slate-500">Candles</div>
                                <div className="text-cyan-400 font-medium">
                                    {(syncStatus.progress?.candlesStored || 0).toLocaleString()}
                                </div>
                            </div>
                            <div className="bg-slate-800/50 rounded p-1.5 text-center">
                                <div className="text-slate-500">Requests</div>
                                <div className="text-amber-400 font-medium">
                                    {syncStatus.progress?.requestsInLastMinute || 0}/80
                                </div>
                            </div>
                        </div>

                        {/* Elapsed time */}
                        {syncStatus.elapsed > 0 && (
                            <div className="mt-2 text-xs text-slate-500 text-center">
                                Elapsed: {Math.floor(syncStatus.elapsed / 60000)}m {Math.floor((syncStatus.elapsed % 60000) / 1000)}s
                            </div>
                        )}
                    </div>
                )}

                {/* Sync Controls */}
                <div className="flex items-center gap-2">
                    {syncStatus?.isRunning ? (
                        <Button
                            onClick={abortSync}
                            variant="outline"
                            className="flex-1 border-red-500/50 text-red-400 hover:bg-red-500/10"
                        >
                            <Pause className="w-4 h-4 mr-2" />
                            Stop Sync
                        </Button>
                    ) : (
                        <>
                            <Button
                                onClick={startSync}
                                className="flex-1 bg-gradient-to-r from-cyan-600 to-blue-600 text-white hover:from-cyan-700 hover:to-blue-700"
                            >
                                <Download className="w-4 h-4 mr-2" />
                                Full Sync ({daysBack}d)
                            </Button>

                            <Button
                                onClick={syncRecent}
                                variant="outline"
                                className="border-slate-600 text-slate-300 hover:bg-slate-700"
                            >
                                <Clock className="w-4 h-4 mr-2" />
                                Recent
                            </Button>
                        </>
                    )}
                </div>

                {/* Days selector */}
                {!syncStatus?.isRunning && (
                    <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-500">Sync period:</span>
                        <div className="flex gap-1">
                            {[30, 60, 90, 180].map(days => (
                                <button
                                    key={days}
                                    onClick={() => setDaysBack(days)}
                                    className={`px-2 py-1 rounded ${daysBack === days
                                        ? 'bg-cyan-600 text-white'
                                        : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                                        }`}
                                >
                                    {days}d
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Help text */}
                <p className="text-xs text-slate-500">
                    {syncStatus?.isRunning
                        ? 'Smart rate limiting active - stays under 80 req/min. Auto-recovers from rate limits.'
                        : `Full sync takes ${getEstimatedTime()} (one-time). After sync, backtests are instant!`}
                </p>
            </CardContent>
        </Card>
    );
}
