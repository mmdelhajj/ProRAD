-- Add 'cloud' and 'local+cloud' support to backup_schedules storage_type
-- Run this if storage_type has a CHECK constraint

-- Remove old constraint (if exists)
ALTER TABLE backup_schedules DROP CONSTRAINT IF EXISTS backup_schedules_storage_type_check;

-- The storage_type column is VARCHAR, so new values work without migration.
-- If there was a constraint, re-add it with new values:
-- ALTER TABLE backup_schedules ADD CONSTRAINT backup_schedules_storage_type_check
--   CHECK (storage_type IN ('local', 'ftp', 'both', 'cloud', 'local+cloud'));
