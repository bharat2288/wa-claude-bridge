// Cost tracker — logs API usage and provides daily summaries
//
// Responsibilities:
// - Log each query's cost to a JSON file
// - Track daily/monthly totals
// - Provide summary reports via /cost command

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const DATA_DIR = join(process.cwd(), 'data');
const COST_LOG_PATH = join(DATA_DIR, 'cost-log.json');

export class CostTracker {
  constructor() {
    this._ensureDataDir();
    this._log = this._loadLog();
  }

  /**
   * Record a completed query's cost.
   */
  recordQuery(projectName, { turns, cost }) {
    const timestamp = new Date().toISOString();
    const date = timestamp.split('T')[0]; // YYYY-MM-DD

    const entry = {
      timestamp,
      date,
      project: projectName,
      turns,
      cost: cost || 0,
    };

    this._log.queries.push(entry);

    // Update daily totals
    if (!this._log.dailyTotals[date]) {
      this._log.dailyTotals[date] = { queries: 0, turns: 0, cost: 0 };
    }
    this._log.dailyTotals[date].queries++;
    this._log.dailyTotals[date].turns += turns || 0;
    this._log.dailyTotals[date].cost += cost || 0;

    // Update all-time total
    this._log.totalCost += cost || 0;

    this._saveLog();

    console.log(`[cost] Recorded: ${projectName} — ${turns} turns, $${cost?.toFixed(4) || '0.0000'}`);
  }

  /**
   * Get today's summary.
   */
  getTodaySummary() {
    const today = new Date().toISOString().split('T')[0];
    const data = this._log.dailyTotals[today];

    if (!data) {
      return {
        date: today,
        queries: 0,
        turns: 0,
        cost: 0,
      };
    }

    return {
      date: today,
      queries: data.queries,
      turns: data.turns,
      cost: data.cost,
    };
  }

  /**
   * Get last N days of summaries.
   */
  getRecentDays(days = 7) {
    const dates = Object.keys(this._log.dailyTotals).sort().reverse().slice(0, days);
    return dates.map(date => ({
      date,
      ...this._log.dailyTotals[date],
    }));
  }

  /**
   * Get current month summary.
   */
  getMonthSummary() {
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const daysInMonth = Object.keys(this._log.dailyTotals)
      .filter(date => date.startsWith(month));

    const totals = daysInMonth.reduce((acc, date) => {
      const day = this._log.dailyTotals[date];
      acc.queries += day.queries;
      acc.turns += day.turns;
      acc.cost += day.cost;
      return acc;
    }, { queries: 0, turns: 0, cost: 0 });

    return {
      month,
      days: daysInMonth.length,
      ...totals,
    };
  }

  /**
   * Get all-time total cost.
   */
  getTotalCost() {
    return this._log.totalCost;
  }

  /**
   * Get top projects by cost (all time).
   */
  getTopProjects(limit = 5) {
    const projectTotals = {};

    for (const query of this._log.queries) {
      if (!projectTotals[query.project]) {
        projectTotals[query.project] = { queries: 0, turns: 0, cost: 0 };
      }
      projectTotals[query.project].queries++;
      projectTotals[query.project].turns += query.turns || 0;
      projectTotals[query.project].cost += query.cost || 0;
    }

    return Object.entries(projectTotals)
      .map(([project, data]) => ({ project, ...data }))
      .sort((a, b) => b.cost - a.cost)
      .slice(0, limit);
  }

  /**
   * Format a cost report for WhatsApp.
   */
  formatReport({ period = 'today' } = {}) {
    let lines = ['*💰 Cost Report*\n'];

    if (period === 'today') {
      const today = this.getTodaySummary();
      lines.push(`*Today* (${today.date})`);
      lines.push(`Queries: ${today.queries}`);
      lines.push(`Turns: ${today.turns}`);
      lines.push(`Cost: $${today.cost.toFixed(4)}`);
    } else if (period === 'week') {
      const days = this.getRecentDays(7);
      const total = days.reduce((acc, day) => ({
        queries: acc.queries + day.queries,
        turns: acc.turns + day.turns,
        cost: acc.cost + day.cost,
      }), { queries: 0, turns: 0, cost: 0 });

      lines.push(`*Last 7 Days*`);
      lines.push(`Queries: ${total.queries}`);
      lines.push(`Turns: ${total.turns}`);
      lines.push(`Cost: $${total.cost.toFixed(4)}`);
      lines.push('');
      lines.push('_Daily breakdown:_');
      for (const day of days) {
        lines.push(`• ${day.date}: $${day.cost.toFixed(4)} (${day.queries}q, ${day.turns}t)`);
      }
    } else if (period === 'month') {
      const month = this.getMonthSummary();
      lines.push(`*This Month* (${month.month})`);
      lines.push(`Days: ${month.days}`);
      lines.push(`Queries: ${month.queries}`);
      lines.push(`Turns: ${month.turns}`);
      lines.push(`Cost: $${month.cost.toFixed(4)}`);
      lines.push(`Avg/day: $${(month.cost / (month.days || 1)).toFixed(4)}`);
    } else if (period === 'all') {
      const total = this.getTotalCost();
      const topProjects = this.getTopProjects(5);

      lines.push(`*All Time*`);
      lines.push(`Total Cost: $${total.toFixed(4)}`);
      lines.push('');
      lines.push('_Top 5 Projects:_');
      for (const proj of topProjects) {
        lines.push(`• ${proj.project}: $${proj.cost.toFixed(4)} (${proj.queries}q)`);
      }
    }

    return lines.join('\n');
  }

  // --- Internal methods ---

  _ensureDataDir() {
    if (!existsSync(DATA_DIR)) {
      mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  _loadLog() {
    if (!existsSync(COST_LOG_PATH)) {
      return {
        queries: [],
        dailyTotals: {},
        totalCost: 0,
      };
    }

    try {
      const data = readFileSync(COST_LOG_PATH, 'utf-8');
      return JSON.parse(data);
    } catch (err) {
      console.error('[cost] Failed to load log, starting fresh:', err.message);
      return {
        queries: [],
        dailyTotals: {},
        totalCost: 0,
      };
    }
  }

  _saveLog() {
    try {
      writeFileSync(COST_LOG_PATH, JSON.stringify(this._log, null, 2), 'utf-8');
    } catch (err) {
      console.error('[cost] Failed to save log:', err.message);
    }
  }
}
