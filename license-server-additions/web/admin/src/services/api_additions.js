// ============================================================================
// Cloud Backup Admin API additions for api.js
// ============================================================================
//
// INSTRUCTIONS:
//   Open /opt/proxpanel-license/web/admin/src/services/api.js and append
//   the code below at the END of the file (after the last export).
//
// The `api` axios instance is already defined at the top of that file —
// these functions reuse it exactly as the other exports do.
// ============================================================================

// Cloud Backup Admin API
export const cloudBackupAdminApi = {
  /**
   * List all licenses with cloud storage usage.
   * GET /api/v1/admin/cloud-backups
   * Response: {
   *   success, total_customers, total_used_bytes, total_used_formatted,
   *   customers: [{ license_id, license_key, customer_name,
   *                 used_bytes, quota_bytes, backup_count, tier, last_upload }]
   * }
   */
  list: () => api.get('/admin/cloud-backups'),

  /**
   * List all backups for a specific license (any status).
   * GET /api/v1/admin/cloud-backups/:licenseId
   * Response: {
   *   success,
   *   backups: [{ id, backup_id, filename, size_bytes, status,
   *               created_at, expires_at, download_count, last_downloaded }]
   * }
   */
  listForLicense: (licenseId) => api.get(`/admin/cloud-backups/${licenseId}`),

  /**
   * Set the storage quota for a license.
   * PUT /api/v1/admin/licenses/:licenseId/quota
   * Body: { quota_bytes: number }   — pass raw bytes
   *   OR  { quota_mb: number }      — convenience in MB
   * Response: { success, message, license_id, quota_bytes, quota_formatted }
   */
  setQuota: (licenseId, quotaBytes) =>
    api.put(`/admin/licenses/${licenseId}/quota`, { quota_bytes: quotaBytes }),

  /**
   * Admin-level deletion of a single backup by backup_id.
   * DELETE /api/v1/admin/cloud-backups/backup/:backupId
   * Response: { success, message }
   */
  deleteBackup: (backupId) => api.delete(`/admin/cloud-backups/backup/${backupId}`),
}
