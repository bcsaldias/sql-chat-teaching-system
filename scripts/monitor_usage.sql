-- 1) Active vs idle connections (overall)
select
    state,
    count(*)
from
    pg_stat_activity
where
    datname is not null
group by
    state
order by
    count(*) desc;

-- 2) Connections by database + state
select
    datname,
    state,
    count(*)
from
    pg_stat_activity
group by
    datname,
    state
order by
    datname,
    count(*) desc;

-- 3) Idle connections older than N minutes
select
    pid,
    usename,
    datname,
    state,
    state_change
from
    pg_stat_activity
where
    state = 'idle'
    and state_change < now() - interval '5 minutes'
order by
    state_change asc;

-- 4) Long‑running queries
select
    pid,
    usename,
    datname,
    state,
    now() - query_start as runtime,
    query
from
    pg_stat_activity
where
    state = 'active'
    and query_start < now() - interval '30 seconds'
order by
    runtime desc;

-- 5) Current connection limit
show max_connections;

-- 5) current connections
select
    datname,
    count(*) as total_connections,
    sum(
        case
            when state = 'idle' then 1
            else 0
        end
    ) as idle_connections
from
    pg_stat_activity
where
    datname is not null
group by
    datname
order by
    total_connections desc;

-- 
-- 1) Reset a stuck/idle Postgres session (SQL‑level)
select
    pid,
    usename,
    datname,
    state,
    state_change,
    query
from
    pg_stat_activity
where
    state in ('idle', 'idle in transaction', 'active')
order by
    state_change asc;

select
    pg_terminate_backend(< pid >);

-- 1) Restart the Postgres service (server‑level)
-- This drops all connections and forces reconnects.
sudo systemctl restart postgresql sudo service postgresql restart -- 2) Terminate all connections for a database (SQL‑level)
select
    pg_terminate_backend(pid)
from
    pg_stat_activity
where
    datname = 'your_db_name'
    and pid <> pg_backend_pid();

-- 3) Terminate all idle sessions only
select
    pg_terminate_backend(pid)
from
    pg_stat_activity
where
    datname = 'your_db_name'
    and state = 'idle'
    and pid <> pg_backend_pid();