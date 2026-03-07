
### sanityChecks

This section captures quick, low-risk checks we add to the grading workflow to confirm database schema and query shape before running deeper tests. The goal is to catch missing tables/columns early with a fast, non-destructive query.

#### Running Sanity Checks

The sanity checks are implemented in the server code at [src/server.js#L987](src/server.js#L987).

In the grading workflow, run these checks first to verify schema integrity before proceeding to deeper tests.

Sanity checks look like this, depending on what's expected in each milestone, some of them will be commented out when re-deploying the version for that milestone.

As you see, these sanityChecks only check for the presence of referential constraints, since other column names are flexible.
```
    const sanityChecks = [
      // MILESTONE 2
      `select ${usersPkCol}, ${passwordCol} from users limit 0;`,
      `select ${channelsPkCol}, ${channelsNameCol}, ${channelsDescCol} from channels limit 0;`,
      `select ${usersFkCol}, ${channelsFkCol} from channel_members limit 0;`,
      // MILESTONE 3
      `select ${messagesUserFkCol}, ${messagesChannelFkCol} from ${messagesTable} limit 0;`,
    ];
```

### CTE sequencing (channels_list)

Before the course teaches CTEs, keep `SQL_CONTRACT.channels_list.firstWords` set to `["select"]` so the frontend expects a `SELECT` start. Once CTEs are covered in lecture, update it to `["with", "select"]` to allow `WITH` queries.

### superuser

in .env set after milestone 1:
```
+ALLOW_SUPERUSER_MODE=false
```
