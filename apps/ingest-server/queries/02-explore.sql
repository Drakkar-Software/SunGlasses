-- Explore SunGlasses events stored as Parquet on S3.
-- Run 01-setup.sql first to configure httpfs and S3 credentials.
--
-- Usage:
--   duckdb < queries/02-explore.sql
--   -- or interactively in the DuckDB CLI after .read queries/01-setup.sql
--
-- Replace 'my-analytics-bucket/events' with your S3_BUCKET/S3_PREFIX values.

-- ---------------------------------------------------------------------------
-- Convenience macro: references all Parquet files under the events prefix.
-- hive_partitioning=true auto-reads the dt= directory names as a column.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE MACRO events() AS TABLE
  SELECT * FROM read_parquet(
    's3://my-analytics-bucket/events/**/*.parquet',
    hive_partitioning = true
  );

-- ---------------------------------------------------------------------------
-- 1. Total event count
-- ---------------------------------------------------------------------------

SELECT count(*) AS total_events FROM events();

-- ---------------------------------------------------------------------------
-- 2. Event volume by type (last 30 days)
-- ---------------------------------------------------------------------------

SELECT
  event,
  event_type,
  count(*)     AS total,
  count(DISTINCT anonymous_id) AS unique_devices
FROM events()
WHERE dt >= (current_date - INTERVAL '30 days')::VARCHAR
GROUP BY event, event_type
ORDER BY total DESC
LIMIT 20;

-- ---------------------------------------------------------------------------
-- 3. Screen views — top paths
-- ---------------------------------------------------------------------------

SELECT
  json_extract_string(properties, '$.$$path') AS path,
  count(*)                                     AS views,
  count(DISTINCT anonymous_id)                 AS unique_devices
FROM events()
WHERE event = '$screen'
GROUP BY path
ORDER BY views DESC
LIMIT 20;

-- ---------------------------------------------------------------------------
-- 4. Error events — top error types
-- ---------------------------------------------------------------------------

SELECT
  json_extract_string(properties, '$.$error_type')  AS error_type,
  json_extract_string(properties, '$.$error_level') AS level,
  count(*)                                           AS occurrences,
  count(DISTINCT anonymous_id)                       AS affected_devices
FROM events()
WHERE event = '$error'
GROUP BY error_type, level
ORDER BY occurrences DESC
LIMIT 20;

-- ---------------------------------------------------------------------------
-- 5. Daily Active Users (unique anonymous_id per day)
-- ---------------------------------------------------------------------------

SELECT
  dt,
  count(DISTINCT anonymous_id) AS dau
FROM events()
GROUP BY dt
ORDER BY dt DESC
LIMIT 30;

-- ---------------------------------------------------------------------------
-- 6. Retention cohort: users who captured any event on day 0 and day 7
--    (approximate — uses anonymous_id, which resets on client.reset())
-- ---------------------------------------------------------------------------

WITH first_seen AS (
  SELECT
    anonymous_id,
    min(dt) AS first_dt
  FROM events()
  GROUP BY anonymous_id
),
day7 AS (
  SELECT DISTINCT e.anonymous_id
  FROM events() e
  JOIN first_seen f ON e.anonymous_id = f.anonymous_id
  WHERE DATEDIFF('day', f.first_dt::DATE, e.dt::DATE) = 7
)
SELECT
  f.first_dt            AS cohort_date,
  count(f.anonymous_id) AS cohort_size,
  count(d.anonymous_id) AS retained_day7,
  round(100.0 * count(d.anonymous_id) / count(f.anonymous_id), 1) AS day7_retention_pct
FROM first_seen f
LEFT JOIN day7 d ON f.anonymous_id = d.anonymous_id
GROUP BY f.first_dt
ORDER BY f.first_dt DESC
LIMIT 30;
