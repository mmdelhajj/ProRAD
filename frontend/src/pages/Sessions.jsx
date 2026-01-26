import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { sessionApi } from '../services/api'
import { useAuthStore } from '../store/authStore'
import { formatDateTime } from '../utils/timezone'
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
} from '@tanstack/react-table'
import {
  ArrowPathIcon,
  XCircleIcon,
  SignalIcon,
  ClockIcon,
  ArrowDownTrayIcon,
  ArrowUpTrayIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'
import clsx from 'clsx'

function formatBytes(bytes) {
  if (!bytes) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

function formatDuration(seconds) {
  if (!seconds) return '0s'
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m ${secs}s`
  return `${secs}s`
}

export default function Sessions() {
  const queryClient = useQueryClient()
  const { hasPermission } = useAuthStore()
  const [search, setSearch] = useState('')

  const { data: sessions, isLoading, refetch } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => sessionApi.list({ limit: 100 }).then((r) => r.data.data),
    refetchInterval: 10000, // Refresh every 10 seconds
  })

  const disconnectMutation = useMutation({
    mutationFn: (id) => sessionApi.disconnect(id),
    onSuccess: () => {
      toast.success('Session disconnected')
      queryClient.invalidateQueries(['sessions'])
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to disconnect'),
  })

  const filteredSessions = useMemo(() => {
    if (!sessions) return []
    if (!search) return sessions
    const s = search.toLowerCase()
    return sessions.filter(
      (session) =>
        session.username?.toLowerCase().includes(s) ||
        session.framed_ip_address?.includes(s) ||
        session.nas_ip_address?.includes(s) ||
        session.calling_station_id?.toLowerCase().includes(s) ||
        session.full_name?.toLowerCase().includes(s)
    )
  }, [sessions, search])

  const columns = useMemo(
    () => [
      {
        accessorKey: 'username',
        header: 'Username',
        cell: ({ row }) => (
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <SignalIcon className="w-4 h-4 text-green-500" />
              <span className="font-medium">{row.original.username}</span>
            </div>
            {row.original.full_name && (
              <span className="text-xs text-gray-500 ml-6">{row.original.full_name}</span>
            )}
          </div>
        ),
      },
      {
        accessorKey: 'framed_ip_address',
        header: 'IP Address',
        cell: ({ row }) => (
          <code className="px-2 py-1 bg-gray-100 rounded text-sm">
            {row.original.framed_ip_address || '-'}
          </code>
        ),
      },
      {
        accessorKey: 'calling_station_id',
        header: 'MAC Address',
        cell: ({ row }) => (
          <code className="px-2 py-1 bg-gray-100 rounded text-sm text-xs">
            {row.original.calling_station_id || '-'}
          </code>
        ),
      },
      {
        accessorKey: 'nas_name',
        header: 'NAS',
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span>{row.original.nas_name || row.original.nas_ip_address || '-'}</span>
            {row.original.nas_name && row.original.nas_ip_address && (
              <span className="text-xs text-gray-400">{row.original.nas_ip_address}</span>
            )}
          </div>
        ),
      },
      {
        accessorKey: 'acct_start_time',
        header: 'Started',
        cell: ({ row }) => (
          <div className="text-sm">
            {formatDateTime(row.original.acct_start_time)}
          </div>
        ),
      },
      {
        accessorKey: 'session_duration',
        header: 'Duration',
        cell: ({ row }) => (
          <div className="flex items-center gap-1 text-sm">
            <ClockIcon className="w-4 h-4 text-gray-400" />
            {formatDuration(row.original.session_duration)}
          </div>
        ),
      },
      {
        accessorKey: 'traffic',
        header: 'Traffic',
        cell: ({ row }) => (
          <div className="text-sm space-y-1">
            <div className="flex items-center gap-1 text-green-600">
              <ArrowDownTrayIcon className="w-3 h-3" />
              {formatBytes(row.original.acct_input_octets)}
            </div>
            <div className="flex items-center gap-1 text-blue-600">
              <ArrowUpTrayIcon className="w-3 h-3" />
              {formatBytes(row.original.acct_output_octets)}
            </div>
          </div>
        ),
      },
      {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => (
          hasPermission('subscribers.disconnect') ? (
            <button
              onClick={() => {
                if (confirm('Disconnect this session?')) {
                  disconnectMutation.mutate(row.original.id)
                }
              }}
              className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded"
              title="Disconnect"
            >
              <XCircleIcon className="w-5 h-5" />
            </button>
          ) : null
        ),
      },
    ],
    [disconnectMutation, hasPermission]
  )

  const table = useReactTable({
    data: filteredSessions,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  const totalDownload = sessions?.reduce((sum, s) => sum + (s.acct_input_octets || 0), 0) || 0
  const totalUpload = sessions?.reduce((sum, s) => sum + (s.acct_output_octets || 0), 0) || 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Active Sessions</h1>
          <p className="text-gray-500">Monitor live PPPoE connections</p>
        </div>
        <button
          onClick={() => refetch()}
          className="btn-secondary flex items-center gap-2"
        >
          <ArrowPathIcon className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <SignalIcon className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <div className="text-sm text-gray-500">Online Users</div>
              <div className="text-2xl font-bold">{sessions?.length || 0}</div>
            </div>
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <ArrowDownTrayIcon className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <div className="text-sm text-gray-500">Total Download</div>
              <div className="text-2xl font-bold">{formatBytes(totalDownload)}</div>
            </div>
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <ArrowUpTrayIcon className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <div className="text-sm text-gray-500">Total Upload</div>
              <div className="text-2xl font-bold">{formatBytes(totalUpload)}</div>
            </div>
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-yellow-100 rounded-lg">
              <ClockIcon className="w-5 h-5 text-yellow-600" />
            </div>
            <div>
              <div className="text-sm text-gray-500">Auto-refresh</div>
              <div className="text-lg font-bold">Every 10s</div>
            </div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="card p-4">
        <div className="relative max-w-md">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search by username, IP, MAC..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-10"
          />
        </div>
      </div>

      {/* Table */}
      <div className="card">
        <div className="table-container">
          <table className="table">
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th key={header.id}>
                      {flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-gray-200">
              {isLoading ? (
                <tr>
                  <td colSpan={columns.length} className="text-center py-8">
                    <div className="flex items-center justify-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
                    </div>
                  </td>
                </tr>
              ) : table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="text-center py-8 text-gray-500">
                    No active sessions
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50">
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
