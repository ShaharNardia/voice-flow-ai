module.exports = {
  apps: [
    {
      name:          'voiceflow-bridge',
      script:        'index.js',
      cwd:           '/opt/voiceflow/sip-bridge',
      instances:     1,          // Single instance — ARI is stateful per call
      autorestart:   true,
      watch:         false,
      max_memory_restart: '256M',
      env: {
        NODE_ENV: 'production',
      },
      // Restart on crash after 5s, then back-off to 30s
      restart_delay: 5000,
      exp_backoff_restart_delay: 100,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: '/var/log/voiceflow/bridge-error.log',
      out_file:   '/var/log/voiceflow/bridge-out.log',
      merge_logs:  true,
    },
  ],
};
