// Test script for cost tracker — verifies logging and reporting
//
// Usage: node scripts/test-cost-tracker.js

import { CostTracker } from '../src/cost-tracker.js';

console.log('Testing CostTracker...\n');

const tracker = new CostTracker();

// Simulate some queries
console.log('Recording test queries...');
tracker.recordQuery('wa-claude', { turns: 3, cost: 0.0234 });
tracker.recordQuery('scholia', { turns: 8, cost: 0.1567 });
tracker.recordQuery('wa-claude', { turns: 2, cost: 0.0089 });
tracker.recordQuery('tweet-db', { turns: 15, cost: 0.8901 });
tracker.recordQuery('wa-claude', { turns: 5, cost: 0.0456 });

console.log('\n--- Today\'s Summary ---');
console.log(tracker.formatReport({ period: 'today' }));

console.log('\n--- Week Summary ---');
console.log(tracker.formatReport({ period: 'week' }));

console.log('\n--- Month Summary ---');
console.log(tracker.formatReport({ period: 'month' }));

console.log('\n--- All Time Summary ---');
console.log(tracker.formatReport({ period: 'all' }));

console.log('\n--- Top Projects ---');
const topProjects = tracker.getTopProjects(5);
for (const proj of topProjects) {
  console.log(`${proj.project}: $${proj.cost.toFixed(4)} (${proj.queries} queries, ${proj.turns} turns)`);
}

console.log('\n✅ Cost tracker test complete');
console.log('Check data/cost-log.json for the persisted data');
