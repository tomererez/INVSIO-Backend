// alertService.js - Phase 2: Basic Alert System
// Detects meaningful market events for user notifications

/**
 * =======================================================================
 * ALERT CONFIGURATION
 * =======================================================================
 */

const ALERT_CONFIG = {
    BIAS_SHIFT: {
        category: 'BIAS_SHIFT',
        cooldownMs: 30 * 60 * 1000, // 30 minutes
        defaultPriority: 'high'
    },
    REGIME_CHANGE: {
        category: 'REGIME_CHANGE',
        cooldownMs: 60 * 60 * 1000, // 1 hour
        defaultPriority: 'high'
    },
    CONFIDENCE_SPIKE: {
        category: 'CONFIDENCE_SPIKE',
        cooldownMs: 60 * 60 * 1000, // 1 hour
        defaultPriority: 'medium',
        threshold: 3 // Points jump required
    },
    TRAP_DETECTED: {
        category: 'TRAP_DETECTED',
        cooldownMs: 60 * 60 * 1000, // 1 hour
        defaultPriority: 'high'
    },
    SQUEEZE_ACTIVE: {
        category: 'SQUEEZE_ACTIVE',
        cooldownMs: 60 * 60 * 1000, // 1 hour
        defaultPriority: 'medium'
    },
    FUNDING_EXTREME: {
        category: 'FUNDING_EXTREME',
        cooldownMs: 4 * 60 * 60 * 1000, // 4 hours
        defaultPriority: 'medium',
        zScoreThreshold: 2
    }
};

/**
 * =======================================================================
 * IN-MEMORY STATE STORAGE
 * =======================================================================
 */

// Store previous state for comparison
let previousState = null;

// Store cooldown timestamps per alert category
const alertCooldowns = new Map();

// Store bias history for oscillation detection
const biasHistory = [];
const MAX_BIAS_HISTORY = 6;

/**
 * =======================================================================
 * HELPER FUNCTIONS
 * =======================================================================
 */

