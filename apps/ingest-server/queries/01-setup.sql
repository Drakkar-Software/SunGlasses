-- Run this once in a DuckDB CLI session before running 02-explore.sql.
-- Loads the httpfs extension and configures S3 credentials.
--
-- Usage:
--   duckdb
--   > .read queries/01-setup.sql

INSTALL httpfs;
LOAD httpfs;

-- Option A: explicit credentials (replace with your values or use env vars)
CREATE OR REPLACE SECRET sg_s3 (
  TYPE     s3,
  KEY_ID   'YOUR_ACCESS_KEY_ID',
  SECRET   'YOUR_SECRET_ACCESS_KEY',
  REGION   'us-east-1'
  -- Add ENDPOINT for MinIO: , ENDPOINT 'localhost:9000', USE_SSL false
);

-- Option B: IAM role / instance profile / ~/.aws/credentials (uncomment to use)
-- CREATE OR REPLACE SECRET sg_s3 (
--   TYPE     s3,
--   PROVIDER credential_chain,
--   REGION   'us-east-1'
-- );

SELECT 'S3 setup complete' AS status;
