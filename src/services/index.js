// src/services/index.js
const marketDataService = require('./marketDataService');
const marketMetrics = require('./marketMetrics');
const alertService = require('./alertService');
const llmExplainer = require('./llmExplainer');
const stateStorage = require('./stateStorage');
// Stage 2: Outcome Labeling
const outcomeLabeler = require('./outcomeLabeler');

module.exports = {
  marketDataService,
  marketMetrics,
  alertService,
  llmExplainer,
  stateStorage,
  // Stage 2
  outcomeLabeler
};
