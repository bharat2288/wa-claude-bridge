// PM2 ecosystem config for wa-claude
// Start:   npx pm2 start ecosystem.config.cjs
// Logs:    npx pm2 logs wa-claude
// Status:  npx pm2 status
// Restart: npx pm2 restart wa-claude
// Stop:    npx pm2 stop wa-claude

module.exports = {
  apps: [{
    name: 'wa-claude',
    script: 'server.js',
    cwd: 'C:/Users/bhara/dev/wa-claude',

    // Auto-restart on crash, with exponential backoff
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s',
    restart_delay: 3000,

    // Watch for file changes (disabled — use `npx pm2 restart` manually)
    watch: false,

    // Logging
    error_file: 'logs/pm2-error.log',
    out_file: 'logs/pm2-out.log',
    merge_logs: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss',

    // Environment
    env: {
      NODE_ENV: 'production',
    },
  }],
};