function generateAlertId() {
    return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function isOnCooldown(category) {
    const lastAlertTime = alertCooldowns.get(category);
    if (!lastAlertTime) return false;

    const config = ALERT_CONFIG[category];
    if (!config) return false;

    return Date.now() - lastAlertTime < config.cooldownMs;
}

function setCooldown(category) {
    alertCooldowns.set(category, Date.now());
}

function addToBiasHistory(bias) {
    biasHistory.push({ bias, timestamp: Date.now() });
    if (biasHistory.length > MAX_BIAS_HISTORY) {
        biasHistory.shift();
    }
}

function isOscillating() {
    if (biasHistory.length < 4) return false;

    // Count bias changes in recent history
    let changes = 0;
    for (let i = 1; i < biasHistory.length; i++) {
        if (biasHistory[i].bias !== biasHistory[i - 1].bias) {
            changes++;
        }
    }

    // If bias changed 3+ times in last 6 states, it's oscillating
    return changes >= 3;
}

/**
 * =======================================================================
 * ALERT CHECKERS
 * =======================================================================
 */

function checkBiasShift(current, previous) {
    if (!previous) return null;

    const currentBias = current.finalDecision?.bias;
    const previousBias = previous.finalDecision?.bias;

    if (!currentBias || !previousBias) return null;
    if (currentBias === previousBias) return null;

    // Skip if oscillating
    if (isOscillating()) return null;

    // Check cooldown
    if (isOnCooldown('BIAS_SHIFT')) return null;

    // Determine priority
    let priority = 'high';
    if (currentBias === 'WAIT' || previousBias === 'WAIT') {
        priority = 'medium';
    }

    setCooldown('BIAS_SHIFT');

    return {
        id: generateAlertId(),
        timestamp: Date.now(),
        category: 'BIAS_SHIFT',
        priority,
        title: `Bias Shift: ${previousBias} → ${currentBias}`,
        description: `Market bias has shifted from ${previousBias} to ${currentBias}. This indicates a potential change in market direction.`,
        context: {
            previousState: { bias: previousBias, confidence: previous.finalDecision?.confidence },
            currentState: { bias: currentBias, confidence: current.finalDecision?.confidence },
            triggerEvent: 'bias_direction_change'
        },
        actionableInsight: currentBias === 'LONG'
            ? 'Environment now favors looking for long opportunities.'
            : currentBias === 'SHORT'
                ? 'Environment now favors looking for short opportunities.'
                : 'Market direction unclear. Consider reducing exposure.',
        expiresAt: Date.now() + 2 * 60 * 60 * 1000 // 2 hours
    };
}

function checkRegimeChange(current, previous) {
    if (!previous) return null;

    const currentRegime = current.marketRegime?.regime;
    const previousRegime = previous.marketRegime?.regime;

    if (!currentRegime || !previousRegime) return null;
    if (currentRegime === previousRegime) return null;

    // Check cooldown
    if (isOnCooldown('REGIME_CHANGE')) return null;

    setCooldown('REGIME_CHANGE');

    return {
        id: generateAlertId(),
        timestamp: Date.now(),
        category: 'REGIME_CHANGE',
        priority: 'high',
        title: `Regime Change: ${previousRegime} → ${currentRegime}`,
        description: `Market regime has shifted from ${previousRegime} to ${currentRegime}. This may require adjustment of trading approach.`,
        context: {
            previousState: { regime: previousRegime, subType: previous.marketRegime?.subType },
            currentState: { regime: currentRegime, subType: current.marketRegime?.subType },
            triggerEvent: 'regime_state_change'
        },
        actionableInsight: getRegimeInsight(currentRegime, current.marketRegime?.subType),
        expiresAt: Date.now() + 4 * 60 * 60 * 1000 // 4 hours
    };
}

function getRegimeInsight(regime, subType) {
    const insights = {
        distribution: 'Smart money may be exiting. Exercise caution with long positions.',
        accumulation: 'Smart money may be loading. Look for long opportunities.',
        trap: subType === 'long_trap'
            ? 'Potential bull trap. Longs may be at risk.'
            : 'Potential bear trap. Shorts may be at risk.',
        covering: subType === 'long_squeeze'
            ? 'Long squeeze in progress. Avoid catching falling knife.'
            : 'Short squeeze in progress. Shorts may be forced to cover.',
        trending: subType === 'healthy_bull'
            ? 'Healthy bullish trend. Look for pullback entries.'
            : 'Healthy bearish trend. Look for bounce entries.',
        range: 'Market in chop/range. No clear edge. Consider sitting out.',
        unclear: 'Mixed signals. Wait for clarity before acting.'
    };

    return insights[regime] || 'Monitor market conditions closely.';
}

function checkConfidenceSpike(current, previous) {
    if (!previous) return null;

    const currentConf = current.finalDecision?.confidence || 0;
    const previousConf = previous.finalDecision?.confidence || 0;

    const confChange = currentConf - previousConf;
    const threshold = ALERT_CONFIG.CONFIDENCE_SPIKE.threshold;

    // Only alert on significant increase (not decrease)
    if (confChange < threshold) return null;

    // Check cooldown
    if (isOnCooldown('CONFIDENCE_SPIKE')) return null;

    // Determine priority
    const priority = currentConf >= 8 ? 'high' : 'medium';

    setCooldown('CONFIDENCE_SPIKE');

    return {
        id: generateAlertId(),
        timestamp: Date.now(),
        category: 'CONFIDENCE_SPIKE',
        priority,
        title: `Confidence Spike: ${previousConf.toFixed(1)} → ${currentConf.toFixed(1)}`,
        description: `Market confidence jumped by ${confChange.toFixed(1)} points. Higher conviction in current ${current.finalDecision?.bias} bias.`,
        context: {
            previousState: { confidence: previousConf, bias: previous.finalDecision?.bias },
            currentState: { confidence: currentConf, bias: current.finalDecision?.bias },
            triggerEvent: 'confidence_spike'
        },
        actionableInsight: `Higher confidence ${current.finalDecision?.bias} setup detected. Environment may favor more conviction in positions.`,
        expiresAt: Date.now() + 2 * 60 * 60 * 1000 // 2 hours
    };
}

function checkTrapDetected(current, previous) {
    const currentSubType = current.marketRegime?.subType;
    const previousSubType = previous?.marketRegime?.subType;

    // Only trigger if trap is newly detected
    const isTrap = currentSubType === 'long_trap' || currentSubType === 'short_trap';
    const wasNotTrap = previousSubType !== 'long_trap' && previousSubType !== 'short_trap';

    if (!isTrap || !wasNotTrap) return null;

    // Check cooldown
    if (isOnCooldown('TRAP_DETECTED')) return null;

    setCooldown('TRAP_DETECTED');

    const trapType = currentSubType === 'long_trap' ? 'Long Trap' : 'Short Trap';
    const atRisk = currentSubType === 'long_trap' ? 'longs' : 'shorts';

    return {
        id: generateAlertId(),
        timestamp: Date.now(),
        category: 'TRAP_DETECTED',
        priority: 'high',
        title: `⚠️ ${trapType} Detected`,
        description: `Market conditions indicate a potential ${trapType.toLowerCase()}. ${atRisk.charAt(0).toUpperCase() + atRisk.slice(1)} may be at risk.`,
        context: {
            previousState: { subType: previousSubType },
            currentState: { subType: currentSubType, regime: current.marketRegime?.regime },
            triggerEvent: 'trap_detection'
        },
        actionableInsight: currentSubType === 'long_trap'
            ? 'Consider avoiding new longs or tightening stops on existing longs.'
            : 'Consider avoiding new shorts or tightening stops on existing shorts.',
        expiresAt: Date.now() + 2 * 60 * 60 * 1000 // 2 hours
    };
}

function checkSqueezeActive(current, previous) {
    const currentSubType = current.marketRegime?.subType;
    const previousSubType = previous?.marketRegime?.subType;

    // Check for squeeze conditions
    const isSqueeze = currentSubType === 'short_squeeze' || currentSubType === 'long_squeeze';
    const wasNotSqueeze = previousSubType !== 'short_squeeze' && previousSubType !== 'long_squeeze';

    if (!isSqueeze || !wasNotSqueeze) return null;

    // Check cooldown
    if (isOnCooldown('SQUEEZE_ACTIVE')) return null;

    setCooldown('SQUEEZE_ACTIVE');

    const squeezeType = currentSubType === 'short_squeeze' ? 'Short Squeeze' : 'Long Squeeze';

    return {
        id: generateAlertId(),
        timestamp: Date.now(),
        category: 'SQUEEZE_ACTIVE',
        priority: 'medium',
        title: `🔥 ${squeezeType} Active`,
        description: `A ${squeezeType.toLowerCase()} is currently in progress. Positions are being forced to close.`,
        context: {
            previousState: { subType: previousSubType },
            currentState: { subType: currentSubType, regime: current.marketRegime?.regime },
            triggerEvent: 'squeeze_detection'
        },
        actionableInsight: currentSubType === 'short_squeeze'
            ? 'Rally may lack sustainability (covering, not new buying). Wait for OI to stabilize.'
            : 'Selloff may lack sustainability (liquidation, not new selling). Wait for OI to stabilize.',
        expiresAt: Date.now() + 1 * 60 * 60 * 1000 // 1 hour
    };
}

function checkFundingExtreme(current, previous) {
    const currentFunding = current.fundingAdvanced;
    const previousFunding = previous?.fundingAdvanced;

    if (!currentFunding) return null;

    const currentZScore = currentFunding.zScore || 0;
    const previousZScore = previousFunding?.zScore || 0;
    const threshold = ALERT_CONFIG.FUNDING_EXTREME.zScoreThreshold;

    // Check if funding just became extreme (wasn't extreme before)
    const isExtreme = Math.abs(currentZScore) > threshold;
    const wasExtreme = Math.abs(previousZScore) > threshold;

    if (!isExtreme || wasExtreme) return null;

    // Check cooldown
    if (isOnCooldown('FUNDING_EXTREME')) return null;

    setCooldown('FUNDING_EXTREME');

    const direction = currentZScore > 0 ? 'positive' : 'negative';
    const crowdedSide = currentZScore > 0 ? 'longs' : 'shorts';

    return {
        id: generateAlertId(),
        timestamp: Date.now(),
        category: 'FUNDING_EXTREME',
        priority: 'medium',
        title: `💰 Funding Extreme: ${direction.toUpperCase()}`,
        description: `Funding rate has reached extreme ${direction} levels (z-score: ${currentZScore.toFixed(2)}). ${crowdedSide.charAt(0).toUpperCase() + crowdedSide.slice(1)} are heavily crowded.`,
        context: {
            previousState: { zScore: previousZScore, extremeLevel: previousFunding?.extremeLevel },
            currentState: { zScore: currentZScore, extremeLevel: currentFunding.extremeLevel },
            triggerEvent: 'funding_extreme'
        },
        actionableInsight: currentZScore > 0
            ? 'Extreme positive funding suggests crowded longs. Watch for potential long squeeze.'
            : 'Extreme negative funding suggests crowded shorts. Watch for potential short squeeze.',
        expiresAt: Date.now() + 4 * 60 * 60 * 1000 // 4 hours
    };
}

/**
 * =======================================================================
 * MAIN ALERT CHECK FUNCTION
 * =======================================================================
 */

function checkAlerts(currentState) {
    const alerts = [];

    // Run all alert checkers
    const biasShiftAlert = checkBiasShift(currentState, previousState);
    if (biasShiftAlert) alerts.push(biasShiftAlert);

    const regimeChangeAlert = checkRegimeChange(currentState, previousState);
    if (regimeChangeAlert) alerts.push(regimeChangeAlert);

    const confidenceSpikeAlert = checkConfidenceSpike(currentState, previousState);
    if (confidenceSpikeAlert) alerts.push(confidenceSpikeAlert);

    const trapAlert = checkTrapDetected(currentState, previousState);
    if (trapAlert) alerts.push(trapAlert);

    const squeezeAlert = checkSqueezeActive(currentState, previousState);
    if (squeezeAlert) alerts.push(squeezeAlert);

    const fundingAlert = checkFundingExtreme(currentState, previousState);
    if (fundingAlert) alerts.push(fundingAlert);

    // Update bias history for oscillation detection
    if (currentState.finalDecision?.bias) {
        addToBiasHistory(currentState.finalDecision.bias);
    }

    // Store current state as previous for next comparison
    previousState = { ...currentState };

    // Sort alerts by priority (high first)
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    alerts.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    return alerts;
}

/**
 * =======================================================================
 * STATE MANAGEMENT FUNCTIONS
 * =======================================================================
 */

function getPreviousState() {
    return previousState;
}

function setPreviousState(state) {
    previousState = state;
}

function clearCooldowns() {
    alertCooldowns.clear();
}

function getAlertStats() {
    return {
        previousStateExists: previousState !== null,
        biasHistoryLength: biasHistory.length,
        activeCooldowns: Array.from(alertCooldowns.entries()).map(([category, timestamp]) => ({
            category,
            expiresIn: Math.max(0, (ALERT_CONFIG[category]?.cooldownMs || 0) - (Date.now() - timestamp))
        })),
        isOscillating: isOscillating()
    };
}

/**
 * =======================================================================
 * EXPORTS
 * =======================================================================
 */

module.exports = {
    checkAlerts,
    getPreviousState,
    setPreviousState,
    clearCooldowns,
    getAlertStats,
    ALERT_CONFIG
};
