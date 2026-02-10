import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../services/api'
import { formatDateTime } from '../utils/timezone'

export default function AuditLogs() {
  const [page, setPage] = useState(1)
  const [action, setAction] = useState('')
  const [entityType, setEntityType] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['audit-logs', page, action, entityType, dateFrom, dateTo],
    queryFn: () => api.get('/audit', {
      params: { page, action, entity_type: entityType, date_from: dateFrom, date_to: dateTo }
    }).then(res => res.data)
  })

  const { data: actions } = useQuery({
    queryKey: ['audit-actions'],
    queryFn: () => api.get('/audit/actions').then(res => res.data.data)
  })

  const { data: entityTypes } = useQuery({
    queryKey: ['audit-entity-types'],
    queryFn: () => api.get('/audit/entity-types').then(res => res.data.data)
  })

  const getActionColor = (action) => {
    const colors = {
      create: 'bg-green-100 text-green-800',
      update: 'bg-blue-100 text-blue-800',
      delete: 'bg-red-100 text-red-800',
      login: 'bg-purple-100 dark:bg-purple-900/50 text-purple-800 dark:text-purple-300',
      logout: 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200',
      renew: 'bg-teal-100 text-teal-800',
      disconnect: 'bg-orange-100 dark:bg-orange-900/50 text-orange-800 dark:text-orange-300',
      transfer: 'bg-yellow-100 text-yellow-800'
    }
    return colors[action] || 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200'
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  const logs = data?.data || []
  const meta = data?.meta || {}

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Audit Logs</h1>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <select
            value={action}
            onChange={(e) => { setAction(e.target.value); setPage(1) }}
            className="rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:focus:ring-blue-400"
          >
            <option value="">All Actions</option>
            {(actions || []).map(a => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
          <select
            value={entityType}
            onChange={(e) => { setEntityType(e.target.value); setPage(1) }}
            className="rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:focus:ring-blue-400"
          >
            <option value="">All Entity Types</option>
            {(entityTypes || []).map(et => (
              <option key={et} value={et}>{et}</option>
            ))}
          </select>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(1) }}
            className="rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:focus:ring-blue-400"
            placeholder="From Date"
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(1) }}
            className="rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:focus:ring-blue-400"
            placeholder="To Date"
          />
          <button
            onClick={() => {
              setAction('')
              setEntityType('')
              setDateFrom('')
              setDateTo('')
              setPage(1)
            }}
            className="px-4 py-2 text-sm text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-600 rounded-md hover:bg-gray-200 dark:bg-gray-600"
          >
            Clear Filters
          </button>
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Timestamp</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">User</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Action</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Entity</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Description</th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {logs.map(log => (
              <tr key={log.id} className="hover:bg-gray-50 dark:bg-gray-700">
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">
                  {formatDateTime(log.created_at)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900 dark:text-white">{log.username || log.user?.username}</div>
                  <div className="text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">
                    {['Subscriber', 'Reseller', 'Support', 'Admin'][log.user_type - 1] || 'Unknown'}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 py-1 text-xs rounded-full ${getActionColor(log.action)}`}>
                    {log.action}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">
                  <div>{log.entity_type}</div>
                  {log.entity_id > 0 && (
                    <div className="text-xs text-gray-400 dark:text-gray-500 dark:text-gray-400">ID: {log.entity_id}</div>
                  )}
                </td>
                <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400 max-w-xs truncate">
                  {log.description}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {logs.length === 0 && (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">
            No audit logs found
          </div>
        )}

        {meta.totalPages > 1 && (
          <div className="px-6 py-4 bg-gray-50 flex justify-between items-center">
            <span className="text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">
              Page {page} of {meta.totalPages} ({meta.total} total logs)
            </span>
            <div className="space-x-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 bg-gray-200 dark:bg-gray-600 rounded disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={page >= meta.totalPages}
                className="px-3 py-1 bg-gray-200 dark:bg-gray-600 rounded disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
