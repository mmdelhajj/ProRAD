-- SSH Password Sync Fix - Database Migration
-- Run on license server database (109.110.185.33)
--
-- This adds the ssh_password column to the license_secrets table
-- so the license server can store and return SSH passwords for customer servers

-- Add ssh_password column if it doesn't exist
ALTER TABLE license_secrets ADD COLUMN IF NOT EXISTS ssh_password VARCHAR(64);

-- Update existing records with generated SSH passwords (optional)
-- Uncomment if you want to generate passwords for existing licenses:
-- UPDATE license_secrets
-- SET ssh_password = md5(random()::text || clock_timestamp()::text)::varchar(16)
-- WHERE ssh_password IS NULL;

-- Verify the change
SELECT
    l.license_key,
    ls.db_password IS NOT NULL as has_db_password,
    ls.redis_password IS NOT NULL as has_redis_password,
    ls.jwt_secret IS NOT NULL as has_jwt_secret,
    ls.encryption_key IS NOT NULL as has_encryption_key,
    ls.ssh_password IS NOT NULL as has_ssh_password
FROM license_secrets ls
JOIN licenses l ON ls.license_id = l.id
LIMIT 5;
