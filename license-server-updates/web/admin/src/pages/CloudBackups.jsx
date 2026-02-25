import { useState, useEffect, useCallback } from 'react'
import { getCloudBackups, adminDeleteCloudBackup, setCloudStorageTier } from '../services/api_cloud_backup'

// Storage tier definitions — keep in sync with the backend handler
const TIERS = [
  {
    value: 'free',
    label: 'Free',
    quota: '1 GB',
    color: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
    badge: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  },
  {
    value: 'basic',
    label: 'Basic',
    quota: '10 GB',
    color: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
    badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  },
  {
    value: 'pro',
    label: 'Pro',
    quota: '50 GB',
    color: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
    badge: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
  },
  {
    value: 'enterprise',
    label: 'Enterprise',
    quota: '200 GB',
    color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
    badge: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
  },
]

const TIER_MAP = Object.fromEntries(TIERS.map((t) => [t.value, t]))

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}

function formatDate(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleString()
}

function UsageBar({ usedBytes, quotaBytes }) {
  const pct = quotaBytes > 0 ? Math.min(100, (usedBytes / quotaBytes) * 100) : 0
  const color =
    pct >= 90
      ? 'bg-red-500'
      : pct >= 70
      ? 'bg-yellow-500'
      : 'bg-green-500'
  return (
    <div className="w-full">
      <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
        <span>{formatBytes(usedBytes)}</span>
        <span>{formatBytes(quotaBytes)}</span>
      </div>
      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
        <div
          className={`${color} h-1.5 rounded-full transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

function TierBadge({ tier }) {
  const def = TIER_MAP[tier] || TIER_MAP['free']
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${def.badge}`}>
      {def.label}
    </span>
  )
}

