# Backup Storage Types

## Valid values for backup_schedules.storage_type:

| Value | Description |
|-------|-------------|
| `local` | Save backup locally on server only |
| `ftp` | Upload to FTP server only (no local copy) |
| `both` | Save locally AND upload to FTP |
| `cloud` | Upload to ProxPanel Cloud only (no local copy) |
| `local+cloud` | Save locally AND upload to ProxPanel Cloud |

## Cloud Storage Notes:
- Cloud storage requires valid LICENSE_KEY env var
- Default free quota: 500 MB per license
- Files are encrypted before upload (existing encryption is preserved)
- Cloud-only mode deletes local copy after successful upload
