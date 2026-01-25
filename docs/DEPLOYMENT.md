# Deployment

## PM2 (recommended)

From the project root:

```bash
npm install
pm2 start src/server.js --name info330
pm2 save
```

Or, use the ecosystem config:

```bash
pm2 start config/pm2/ecosystem.config.js
pm2 save
```

Note: the ecosystem config sets `watch: false` (recommended for production). Enable watch only for local dev.

Common commands:

```bash
pm2 logs info330
pm2 restart info330
pm2 stop info330
pm2 delete info330
pm2 list
pm2 show info330
```

When you update `src/server.js` or `src/utils.js`, restart the process to pick up changes:

```bash
pm2 restart info330
```

If you want PM2 to start on boot, follow the output of:

```bash
pm2 startup
```

## Environment

- Ensure `.env` is present on the server.
- If you change environment variables, restart the process:

```bash
pm2 restart info330
```

## Notes

- If you move the server entry file, update the PM2 start command accordingly.
