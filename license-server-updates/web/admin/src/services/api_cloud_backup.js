// ============================================================
// Cloud Backup admin API functions
// Add these exports to /opt/proxpanel-license/web/admin/src/services/api.js
// ============================================================
//
// Option A — paste the functions below into api.js before "export default api"
// Option B — import this file in CloudBackups.jsx directly:
//            import { getCloudBackups, getCloudBackupUsage, deleteCloudBackup, adminDeleteCloudBackup, setCloudStorageTier } from '../services/api_cloud_backup'
// ============================================================

import api from './api'

// ---- Customer-facing (called by ProxPanel installations via license key) ----
// These are here for completeness; the admin UI only uses the admin endpoints below.

/** Upload a backup archive (multipart/form-data, field: "file", optional field: "type") */
export const uploadCloudBackup = (licenseKey, formData) =>
  api.post('/license/cloud-backup/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
      'X-License-Key': licenseKey,
    },
  })

/** List all backups for the authenticated license */
export const listCloudBackups = (licenseKey) =>
  api.get('/license/cloud-backup/list', {
    headers: { 'X-License-Key': licenseKey },
  })

/** Get storage usage for the authenticated license */
export const getCloudBackupUsage = (licenseKey) =>
  api.get('/license/cloud-backup/usage', {
    headers: { 'X-License-Key': licenseKey },
  })

/** Download a single backup by ID */
export const downloadCloudBackup = (licenseKey, backupId) =>
  api.get(`/license/cloud-backup/download/${backupId}`, {
    headers: { 'X-License-Key': licenseKey },
    responseType: 'blob',
  })

/** Delete a backup (customer-initiated) */
export const deleteCloudBackup = (licenseKey, backupId) =>
  api.delete(`/license/cloud-backup/${backupId}`, {
    headers: { 'X-License-Key': licenseKey },
  })

// ---- Admin endpoints (JWT authenticated, used by the admin UI) ----

/**
 * List ALL cloud backups across all licenses.
 * @param {number} page   - 1-based page number
 * @param {number} limit  - records per page (default 20)
 * @param {string} search - optional license key or customer name filter
 */
export const getCloudBackups = (page = 1, limit = 20, search = '') =>
  api.get('/admin/cloud-backups', { params: { page, limit, search } })

/**
 * Delete a specific backup from the admin panel.
 * @param {string|number} backupId
 */
export const adminDeleteCloudBackup = (backupId) =>
  api.delete(`/admin/cloud-backups/${backupId}`)

/**
 * Set the cloud storage tier for a license.
 * @param {string|number} licenseId
 * @param {string} tier  - one of: "free" | "basic" | "pro" | "enterprise"
 */
export const setCloudStorageTier = (licenseId, tier) =>
  api.put(`/admin/licenses/${licenseId}/cloud-tier`, { tier })
