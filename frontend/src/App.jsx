import React, { useState } from 'react';
import MarketAnalyzerTester from './MarketAnalyzerTester';
import BacktestDashboard from './BacktestDashboard';
import DebugDashboard from './DebugDashboard';
import { Brain, BarChart3, TestTube, Bug } from 'lucide-react';

function App() {
  const [activeView, setActiveView] = useState('tester');

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-slate-950/90 backdrop-blur-xl border-b border-slate-800/50">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                <Brain className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white">INVSIO</h1>
                <p className="text-xs text-slate-500">Market Analyzer Lab</p>
              </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex items-center gap-2 bg-slate-800/50 p-1 rounded-xl">
              <button
                onClick={() => setActiveView('tester')}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium transition-all ${activeView === 'tester'
                  ? 'bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow-lg shadow-purple-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                  }`}
              >
                <TestTube className="w-4 h-4" />
                Live Tester
              </button>
              <button
                onClick={() => setActiveView('backtest')}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium transition-all ${activeView === 'backtest'
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                  }`}
              >
                <BarChart3 className="w-4 h-4" />
                Backtest Lab
              </button>
              <button
                onClick={() => setActiveView('debug')}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium transition-all ${activeView === 'debug'
                  ? 'bg-gradient-to-r from-amber-600 to-orange-600 text-white shadow-lg shadow-amber-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                  }`}
              >
                <Bug className="w-4 h-4" />
                Debug
              </button>
            </div>

            {/* Status Indicator */}
            <div className="flex items-center gap-2 text-sm">
              <span className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/20 text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                System Active
              </span>
            </div>
          </div>
        </div>
      </nav>

      {/* Content - with padding for fixed nav */}
      <div className="pt-16">
        {activeView === 'tester' && <MarketAnalyzerTester />}
        {activeView === 'backtest' && <BacktestDashboard />}
        {activeView === 'debug' && <DebugDashboard />}
      </div>
    </div>
  );
}

export default App;
