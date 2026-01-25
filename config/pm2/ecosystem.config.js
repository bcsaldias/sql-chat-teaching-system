module.exports = {
  apps: [
    {
      name: "info330",
      script: "src/server.js",
      cwd: __dirname + "/../..",
      env: {
        NODE_ENV: "production"
      },
      autorestart: true,
      watch: false
    }
  ]
};
