// tests/testOpenAIAnalysis.js
// Test script to verify OpenAI integration works

require('dotenv').config();
const marketDataService = require('../src/services/marketDataService');
const marketMetrics = require('../src/services/marketMetrics');
const aiAdvisor = require('../src/services/aiAdvisor');

async function testFullPipeline() {
  console.log('🧪 Testing Full Analysis Pipeline with OpenAI\n');
  console.log('═══════════════════════════════════════════════════════\n');

  try {
    // Step 1: Test Coinglass data fetch
    console.log('1️⃣ Testing Coinglass API...');
    const { snapshot, history } = await marketDataService.getFuturesMarketData('BTCUSDT', {
      includeHistory: true,
      timeframes: ['4h', '1d']
    });
    
    if (!snapshot || !snapshot.Binance) {
      throw new Error('Failed to fetch Coinglass data');
    }
    
    console.log('✅ Coinglass data fetched successfully');
    console.log(`   BTC Price: $${snapshot.Binance['4h'].price}`);
    console.log(`   OI: $${(snapshot.Binance['4h'].oi / 1e9).toFixed(2)}B\n`);

    // Step 2: Test metrics calculation
    console.log('2️⃣ Testing Market Metrics calculation...');
    const metrics = marketMetrics.calculateMarketMetrics(snapshot, history);
    
    if (!metrics || !metrics.exchangeDivergence) {
      throw new Error('Failed to calculate metrics');
    }
    
    console.log('✅ Metrics calculated successfully');
    console.log(`   Exchange Divergence: ${metrics.exchangeDivergence.scenario}`);
    console.log(`   Market Regime: ${metrics.marketRegime.regime}`);
    console.log(`   Final Decision: ${metrics.finalDecision.bias} (${metrics.finalDecision.confidence}/10)\n`);

    // Step 3: Test OpenAI integration
    console.log('3️⃣ Testing OpenAI AI Analysis...');
    
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY not found in environment variables!');
    }
    
    console.log('   API Key found: ' + process.env.OPENAI_API_KEY.substring(0, 10) + '...\n');
    
    const aiInsight = await aiAdvisor.getAiMarketInsight({
      snapshot,
      metrics,
      history
    });
    
    if (aiInsight.error) {
      throw new Error(`OpenAI error: ${aiInsight.message || aiInsight.error}`);
    }
    
    console.log('✅ OpenAI analysis completed successfully\n');
    console.log('═══════════════════════════════════════════════════════');
    console.log('📊 AI ANALYSIS RESULTS:');
    console.log('═══════════════════════════════════════════════════════\n');
    
    console.log(`🎯 Final Bias: ${aiInsight.final_bias}`);
    console.log(`📈 Confidence: ${aiInsight.confidence}/10`);
    console.log(`🏛️ Market Mode: ${aiInsight.market_mode || 'N/A'}`);
    console.log(`📌 Price/OI State: ${aiInsight.price_oi_state || 'N/A'}`);
    console.log(`\n📝 Summary:\n${aiInsight.summary}\n`);
    
    if (aiInsight.reasoning) {
      console.log('🧠 Reasoning:');
      console.log(`   Price/OI: ${aiInsight.reasoning.price_oi_pattern}`);
      console.log(`   CVD: ${aiInsight.reasoning.cvd_signal}`);
      console.log(`   Funding: ${aiInsight.reasoning.funding_state}`);
      console.log(`   Whales: ${aiInsight.reasoning.whale_activity}\n`);
    }
    
    if (aiInsight.golden_rules_triggered && aiInsight.golden_rules_triggered.length > 0) {
      console.log('⭐ Golden Rules Triggered:');
      aiInsight.golden_rules_triggered.forEach((rule, idx) => {
        console.log(`   ${idx + 1}. ${rule}`);
      });
      console.log('');
    }
    
    if (aiInsight.key_signals && aiInsight.key_signals.length > 0) {
      console.log('🔑 Key Signals:');
      aiInsight.key_signals.forEach((signal, idx) => {
        console.log(`   ${idx + 1}. ${signal}`);
      });
      console.log('');
    }
    
    if (aiInsight.risk_warnings && aiInsight.risk_warnings.length > 0) {
      console.log('⚠️  Risk Warnings:');
      aiInsight.risk_warnings.forEach((warning, idx) => {
        console.log(`   ${idx + 1}. ${warning}`);
      });
      console.log('');
    }
    
    if (aiInsight.entry_zones) {
      console.log('🎯 Entry Zones:');
      
      if (aiInsight.entry_zones.long_setups && aiInsight.entry_zones.long_setups.length > 0) {
        console.log('   LONGS:');
        aiInsight.entry_zones.long_setups.forEach(setup => {
          console.log(`   → ${setup.zone} (${setup.confidence})`);
          console.log(`     ${setup.reason}`);
        });
      }
      
      if (aiInsight.entry_zones.short_setups && aiInsight.entry_zones.short_setups.length > 0) {
        console.log('\n   SHORTS:');
        aiInsight.entry_zones.short_setups.forEach(setup => {
          console.log(`   → ${setup.zone} (${setup.confidence})`);
          console.log(`     ${setup.reason}`);
        });
      }
      console.log('');
    }
    
    if (aiInsight.action_plan) {
      console.log('💡 Action Plan:');
      console.log(`   Primary: ${aiInsight.action_plan.primary}`);
      console.log(`   Risk Level: ${aiInsight.action_plan.risk_level}`);
      console.log(`   Position Sizing: ${aiInsight.action_plan.position_sizing}`);
      if (aiInsight.action_plan.key_levels && aiInsight.action_plan.key_levels.length > 0) {
        console.log(`   Key Levels: ${aiInsight.action_plan.key_levels.join(', ')}`);
      }
      if (aiInsight.action_plan.avoid) {
        console.log(`   ❌ Avoid: ${aiInsight.action_plan.avoid}`);
      }
      console.log('');
    }
    
    if (aiInsight.scenarios) {
      console.log('🎲 Scenarios:');
      if (aiInsight.scenarios.bullish) {
        console.log(`   📈 Bullish (${aiInsight.scenarios.bullish.probability}):`);
        console.log(`      Trigger: ${aiInsight.scenarios.bullish.trigger}`);
        console.log(`      Target: ${aiInsight.scenarios.bullish.target}`);
      }
      if (aiInsight.scenarios.bearish) {
        console.log(`   📉 Bearish (${aiInsight.scenarios.bearish.probability}):`);
        console.log(`      Trigger: ${aiInsight.scenarios.bearish.trigger}`);
        console.log(`      Target: ${aiInsight.scenarios.bearish.target}`);
      }
      console.log('');
    }
    
    console.log('═══════════════════════════════════════════════════════');
    console.log('✅ ALL TESTS PASSED! System is ready for deployment.\n');
    
    // Save full output to file for inspection
    const fs = require('fs');
    const output = {
      timestamp: new Date().toISOString(),
      snapshot,
      metrics,
      aiInsight
    };
    
    fs.writeFileSync(
      './test-output.json',
      JSON.stringify(output, null, 2)
    );
    
    console.log('📄 Full output saved to: test-output.json');
    console.log('   Review this file to see the complete data structure\n');

  } catch (error) {
    console.error('\n❌ TEST FAILED:');
    console.error(error.message);
    console.error('\nStack trace:', error.stack);
    process.exit(1);
  }
}

// Run the test
testFullPipeline();
