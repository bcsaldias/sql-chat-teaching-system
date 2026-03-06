module.exports = {
  apps: [
    {
      name: "info330",
      script: "src/server.js",
      cwd: __dirname + "/../..",
      env_file: ".env",
      env: {
        NODE_ENV: "development"
      },
      env_production: {
        NODE_ENV: "production"
      },
      autorestart: true,
      watch: false
    }
  ]
};
