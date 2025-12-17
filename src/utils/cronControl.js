// cronControl.js
// Simple utility to pause/resume the live cron job during replay batches
// This prevents rate limit conflicts between live data and replay fetching

let isPaused = false;
let pauseReason = null;
let pausedAt = null;

/**
 * Pause the cron job (e.g., during replay batch execution)
 * @param {string} reason - Reason for pausing (for logging)
 */
function pauseCron(reason = 'Replay batch running') {
    isPaused = true;
    pauseReason = reason;
    pausedAt = new Date();
    console.log(`⏸️ Cron PAUSED: ${reason}`);
}

/**
 * Resume the cron job after replay completes
 */
function resumeCron() {
    const wasPaused = isPaused;
    const duration = pausedAt ? (Date.now() - pausedAt.getTime()) / 1000 : 0;

    isPaused = false;
    pauseReason = null;
    pausedAt = null;

    if (wasPaused) {
        console.log(`▶️ Cron RESUMED after ${duration.toFixed(1)}s`);
    }
}

/**
 * Check if cron should skip this run
 * @returns {boolean} True if cron should skip
 */
function shouldSkip() {
    return isPaused;
}

/**
 * Get current status
 */
function getStatus() {
    return {
        isPaused,
        pauseReason,
        pausedAt: pausedAt?.toISOString() || null
    };
}

module.exports = {
    pauseCron,
    resumeCron,
    shouldSkip,
    getStatus
};
