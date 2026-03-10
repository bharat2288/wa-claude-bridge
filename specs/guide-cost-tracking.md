---
type: guide
project: wa-claude
date: 2026-03-06
---
# [[wa-claude-home|WA Claude]] — Guide: Cost Tracking
*[[dev-hub|Hub]]*
> Related: [[design]]

wa-claude tracks all Claude API usage and provides detailed cost reports via WhatsApp.

## How It Works

Every time a Claude query completes, the cost tracker logs:
- **Timestamp**: When the query finished
- **Project**: Which project the query was for
- **Turns**: Number of agentic turns (API round-trips)
- **Cost**: Total USD cost returned by the Claude Agent SDK

All data is stored in `data/cost-log.json` (gitignored, not synced).

## Commands

### `/cost` — Today's usage (default)
Shows queries, turns, and cost for today only.

```
💰 Cost Report

Today (2026-02-23)
Queries: 12
Turns: 48
Cost: $0.3456
```

### `/cost week` — Last 7 days
Shows weekly total plus daily breakdown.

```
💰 Cost Report

Last 7 Days
Queries: 87
Turns: 342
Cost: $2.4567

Daily breakdown:
• 2026-02-23: $0.3456 (12q, 48t)
• 2026-02-22: $0.4201 (15q, 63t)
• 2026-02-21: $0.2890 (9q, 31t)
...
```

### `/cost month` — Current month
Shows total for the current calendar month plus daily average.

```
💰 Cost Report

This Month (2026-02)
Days: 23
Queries: 456
Turns: 1823
Cost: $12.3456
Avg/day: $0.5368
```

### `/cost all` — All-time summary
Shows total cost and top 5 projects by spending.

```
💰 Cost Report

All Time
Total Cost: $87.6543

Top 5 Projects:
• scholia: $23.4567 (89q)
• wa-claude: $18.9012 (134q)
• tweet-db: $15.6789 (67q)
• reader3: $12.3456 (45q)
• misc: $8.9012 (23q)
```

## Typical Costs

Based on Claude Sonnet 4.5 pricing ($3/M input, $15/M output):

| Task Type | Example | Typical Cost |
|-----------|---------|--------------|
| Simple question | "what's in this file?" | ~$0.01 |
| Code edit | "fix the bug in parseMessage" | ~$0.03-0.05 |
| Multi-file task | "add auth to the API" | ~$0.80-1.50 |
| Complex refactor | "redesign the session manager" | ~$2.00-5.00 |

**Estimated daily usage (moderate):**
- 20 simple questions: $0.20
- 5 code edits: $0.20
- 1 complex task: $1.00
- **Total: ~$1.40/day or ~$40/month**

## Data Persistence

Cost logs are stored in `data/cost-log.json`:

```json
{
  "queries": [
    {
      "timestamp": "2026-02-23T12:34:56.789Z",
      "date": "2026-02-23",
      "project": "wa-claude",
      "turns": 5,
      "cost": 0.0456
    }
  ],
  "dailyTotals": {
    "2026-02-23": {
      "queries": 12,
      "turns": 48,
      "cost": 0.3456
    }
  },
  "totalCost": 87.6543
}
```

**Important:** This file is gitignored and will NOT be backed up or synced. If you want to preserve cost history:
1. Copy `data/cost-log.json` to a backup location
2. Or export the data periodically (manual process)

## Implementation

The cost tracker is integrated into the session manager:

1. **ClaudeSession** emits `done` event with `{ turns, cost }` from SDK
2. **SessionManager** calls `costTracker.recordQuery(projectName, { turns, cost })`
3. **CostTracker** updates JSON log and daily/monthly aggregates
4. **CommandRouter** handles `/cost [period]` → calls `costTracker.formatReport()`

See `src/cost-tracker.js` for implementation details.

## Testing

To test the cost tracker without hitting the API:

```bash
node scripts/test-cost-tracker.js
```

This simulates 5 queries with varying costs and shows all report formats.
