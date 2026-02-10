import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'
import api from '../services/api'
import {
  ArrowPathIcon,
  ChartBarIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  SignalIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
} from '@heroicons/react/24/outline'
import clsx from 'clsx'

const columnHelper = createColumnHelper()

function formatBytes(bytes) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

function QuotaBar({ used, total, label }) {
  if (total === 0) {
    return (
      <div className="text-xs text-gray-400 dark:text-gray-500 dark:text-gray-400">Unlimited</div>
    )
  }

  const percent = Math.min((used / total) * 100, 100)
  const color = percent >= 100 ? 'bg-red-500' : percent >= 80 ? 'bg-yellow-500' : 'bg-green-500'

  return (
    <div className="w-full">
      <div className="flex justify-between text-xs mb-1">
        <span>{formatBytes(used)}</span>
        <span className="text-gray-400 dark:text-gray-500 dark:text-gray-400">{formatBytes(total)}</span>
      </div>
      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={clsx('h-full rounded-full transition-all', color)}
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="text-xs text-gray-500 mt-1 text-right">{percent.toFixed(1)}%</div>
    </div>
  )
}

export default function FUPCounters() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [fupStatus, setFupStatus] = useState('')
  const [quotaStatus, setQuotaStatus] = useState('')
  const [selectedRows, setSelectedRows] = useState({})

  // Fetch stats
  const { data: statsData } = useQuery({
    queryKey: ['fup-stats'],
    queryFn: () => api.get('/fup/stats').then(res => res.data.data),
    refetchInterval: 30000,
  })

  // Fetch quotas
  const { data: quotasData, isLoading } = useQuery({
    queryKey: ['fup-quotas', page, search, fupStatus, quotaStatus],
    queryFn: () => api.get('/fup/quotas', {
      params: { page, limit: 25, search, fup_status: fupStatus, quota_status: quotaStatus }
    }).then(res => res.data),
  })

  // Fetch top users
  const { data: topUsersData } = useQuery({
    queryKey: ['fup-top-users'],
    queryFn: () => api.get('/fup/top-users', { params: { limit: 5, period: 'monthly' } }).then(res => res.data.data),
  })

  // Reset FUP mutation
  const resetMutation = useMutation({
    mutationFn: (id) => api.post(`/fup/reset/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries(['fup-quotas'])
      queryClient.invalidateQueries(['fup-stats'])
    },
  })

  // Bulk reset mutation
  const bulkResetMutation = useMutation({
    mutationFn: (data) => api.post('/fup/bulk-reset', data),
    onSuccess: () => {
      queryClient.invalidateQueries(['fup-quotas'])
      queryClient.invalidateQueries(['fup-stats'])
      setSelectedRows({})
    },
  })

  // Reset all FUP mutation
  const resetAllMutation = useMutation({
    mutationFn: () => api.post('/fup/reset-all'),
    onSuccess: () => {
      queryClient.invalidateQueries(['fup-quotas'])
      queryClient.invalidateQueries(['fup-stats'])
    },
  })

  const columns = useMemo(() => [
    columnHelper.display({
      id: 'select',
      header: ({ table }) => (
        <input
          type="checkbox"
          checked={table.getIsAllRowsSelected()}
          onChange={table.getToggleAllRowsSelectedHandler()}
          className="rounded border-gray-300 dark:border-gray-600"
        />
      ),
      cell: ({ row }) => (
        <input
          type="checkbox"
          checked={row.getIsSelected()}
          onChange={row.getToggleSelectedHandler()}
          className="rounded border-gray-300 dark:border-gray-600"
        />
      ),
    }),
    columnHelper.accessor('username', {
      header: 'Username',
      cell: info => (
        <div>
          <div className="font-medium">{info.getValue()}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">{info.row.original.full_name}</div>
        </div>
      ),
    }),
    columnHelper.accessor('service_name', {
      header: 'Service',
    }),
    columnHelper.accessor('reseller_name', {
      header: 'Reseller',
    }),
    columnHelper.display({
      id: 'daily_quota',
      header: 'Daily Quota',
      cell: ({ row }) => (
        <QuotaBar
          used={row.original.daily_used}
          total={row.original.daily_quota}
        />
      ),
    }),
    columnHelper.display({
      id: 'monthly_quota',
      header: 'Monthly Quota',
      cell: ({ row }) => (
        <QuotaBar
          used={row.original.monthly_used}
          total={row.original.monthly_quota}
        />
      ),
    }),
    columnHelper.accessor('fup_level', {
      header: 'FUP Level',
      cell: info => {
        const level = info.getValue()
        return (
          <span className={clsx(
            'inline-flex items-center px-2 py-1 rounded-full text-xs font-medium',
            level === 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
          )}>
            {level === 0 ? 'Normal' : `Level ${level}`}
          </span>
        )
      },
    }),
    columnHelper.accessor('is_online', {
      header: 'Status',
      cell: info => (
        <span className={clsx(
          'inline-flex items-center px-2 py-1 rounded-full text-xs font-medium',
          info.getValue() ? 'bg-green-100 text-green-800' : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200'
        )}>
          <SignalIcon className={clsx('w-3 h-3 mr-1', info.getValue() ? 'text-green-500' : 'text-gray-400')} />
          {info.getValue() ? 'Online' : 'Offline'}
        </span>
      ),
    }),
    columnHelper.display({
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <button
          onClick={() => resetMutation.mutate(row.original.id)}
          disabled={resetMutation.isPending}
          className="inline-flex items-center px-2 py-1 text-xs font-medium text-blue-600 hover:text-blue-800 disabled:opacity-50"
        >
          <ArrowPathIcon className="w-4 h-4 mr-1" />
          Reset
        </button>
      ),
    }),
  ], [resetMutation])

  const table = useReactTable({
    data: quotasData?.data || [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    state: {
      rowSelection: selectedRows,
    },
    onRowSelectionChange: setSelectedRows,
    getRowId: (row) => String(row.id),
  })

  const selectedIds = Object.keys(selectedRows).map(Number)

  const handleBulkReset = (resetType) => {
    if (selectedIds.length === 0) return
    bulkResetMutation.mutate({
      subscriber_ids: selectedIds,
      reset_type: resetType,
    })
  }

  const stats = statsData || {}

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">FUP & Counters</h1>
          <p className="text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">Manage Fair Usage Policy and quota counters</p>
        </div>
        <button
          onClick={() => resetAllMutation.mutate()}
          disabled={resetAllMutation.isPending || stats.active_fup === 0}
          className="inline-flex items-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
        >
          <ArrowPathIcon className="w-5 h-5 mr-2" />
          Reset All FUP ({stats.active_fup || 0})
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4 border">
          <div className="flex items-center">
            <div className="p-2 bg-blue-100 rounded-lg">
              <ChartBarIcon className="w-6 h-6 text-blue-600" />
            </div>
            <div className="ml-3">
              <p className="text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">Total Subscribers</p>
              <p className="text-xl font-bold">{stats.total_subscribers || 0}</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4 border">
          <div className="flex items-center">
            <div className="p-2 bg-red-100 rounded-lg">
              <ExclamationTriangleIcon className="w-6 h-6 text-red-600" />
            </div>
            <div className="ml-3">
              <p className="text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">Active FUP</p>
              <p className="text-xl font-bold text-red-600">{stats.active_fup || 0}</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4 border">
          <div className="flex items-center">
            <div className="p-2 bg-yellow-100 rounded-lg">
              <ExclamationTriangleIcon className="w-6 h-6 text-yellow-600" />
            </div>
            <div className="ml-3">
              <p className="text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">Daily Exceeded</p>
              <p className="text-xl font-bold text-yellow-600">{stats.daily_quota_exceeded || 0}</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4 border">
          <div className="flex items-center">
            <div className="p-2 bg-orange-100 dark:bg-orange-900/50 rounded-lg">
              <ExclamationTriangleIcon className="w-6 h-6 text-orange-600" />
            </div>
            <div className="ml-3">
              <p className="text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">Monthly Exceeded</p>
              <p className="text-xl font-bold text-orange-600">{stats.monthly_quota_exceeded || 0}</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4 border">
          <div className="flex items-center">
            <div className="p-2 bg-green-100 rounded-lg">
              <CheckCircleIcon className="w-6 h-6 text-green-600" />
            </div>
            <div className="ml-3">
              <p className="text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">Unlimited</p>
              <p className="text-xl font-bold text-green-600">{stats.unlimited_quota || 0}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Main Table */}
        <div className="lg:col-span-3 bg-white dark:bg-gray-800 rounded-xl shadow-sm border">
          {/* Filters */}
          <div className="p-4 border-b">
            <div className="flex flex-wrap gap-4">
              <div className="flex-1 min-w-[200px]">
                <div className="relative">
                  <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-gray-500 dark:text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search username..."
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value)
                      setPage(1)
                    }}
                    className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>

              <select
                value={fupStatus}
                onChange={(e) => {
                  setFupStatus(e.target.value)
                  setPage(1)
                }}
                className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
              >
                <option value="">All FUP Status</option>
                <option value="active">Active FUP</option>
                <option value="normal">Normal</option>
              </select>

              <select
                value={quotaStatus}
                onChange={(e) => {
                  setQuotaStatus(e.target.value)
                  setPage(1)
                }}
                className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
              >
                <option value="">All Quota Status</option>
                <option value="daily_exceeded">Daily Exceeded</option>
                <option value="monthly_exceeded">Monthly Exceeded</option>
                <option value="warning">Warning (80%+)</option>
                <option value="unlimited">Unlimited</option>
              </select>
            </div>

            {/* Bulk Actions */}
            {selectedIds.length > 0 && (
              <div className="mt-4 flex items-center gap-2 p-3 bg-blue-50 rounded-lg">
                <span className="text-sm text-blue-800 font-medium">
                  {selectedIds.length} selected
                </span>
                <button
                  onClick={() => handleBulkReset('all')}
                  disabled={bulkResetMutation.isPending}
                  className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  Reset All
                </button>
                <button
                  onClick={() => handleBulkReset('fup')}
                  disabled={bulkResetMutation.isPending}
                  className="px-3 py-1 text-sm bg-yellow-600 text-white rounded hover:bg-yellow-700 disabled:opacity-50"
                >
                  Reset FUP
                </button>
                <button
                  onClick={() => handleBulkReset('daily')}
                  disabled={bulkResetMutation.isPending}
                  className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                >
                  Reset Daily
                </button>
                <button
                  onClick={() => handleBulkReset('monthly')}
                  disabled={bulkResetMutation.isPending}
                  className="px-3 py-1 text-sm bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50"
                >
                  Reset Monthly
                </button>
              </div>
            )}
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-700">
                {table.getHeaderGroups().map(headerGroup => (
                  <tr key={headerGroup.id}>
                    {headerGroup.headers.map(header => (
                      <th
                        key={header.id}
                        className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {isLoading ? (
                  <tr>
                    <td colSpan={columns.length} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">
                      Loading...
                    </td>
                  </tr>
                ) : table.getRowModel().rows.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">
                      No subscribers found
                    </td>
                  </tr>
                ) : (
                  table.getRowModel().rows.map(row => (
                    <tr key={row.id} className="hover:bg-gray-50 dark:bg-gray-700">
                      {row.getVisibleCells().map(cell => (
                        <td key={cell.id} className="px-4 py-3">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {quotasData?.meta && (
            <div className="px-4 py-3 border-t flex items-center justify-between">
              <div className="text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">
                Showing {((page - 1) * 25) + 1} to {Math.min(page * 25, quotasData.meta.total)} of {quotasData.meta.total}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1 border rounded hover:bg-gray-50 disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage(p => p + 1)}
                  disabled={page >= quotasData.meta.totalPages}
                  className="px-3 py-1 border rounded hover:bg-gray-50 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Top Users Sidebar */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border p-4">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Top Quota Users</h3>
          <div className="space-y-4">
            {topUsersData?.map((user, index) => (
              <div key={user.id} className="flex items-center">
                <div className={clsx(
                  'w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm',
                  index === 0 ? 'bg-yellow-500' :
                  index === 1 ? 'bg-gray-400' :
                  index === 2 ? 'bg-amber-700' : 'bg-gray-300'
                )}>
                  {index + 1}
                </div>
                <div className="ml-3 flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{user.username}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">{user.service_name}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium">{formatBytes(user.quota_used)}</p>
                  <p className={clsx(
                    'text-xs',
                    user.percent >= 100 ? 'text-red-600' :
                    user.percent >= 80 ? 'text-yellow-600' : 'text-green-600'
                  )}>
                    {user.percent.toFixed(1)}%
                  </p>
                </div>
              </div>
            ))}
            {!topUsersData?.length && (
              <p className="text-sm text-gray-500 text-center py-4">No data available</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
