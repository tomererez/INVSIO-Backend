// =============================================================================
// src/routes/configRoutes.js
// =============================================================================
// API routes for Config-Driven Calibration System
// Handles config CRUD, history, rollback, export, and AI proposal import

const express = require('express');
const router = express.Router();
const configService = require('../services/configService');
const stateStorage = require('../services/stateStorage');
const logger = require('../utils/logger');

// =============================================================================
// GET /api/config - Get current active config
// =============================================================================
router.get('/', async (req, res) => {
    try {
        const result = await configService.loadConfig();
        res.json({
            success: true,
            ...result
        });
    } catch (error) {
        logger.error('Get config failed:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// =============================================================================
// PUT /api/config - Apply new config (with optimistic locking)
// =============================================================================
router.put('/', async (req, res) => {
    try {
        const { config, based_on_version, notes } = req.body;
        const created_by = req.body.created_by || req.user?.email || 'api_user';

        if (!config) {
            return res.status(400).json({ success: false, error: 'Config is required' });
        }

        if (!based_on_version) {
            return res.status(400).json({ success: false, error: 'based_on_version is required for optimistic locking' });
        }

        if (!notes) {
            return res.status(400).json({ success: false, error: 'Notes are required' });
        }

        const result = await configService.saveConfig(
            config,
            based_on_version,
            created_by,
            notes,
            'update'
        );

        if (!result.success) {
            const status = result.conflict ? 409 : 400;
            return res.status(status).json(result);
        }

        res.json(result);

    } catch (error) {
        logger.error('Save config failed:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// =============================================================================
// POST /api/config/validate - Validate config without saving
// =============================================================================
router.post('/validate', async (req, res) => {
    try {
        const { config, current_config } = req.body;

        if (!config) {
            return res.status(400).json({ success: false, error: 'Config is required' });
        }

        // Validate structure and bounds
        const validation = configService.validateConfig(config);

        // If current config provided, also validate delta
        let deltaValidation = null;
        if (current_config) {
            deltaValidation = configService.validateDelta(current_config, config);
        }

        res.json({
            success: true,
            valid: validation.valid && (!deltaValidation || deltaValidation.valid),
            structure_errors: validation.errors,
            structure_warnings: validation.warnings,
            delta_violations: deltaValidation?.violations || []
        });

    } catch (error) {
        logger.error('Validate config failed:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// =============================================================================
// GET /api/config/history - Get version history
// =============================================================================
router.get('/history', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const history = await configService.getVersionHistory(limit);

        res.json({
            success: true,
            history
        });

    } catch (error) {
        logger.error('Get config history failed:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// =============================================================================
// GET /api/config/version/:version - Get specific version
// =============================================================================
router.get('/version/:version', async (req, res) => {
    try {
        const version = req.params.version;
        const data = await configService.getVersion(version);

        if (!data) {
            return res.status(404).json({ success: false, error: 'Version not found' });
        }

        res.json({
            success: true,
            ...data
        });

    } catch (error) {
        logger.error('Get config version failed:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// =============================================================================
// POST /api/config/rollback - Rollback to previous version
// =============================================================================
router.post('/rollback', async (req, res) => {
    try {
        const { target_version, created_by } = req.body;

        if (!target_version) {
            return res.status(400).json({ success: false, error: 'target_version is required' });
        }

        const result = await configService.rollbackToVersion(
            target_version,
            created_by || req.user?.email || 'api_user'
        );

        if (!result.success) {
            return res.status(400).json(result);
        }

        res.json(result);

    } catch (error) {
        logger.error('Rollback config failed:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// =============================================================================
// POST /api/config/reload - Force reload config from database (cache invalidation)
// =============================================================================
router.post('/reload', async (req, res) => {
    try {
        logger.info('[CONFIG] Reload requested via API');

        const result = await configService.reloadConfig();

        res.json({
            success: true,
            version: result.version,
            source: result.source,
            loadedAt: result.loadedAt,
            message: 'Config reloaded successfully'
        });

    } catch (error) {
        logger.error('Reload config failed:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// =============================================================================
// GET /api/config/status - Get current config status (version, source, etc.)
// =============================================================================
router.get('/status', async (req, res) => {
    try {
        res.json({
            success: true,
            version: configService.getCachedVersion(),
            source: configService.getConfigSource(),
            loadedAt: configService.getConfigLoadedAt()
        });

    } catch (error) {
        logger.error('Get config status failed:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});


// =============================================================================
// GET /api/config/export - Export package for AI review
// =============================================================================
router.get('/export', async (req, res) => {
    try {
        // 1. Get current config
        const configData = await configService.loadConfig();

        // 2. Get latest backtest summary (if available)
        let backtestSummary = null;
        try {
            const scoreboardService = require('../backtest/scoreboardService');
            const scoreboard = await scoreboardService.getScoreboardSummary();
            if (scoreboard.success) {
                backtestSummary = {
                    total_states: scoreboard.totalStates,
                    labeled_states: scoreboard.labeledStates,
                    overall_accuracy: scoreboard.overallAccuracy,
                    directional_accuracy: scoreboard.directionalAccuracy,
                    wait_correctness_rate: scoreboard.waitCorrectnessRate,
                    is_confidence_calibrated: scoreboard.isConfidenceCalibrated
                };
            }
        } catch (e) {
            logger.warn('Could not load backtest summary for export:', e.message);
        }

        // 3. Get failed signal examples (if available)
        let failedExamples = [];
        try {
            const client = stateStorage.getSupabase();
            if (client) {
                const { data } = await client
                    .from('replay_states')
                    .select('*')
                    .eq('outcome_label', 'REVERSAL')
                    .order('created_at', { ascending: false })
                    .limit(10);

                if (data) {
                    failedExamples = data.map(s => ({
                        timestamp: s.timestamp,
                        timeframe: s.timeframe || '4h',
                        bias: s.bias,
                        confidence: s.confidence,
                        outcome: s.outcome_label,
                        regime: s.primary_regime || s.regime_state,
                        scenario: s.exchange_scenario,
                        move_pct: s.move_pct,
                        mfe_pct: s.mfe_pct,
                        mae_pct: s.mae_pct
                    }));
                }
            }
        } catch (e) {
            logger.warn('Could not load failed examples for export:', e.message);
        }

        // 4. Build export package
        const exportPackage = {
            export_meta: {
                exported_at: new Date().toISOString(),
                purpose: 'AI config review and optimization'
            },
            current_config: configData.config,
            config_version: configData.version,
            latest_backtest_summary: backtestSummary,
            failed_signal_examples: failedExamples,
            notes: [
                'AI may only propose changes to config values, not code',
                'Max delta limits: weights ±25%, thresholds ±15%, gates ±10%, penalties ±15%',
                'Weights must sum to 1.0',
                'Proposals must use the structured JSON format'
            ]
        };

        res.json({
            success: true,
            export: exportPackage
        });

    } catch (error) {
        logger.error('Export config failed:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// =============================================================================
// POST /api/config/import - Import AI proposal
// =============================================================================
router.post('/import', async (req, res) => {
    try {
        const { proposal } = req.body;

        if (!proposal) {
            return res.status(400).json({ success: false, error: 'Proposal is required' });
        }

        // Validate proposal schema
        const schemaErrors = validateProposalSchema(proposal);
        if (schemaErrors.length > 0) {
            return res.status(400).json({
                success: false,
                error: 'Invalid proposal schema',
                schema_errors: schemaErrors
            });
        }

        // Check version match
        const currentConfig = await configService.loadConfig();
        if (proposal.proposal_meta.based_on_config_version !== currentConfig.version) {
            return res.status(409).json({
                success: false,
                error: 'Version mismatch',
                message: `Proposal is based on version ${proposal.proposal_meta.based_on_config_version}, but current is ${currentConfig.version}`,
                current_version: currentConfig.version,
                proposal_version: proposal.proposal_meta.based_on_config_version
            });
        }

        // Apply changes to current config to create proposed config
        const proposedConfig = JSON.parse(JSON.stringify(currentConfig.config));
        const appliedChanges = [];
        const skippedChanges = [];

        for (const change of proposal.changes) {
            try {
                applyChange(proposedConfig, change.param_path, change.proposed_value);
                appliedChanges.push(change);
            } catch (e) {
                skippedChanges.push({ ...change, error: e.message });
            }
        }

        // Validate the resulting config
        const validation = configService.validateConfig(proposedConfig);
        const deltaValidation = configService.validateDelta(currentConfig.config, proposedConfig);

        res.json({
            success: true,
            proposed_config: proposedConfig,
            applied_changes: appliedChanges.length,
            skipped_changes: skippedChanges,
            validation: {
                valid: validation.valid && deltaValidation.valid,
                structure_errors: validation.errors,
                structure_warnings: validation.warnings,
                delta_violations: deltaValidation.violations
            }
        });

    } catch (error) {
        logger.error('Import proposal failed:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function validateProposalSchema(proposal) {
    const errors = [];

    // Check required fields
    if (!proposal.proposal_meta) {
        errors.push('Missing proposal_meta');
    } else {
        if (!proposal.proposal_meta.based_on_config_version) {
            errors.push('Missing proposal_meta.based_on_config_version');
        }
        if (proposal.proposal_meta.scope !== 'config-only') {
            errors.push('proposal_meta.scope must be "config-only"');
        }
    }

    if (!proposal.changes || !Array.isArray(proposal.changes)) {
        errors.push('Missing or invalid changes array');
    } else {
        for (let i = 0; i < proposal.changes.length; i++) {
            const change = proposal.changes[i];
            if (!change.param_path) {
                errors.push(`Change ${i}: missing param_path`);
            }
            if (change.proposed_value === undefined) {
                errors.push(`Change ${i}: missing proposed_value`);
            }
        }
    }

    return errors;
}

function applyChange(config, path, value) {
    const parts = path.split('.');
    let current = config;

    for (let i = 0; i < parts.length - 1; i++) {
        if (!current[parts[i]]) {
            throw new Error(`Path not found: ${parts.slice(0, i + 1).join('.')}`);
        }
        current = current[parts[i]];
    }

    const lastKey = parts[parts.length - 1];
    if (current[lastKey] === undefined) {
        throw new Error(`Key not found: ${path}`);
    }

    current[lastKey] = value;
}

// =============================================================================
// GET /api/config/code-snippet - Fetch code lines from a file
// =============================================================================
const fs = require('fs');
const path = require('path');

router.get('/code-snippet', async (req, res) => {
    try {
        const { file, startLine, endLine } = req.query;

        if (!file) {
            return res.status(400).json({ success: false, error: 'file parameter is required' });
        }

        // Security: Only allow specific files in src/services
        const allowedFiles = [
            'marketMetrics.js',
            'marketDataService.js',
            'stateStorage.js',
            'alertService.js',
            'configService.js'
        ];

        const fileName = path.basename(file);
        if (!allowedFiles.includes(fileName)) {
            return res.status(403).json({ success: false, error: 'File not allowed' });
        }

        // Resolve file path
        const filePath = path.join(__dirname, '..', 'services', fileName);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ success: false, error: 'File not found' });
        }

        // Read file
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');

        // Parse line range
        let start = parseInt(startLine) || 1;
        let end = parseInt(endLine) || lines.length;

        // Clamp to valid range
        start = Math.max(1, Math.min(start, lines.length));
        end = Math.max(start, Math.min(end, lines.length));

        // Extract lines (1-indexed to 0-indexed)
        const snippet = lines.slice(start - 1, end);

        res.json({
            success: true,
            file: fileName,
            startLine: start,
            endLine: end,
            totalLines: end - start + 1,
            code: snippet.join('\n')
        });

    } catch (error) {
        logger.error('Get code snippet failed:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// =============================================================================
// EXPORTS
// =============================================================================

module.exports = router;