// ---- Set Tier Modal ----
function SetTierModal({ license, onClose, onSaved }) {
  const [selectedTier, setSelectedTier] = useState(license.cloud_tier || 'free')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      await setCloudStorageTier(license.id, selectedTier)
      onSaved(selectedTier)
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to set tier')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md shadow-xl">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">Set Storage Tier</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
          License:{' '}
          <span className="font-mono font-medium text-gray-800 dark:text-gray-200">
            {license.license_key}
          </span>
          <br />
          Customer:{' '}
          <span className="font-medium text-gray-800 dark:text-gray-200">
            {license.customer_name || '—'}
          </span>
        </p>

        <div className="space-y-3 mb-6">
          {TIERS.map((tier) => (
            <label
              key={tier.value}
              className={`flex items-center gap-4 p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                selectedTier === tier.value
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-950 dark:border-blue-400'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              <input
                type="radio"
                name="tier"
                value={tier.value}
                checked={selectedTier === tier.value}
                onChange={() => setSelectedTier(tier.value)}
                className="h-4 w-4 text-blue-600"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900 dark:text-white">{tier.label}</span>
                  <TierBadge tier={tier.value} />
                </div>
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  Storage quota: {tier.quota}
                </span>
              </div>
            </label>
          ))}
        </div>

        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---- Main Page ----
export default function CloudBackups() {
  const [backups, setBackups] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const LIMIT = 20

  // Tier modal state
  const [tierModal, setTierModal] = useState(null) // license object or null

  const loadBackups = useCallback(async () => {
    setLoading(true)
    try {
      const res = await getCloudBackups(page, LIMIT, search)
      if (res.data.success) {
        setBackups(res.data.data || [])
        const total = res.data.total || 0
        setTotalCount(total)
        setTotalPages(Math.max(1, Math.ceil(total / LIMIT)))
      }
    } catch (err) {
      console.error('Failed to load cloud backups:', err)
    } finally {
      setLoading(false)
    }
  }, [page, search])

  useEffect(() => {
    loadBackups()
  }, [loadBackups])

  const handleSearchSubmit = (e) => {
    e.preventDefault()
    setPage(1)
    setSearch(searchInput)
  }

  const handleDelete = async (backup) => {
    if (
      !window.confirm(
        `Delete backup "${backup.filename}"?\n\nThis cannot be undone.`
      )
    )
      return
    try {
      await adminDeleteCloudBackup(backup.id)
      loadBackups()
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to delete backup')
    }
  }

  const handleTierSaved = (newTier) => {
    // Optimistically update the tier badge in the table
    setBackups((prev) =>
      prev.map((b) =>
        b.license_id === tierModal.id ? { ...b, cloud_tier: newTier } : b
      )
    )
    setTierModal(null)
    // Reload to get fresh quota data
    loadBackups()
  }

  const openTierModal = (backup) => {
    setTierModal({
      id: backup.license_id,
      license_key: backup.license_key,
      customer_name: backup.customer_name,
      cloud_tier: backup.cloud_tier,
    })
  }

  if (loading && backups.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap justify-between items-center mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Cloud Backups</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {totalCount} backup{totalCount !== 1 ? 's' : ''} stored across all licenses
          </p>
        </div>

        {/* Search */}
        <form onSubmit={handleSearchSubmit} className="flex gap-2">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Filter by license key or customer…"
            className="border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm w-72 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700"
          >
            Search
          </button>
          {search && (
            <button
              type="button"
              onClick={() => {
                setSearchInput('')
                setSearch('')
                setPage(1)
              }}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Clear
            </button>
          )}
        </form>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Customer
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  License Key
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Filename
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Size
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Storage Usage
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Created
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Expires
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Downloads
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {backups.length === 0 ? (
                <tr>
                  <td
                    colSpan={10}
                    className="px-4 py-10 text-center text-gray-500 dark:text-gray-400"
                  >
                    {search ? 'No backups match your search.' : 'No backups stored yet.'}
                  </td>
                </tr>
              ) : (
                backups.map((backup) => (
                  <tr
                    key={backup.id}
                    className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    {/* Customer */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900 dark:text-white">
                        {backup.customer_name || '—'}
                      </div>
                    </td>

                    {/* License Key */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-gray-700 dark:text-gray-300">
                          {backup.license_key}
                        </span>
                        <TierBadge tier={backup.cloud_tier || 'free'} />
                      </div>
                    </td>

                    {/* Filename */}
                    <td className="px-4 py-3">
                      <span
                        className="text-sm text-gray-800 dark:text-gray-200 max-w-xs truncate block"
                        title={backup.filename}
                      >
                        {backup.filename}
                      </span>
                    </td>

                    {/* Size */}
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600 dark:text-gray-300">
                      {formatBytes(backup.file_size)}
                    </td>

                    {/* Type */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300 capitalize">
                        {backup.backup_type || 'full'}
                      </span>
                    </td>

                    {/* Storage Usage */}
                    <td className="px-4 py-3 min-w-[160px]">
                      <UsageBar
                        usedBytes={backup.storage_used_bytes}
                        quotaBytes={backup.storage_quota_bytes}
                      />
                    </td>

                    {/* Created */}
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {formatDate(backup.created_at)}
                    </td>

                    {/* Expires */}
                    <td className="px-4 py-3 whitespace-nowrap text-sm">
                      {backup.expires_at ? (
                        <span
                          className={
                            new Date(backup.expires_at) < new Date()
                              ? 'text-red-500 dark:text-red-400'
                              : 'text-gray-500 dark:text-gray-400'
                          }
                        >
                          {formatDate(backup.expires_at)}
                        </span>
                      ) : (
                        <span className="text-gray-400 dark:text-gray-500">Never</span>
                      )}
                    </td>

                    {/* Downloads */}
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-center text-gray-600 dark:text-gray-300">
                      {backup.download_count ?? 0}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3 whitespace-nowrap text-sm">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => openTierModal(backup)}
                          className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium"
                          title="Set storage tier for this license"
                        >
                          Tier
                        </button>
                        <button
                          onClick={() => handleDelete(backup)}
                          className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 font-medium"
                          title="Delete this backup"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-3 flex items-center justify-between border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Page {page} of {totalPages} &mdash; {totalCount} total
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Previous
              </button>

              {/* Page number buttons — show at most 5 around current page */}
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(
                  (n) =>
                    n === 1 ||
                    n === totalPages ||
                    Math.abs(n - page) <= 2
                )
                .reduce((acc, n, idx, arr) => {
                  if (idx > 0 && n - arr[idx - 1] > 1) {
                    acc.push('...')
                  }
                  acc.push(n)
                  return acc
                }, [])
                .map((item, idx) =>
                  item === '...' ? (
                    <span
                      key={`ellipsis-${idx}`}
                      className="px-2 py-1 text-sm text-gray-400 dark:text-gray-500"
                    >
                      …
                    </span>
                  ) : (
                    <button
                      key={item}
                      onClick={() => setPage(item)}
                      className={`px-3 py-1 border rounded text-sm ${
                        item === page
                          ? 'bg-blue-600 border-blue-600 text-white'
                          : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600'
                      }`}
                    >
                      {item}
                    </button>
                  )
                )}

              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Set Tier Modal */}
      {tierModal && (
        <SetTierModal
          license={tierModal}
          onClose={() => setTierModal(null)}
          onSaved={handleTierSaved}
        />
      )}
    </div>
  )
}
