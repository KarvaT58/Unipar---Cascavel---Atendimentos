module.exports = {
  apps: [
    {
      name: "unipar-atendimentos",
      script: "node_modules/next/dist/bin/next",
      args: "start --hostname 127.0.0.1 --port 3000",
      cwd: __dirname,
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "768M",
      exp_backoff_restart_delay: 1000,
      env: {
        NODE_ENV: "production",
        PORT: "3000",
      },
    },
  ],
}
