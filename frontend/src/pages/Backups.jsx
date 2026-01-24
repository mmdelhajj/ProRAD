import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { backupApi } from '../services/api'
import { formatDate, formatDateTime } from '../utils/timezone'
import {
  ArrowPathIcon,
  ArrowDownTrayIcon,
  ArrowUpTrayIcon,
  TrashIcon,
  CloudArrowUpIcon,
  DocumentArrowUpIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline'
import clsx from 'clsx'
import toast from 'react-hot-toast'

function formatBytes(bytes) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

export default function Backups() {
  const queryClient = useQueryClient()
  const fileInputRef = useRef(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(null)
  const [backupType, setBackupType] = useState('full')

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['backups'],
    queryFn: () => backupApi.list().then((r) => r.data),
  })

  const createMutation = useMutation({
    mutationFn: (type) => backupApi.create({ type }),
    onSuccess: (res) => {
      toast.success(res.data.message)
      setShowCreateModal(false)
      queryClient.invalidateQueries(['backups'])
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to create backup'),
  })

  const deleteMutation = useMutation({
    mutationFn: (filename) => backupApi.delete(filename),
    onSuccess: () => {
      toast.success('Backup deleted')
      queryClient.invalidateQueries(['backups'])
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to delete'),
  })

  const restoreMutation = useMutation({
    mutationFn: (filename) => backupApi.restore(filename),
    onSuccess: () => {
      toast.success('Backup restored successfully')
      setShowRestoreConfirm(null)
      queryClient.invalidateQueries(['backups'])
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to restore'),
  })

  const uploadMutation = useMutation({
    mutationFn: (file) => {
      const formData = new FormData()
      formData.append('file', file)
      return backupApi.upload(formData)
    },
    onSuccess: (res) => {
      toast.success(res.data.message)
      queryClient.invalidateQueries(['backups'])
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to upload'),
  })

  const handleDownload = (filename) => {
    window.open(`/api/backups/${filename}/download`, '_blank')
  }

  const handleUpload = (e) => {
    const file = e.target.files?.[0]
    if (file) {
      uploadMutation.mutate(file)
    }
  }

  const backups = data?.data || []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Backup Management</h1>
          <p className="text-gray-500">Create, restore, and manage database backups</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="btn-secondary flex items-center gap-2"
          >
            <ArrowUpTrayIcon className="w-4 h-4" />
            Upload Backup
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".sql"
            onChange={handleUpload}
            className="hidden"
          />
          <button
            onClick={() => refetch()}
            className="btn-secondary flex items-center gap-2"
          >
            <ArrowPathIcon className="w-4 h-4" />
            Refresh
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn-primary flex items-center gap-2"
          >
            <CloudArrowUpIcon className="w-4 h-4" />
            Create Backup
          </button>
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card p-4">
          <div className="text-sm font-medium text-gray-500">Total Backups</div>
          <div className="text-2xl font-bold text-gray-900">{backups.length}</div>
        </div>
        <div className="card p-4">
          <div className="text-sm font-medium text-gray-500">Total Size</div>
          <div className="text-2xl font-bold text-gray-900">
            {formatBytes(backups.reduce((acc, b) => acc + (b.size || 0), 0))}
          </div>
        </div>
        <div className="card p-4">
          <div className="text-sm font-medium text-gray-500">Latest Backup</div>
          <div className="text-2xl font-bold text-gray-900">
            {backups[0]
              ? formatDate(backups[0].created_at)
              : 'None'}
          </div>
        </div>
      </div>

      {/* Backups Table */}
      <div className="card">
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Filename</th>
                <th>Type</th>
                <th>Size</th>
                <th>Created At</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="text-center py-8">
                    <div className="flex items-center justify-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
                    </div>
                  </td>
                </tr>
              ) : backups.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-gray-500">
                    <CloudArrowUpIcon className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                    No backups found. Create your first backup to get started.
                  </td>
                </tr>
              ) : (
                backups.map((backup) => (
                  <tr key={backup.filename} className="hover:bg-gray-50">
                    <td>
                      <div className="flex items-center">
                        <DocumentArrowUpIcon className="w-5 h-5 text-gray-400 mr-2" />
                        <span className="font-medium">{backup.filename}</span>
                      </div>
                    </td>
                    <td>
                      <span
                        className={clsx(
                          'badge',
                          backup.type === 'full'
                            ? 'badge-success'
                            : backup.type === 'data'
                            ? 'badge-info'
                            : 'badge-warning'
                        )}
                      >
                        {backup.type || 'full'}
                      </span>
                    </td>
                    <td>{formatBytes(backup.size)}</td>
                    <td>{formatDateTime(backup.created_at)}</td>
                    <td>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleDownload(backup.filename)}
                          className="p-1.5 text-gray-500 hover:text-primary-600 hover:bg-primary-50 rounded"
                          title="Download"
                        >
                          <ArrowDownTrayIcon className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setShowRestoreConfirm(backup.filename)}
                          className="p-1.5 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded"
                          title="Restore"
                        >
                          <ArrowPathIcon className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm('Are you sure you want to delete this backup?')) {
                              deleteMutation.mutate(backup.filename)
                            }
                          }}
                          className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded"
                          title="Delete"
                        >
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Backup Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/50" onClick={() => setShowCreateModal(false)} />
            <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full p-6">
              <h2 className="text-xl font-bold mb-4">Create Backup</h2>

              <div className="space-y-3">
                <p className="text-sm text-gray-600">Select backup type:</p>

                {[
                  { value: 'full', label: 'Full Backup', desc: 'Complete database backup (all tables)' },
                  { value: 'data', label: 'Data Only', desc: 'Subscribers, services, transactions, sessions' },
                  { value: 'config', label: 'Config Only', desc: 'Users, settings, templates, rules' },
                ].map((type) => (
                  <label
                    key={type.value}
                    className={clsx(
                      'flex items-start p-3 border rounded-lg cursor-pointer transition-colors',
                      backupType === type.value
                        ? 'border-primary-500 bg-primary-50'
                        : 'hover:bg-gray-50'
                    )}
                  >
                    <input
                      type="radio"
                      name="backupType"
                      value={type.value}
                      checked={backupType === type.value}
                      onChange={(e) => setBackupType(e.target.value)}
                      className="mt-1 mr-3"
                    />
                    <div>
                      <p className="font-medium">{type.label}</p>
                      <p className="text-xs text-gray-500">{type.desc}</p>
                    </div>
                  </label>
                ))}
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={() => createMutation.mutate(backupType)}
                  disabled={createMutation.isLoading}
                  className="btn-primary flex items-center gap-2"
                >
                  {createMutation.isLoading ? (
                    <ArrowPathIcon className="w-4 h-4 animate-spin" />
                  ) : (
                    <CloudArrowUpIcon className="w-4 h-4" />
                  )}
                  Create Backup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Restore Confirmation Modal */}
      {showRestoreConfirm && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/50" onClick={() => setShowRestoreConfirm(null)} />
            <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-yellow-100 rounded-full">
                  <ExclamationTriangleIcon className="w-6 h-6 text-yellow-600" />
                </div>
                <h2 className="text-xl font-bold">Confirm Restore</h2>
              </div>

              <p className="text-gray-600 mb-4">
                Are you sure you want to restore from this backup? This will overwrite existing data.
              </p>

              <p className="text-sm text-gray-500 mb-6">
                File: <span className="font-mono text-gray-700">{showRestoreConfirm}</span>
              </p>

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowRestoreConfirm(null)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={() => restoreMutation.mutate(showRestoreConfirm)}
                  disabled={restoreMutation.isLoading}
                  className="btn-danger flex items-center gap-2"
                >
                  {restoreMutation.isLoading ? (
                    <ArrowPathIcon className="w-4 h-4 animate-spin" />
                  ) : (
                    <ArrowPathIcon className="w-4 h-4" />
                  )}
                  Restore Backup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
