import { useState, useEffect, useMemo } from 'react'
import { cloudBackupAdminApi } from '../services/api'

// ─── byte-formatting helper ───────────────────────────────────────────────────
function fmtBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

// ─── StorageBar ───────────────────────────────────────────────────────────────
function StorageBar({ usedBytes, quotaBytes }) {
  const pct = quotaBytes > 0 ? Math.min(100, (usedBytes / quotaBytes) * 100) : 0
  const color =
    pct >= 90 ? 'bg-red-500' :
    pct >= 70 ? 'bg-yellow-500' :
                'bg-emerald-500'
  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="flex-1 bg-gray-200 rounded-full h-2 overflow-hidden">
        <div className={`h-2 rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-500 whitespace-nowrap">{pct.toFixed(0)}%</span>
    </div>
  )
}

// ─── QuotaModal ───────────────────────────────────────────────────────────────
function QuotaModal({ license, onClose, onSaved }) {
  const [quotaMB, setQuotaMB] = useState(
    license.quota_bytes ? Math.round(license.quota_bytes / (1024 * 1024)) : 500
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const presets = [
    { label: '100 MB', mb: 100 },
    { label: '500 MB', mb: 500 },
    { label: '1 GB',   mb: 1024 },
    { label: '5 GB',   mb: 5120 },
    { label: '10 GB',  mb: 10240 },
    { label: '50 GB',  mb: 51200 },
  ]

  const handleSave = async () => {
    if (!quotaMB || quotaMB <= 0) {
      setError('Quota must be greater than 0')
      return
    }
    setSaving(true)
    setError('')
    try {
      await cloudBackupAdminApi.setQuota(license.license_id, quotaMB * 1024 * 1024)
      onSaved()
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to save quota')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="text-lg font-bold">Set Storage Quota</h2>
            <p className="text-sm text-gray-500">
              {license.license_key} — {license.customer_name}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>

        <div className="mb-4">
          <p className="text-sm text-gray-500 mb-2">Current usage: <strong>{fmtBytes(license.used_bytes)}</strong></p>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            New Quota (MB)
          </label>
          <input
            type="number"
            min="1"
            value={quotaMB}
            onChange={(e) => setQuotaMB(parseInt(e.target.value, 10) || 0)}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-gray-400 mt-1">= {fmtBytes(quotaMB * 1024 * 1024)}</p>
        </div>

        {/* Quick presets */}
        <div className="mb-4">
          <p className="text-xs text-gray-500 mb-1">Quick presets:</p>
          <div className="flex flex-wrap gap-2">
            {presets.map((p) => (
              <button
                key={p.mb}
                onClick={() => setQuotaMB(p.mb)}
                className={`px-2 py-1 text-xs rounded border ${
                  quotaMB === p.mb
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="mb-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded hover:bg-gray-200"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Quota'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── BackupsModal ─────────────────────────────────────────────────────────────
function BackupsModal({ license, onClose }) {
  const [backups, setBackups] = useState([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const res = await cloudBackupAdminApi.listForLicense(license.license_id)
      setBackups(res.data.backups || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [license.license_id])

  const handleDelete = async (backupId) => {
    if (!confirm('Delete this backup? This cannot be undone.')) return
    setDeletingId(backupId)
    try {
      await cloudBackupAdminApi.deleteBackup(backupId)
      setBackups((prev) => prev.filter((b) => b.backup_id !== backupId))
    } catch (e) {
      alert(e.response?.data?.message || 'Failed to delete backup')
    } finally {
      setDeletingId(null)
    }
  }

  const statusBadge = (status) => {
    const map = {
      active:  'bg-green-100 text-green-800',
      expired: 'bg-yellow-100 text-yellow-800',
      deleted: 'bg-red-100 text-red-800',
    }
    return (
      <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${map[status] || 'bg-gray-100 text-gray-600'}`}>
        {status}
      </span>
    )
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="text-lg font-bold">Backups</h2>
            <p className="text-sm text-gray-500">
              {license.license_key} — {license.customer_name}
              &nbsp;&bull;&nbsp;
              {license.backup_count} backup{license.backup_count !== 1 ? 's' : ''}
              &nbsp;&bull;&nbsp;
              {fmtBytes(license.used_bytes)} used
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>

        {loading ? (
          <div className="flex justify-center py-10">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        ) : backups.length === 0 ? (
          <div className="text-center py-10 text-gray-400">
            No backups found for this license.
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Filename</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Size</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Uploaded</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Expires</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Downloads</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {backups.map((b) => (
                <tr key={b.id} className={b.status !== 'active' ? 'opacity-50' : ''}>
                  <td className="px-3 py-2 max-w-xs">
                    <div className="font-mono text-xs truncate" title={b.filename}>{b.filename}</div>
                    <div className="text-xs text-gray-400 truncate" title={b.backup_id}>{b.backup_id}</div>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{fmtBytes(b.size_bytes)}</td>
                  <td className="px-3 py-2">{statusBadge(b.status)}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-600">
                    {b.created_at ? new Date(b.created_at).toLocaleDateString() : '-'}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-600">
                    {b.expires_at ? new Date(b.expires_at).toLocaleDateString() : '-'}
                  </td>
                  <td className="px-3 py-2 text-center">{b.download_count ?? 0}</td>
                  <td className="px-3 py-2">
                    {b.status === 'active' && (
                      <button
                        onClick={() => handleDelete(b.backup_id)}
                        disabled={deletingId === b.backup_id}
                        className="text-red-600 hover:underline text-xs disabled:opacity-50"
                      >
                        {deletingId === b.backup_id ? 'Deleting...' : 'Delete'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="flex justify-end mt-4">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded hover:bg-gray-200">
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function CloudBackups() {
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [totalUsedBytes, setTotalUsedBytes] = useState(0)
  const [showQuotaModal, setShowQuotaModal] = useState(null)   // license row object
  const [showBackupsModal, setShowBackupsModal] = useState(null) // license row object

  const load = async () => {
    setLoading(true)
    try {
      const res = await cloudBackupAdminApi.list()
      if (res.data.success) {
        setCustomers(res.data.customers || [])
        setTotalUsedBytes(res.data.total_used_bytes || 0)
      }
    } catch (e) {
      console.error('Failed to load cloud backups:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    if (!search.trim()) return customers
    const q = search.toLowerCase()
    return customers.filter(
      (c) =>
        c.customer_name.toLowerCase().includes(q) ||
        c.license_key.toLowerCase().includes(q)
    )
  }, [customers, search])

  const handleQuotaSaved = () => {
    setShowQuotaModal(null)
    load()
  }

  const tierBadge = (tier) => {
    const map = {
      free:       'bg-gray-100 text-gray-600',
      basic:      'bg-blue-100 text-blue-700',
      pro:        'bg-purple-100 text-purple-700',
      enterprise: 'bg-yellow-100 text-yellow-800',
      custom:     'bg-teal-100 text-teal-700',
    }
    return (
      <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${map[tier] || 'bg-gray-100 text-gray-600'}`}>
        {tier || 'free'}
      </span>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cloud Backups</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage customer backup storage and quotas</p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="inline-flex items-center px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshIcon className="h-4 w-4 mr-1.5" />
          Refresh
        </button>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Customers Using Cloud"
          value={customers.length}
          icon={<UsersIcon className="h-6 w-6 text-blue-500" />}
          color="border-blue-500"
        />
        <StatCard
          label="Total Storage Used"
          value={fmtBytes(totalUsedBytes)}
          icon={<DatabaseIcon className="h-6 w-6 text-emerald-500" />}
          color="border-emerald-500"
        />
        <StatCard
          label="Total Backups"
          value={customers.reduce((s, c) => s + (c.backup_count || 0), 0)}
          icon={<ArchiveIcon className="h-6 w-6 text-purple-500" />}
          color="border-purple-500"
        />
      </div>

      {/* Search */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search customer name or license key..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        {search && (
          <button
            onClick={() => setSearch('')}
            className="text-xs text-gray-500 hover:text-gray-700"
          >
            Clear
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            {search ? 'No results match your search.' : 'No customers are using cloud backup yet.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">License Key</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Storage Used</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-40">Usage Bar</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Quota</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Backups</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tier</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Upload</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filtered.map((row) => (
                  <tr key={row.license_id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900">{row.customer_name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">
                      {row.license_key.length > 16
                        ? row.license_key.slice(0, 16) + '...'
                        : row.license_key}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{fmtBytes(row.used_bytes)}</td>
                    <td className="px-4 py-3">
                      <StorageBar usedBytes={row.used_bytes} quotaBytes={row.quota_bytes} />
                    </td>
                    <td className="px-4 py-3 text-gray-700">{fmtBytes(row.quota_bytes)}</td>
                    <td className="px-4 py-3 text-center">{row.backup_count}</td>
                    <td className="px-4 py-3">{tierBadge(row.tier)}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {row.last_upload
                        ? new Date(row.last_upload).toLocaleDateString()
                        : <span className="text-gray-300">never</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => setShowBackupsModal(row)}
                          className="text-blue-600 hover:underline text-xs whitespace-nowrap"
                        >
                          View Backups
                        </button>
                        <button
                          onClick={() => setShowQuotaModal(row)}
                          className="text-teal-600 hover:underline text-xs whitespace-nowrap"
                        >
                          Set Quota
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Quota modal */}
      {showQuotaModal && (
        <QuotaModal
          license={showQuotaModal}
          onClose={() => setShowQuotaModal(null)}
          onSaved={handleQuotaSaved}
        />
      )}

      {/* Backups detail modal */}
      {showBackupsModal && (
        <BackupsModal
          license={showBackupsModal}
          onClose={() => setShowBackupsModal(null)}
        />
      )}
    </div>
  )
}

// ─── Small reusable components ────────────────────────────────────────────────
function StatCard({ label, value, icon, color }) {
  return (
    <div className={`bg-white rounded-lg shadow p-4 border-l-4 ${color}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
          <p className="text-2xl font-bold text-gray-900 mt-0.5">{value}</p>
        </div>
        <div className="opacity-80">{icon}</div>
      </div>
    </div>
  )
}

// ─── Inline SVG icons ─────────────────────────────────────────────────────────
function RefreshIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  )
}

function SearchIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
    </svg>
  )
}

function UsersIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  )
}

function DatabaseIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M4 7c0-1.657 3.582-3 8-3s8 1.343 8 3M4 7v5c0 1.657 3.582 3 8 3s8-1.343 8-3V7M4 12v5c0 1.657 3.582 3 8 3s8-1.343 8-3v-5" />
    </svg>
  )
}

function ArchiveIcon({ className }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
    </svg>
  )
}
