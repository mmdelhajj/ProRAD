import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { sharingApi } from '../services/api'
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  flexRender,
} from '@tanstack/react-table'
import {
  ExclamationTriangleIcon,
  ShieldExclamationIcon,
  SignalIcon,
  ArrowPathIcon,
  MagnifyingGlassIcon,
  InformationCircleIcon,
  WifiIcon,
  ComputerDesktopIcon,
  CogIcon,
  CheckCircleIcon,
  XCircleIcon,
  ServerIcon,
} from '@heroicons/react/24/outline'
import clsx from 'clsx'
import toast from 'react-hot-toast'

function getSuspicionBadge(level) {
  switch (level) {
    case 'high':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-red-100 text-red-700 rounded-full">
          <ShieldExclamationIcon className="w-3 h-3" />
          High Risk
        </span>
      )
    case 'medium':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-700 rounded-full">
          <ExclamationTriangleIcon className="w-3 h-3" />
          Medium
        </span>
      )
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-green-100 text-green-700 rounded-full">
          <SignalIcon className="w-3 h-3" />
          Normal
        </span>
      )
  }
}

function getTTLBadge(status, ttlValues) {
  if (status === 'router_detected') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-red-100 text-red-700 rounded-full">
        <WifiIcon className="w-3 h-3" />
        Router Detected
      </span>
    )
  }
  if (status === 'multiple_os') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-700 rounded-full">
        <ComputerDesktopIcon className="w-3 h-3" />
        Multiple OS
      </span>
    )
  }
  if (ttlValues && ttlValues.length > 0) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-gray-100 text-gray-600 rounded-full">
        TTL: {ttlValues.join(', ')}
      </span>
    )
  }
  return (
    <span className="text-xs text-gray-400">No TTL data</span>
  )
}

export default function SharingDetection() {
  const [search, setSearch] = useState('')
  const [showOnlySuspicious, setShowOnlySuspicious] = useState(false)
  const [showConfig, setShowConfig] = useState(false)
  const queryClient = useQueryClient()

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['sharing-detection'],
    queryFn: () => sharingApi.list().then((r) => r.data),
    refetchInterval: 60000, // Refresh every minute
  })

  // Query for NAS rule status
  const { data: nasRulesData, refetch: refetchNasRules, isLoading: isLoadingRules } = useQuery({
    queryKey: ['sharing-nas-rules'],
    queryFn: () => sharingApi.getNasRuleStatus().then((r) => r.data),
    enabled: showConfig,
  })

  // Mutation to generate rules
  const generateRulesMutation = useMutation({
    mutationFn: (nasId) => sharingApi.generateTTLRules(nasId),
    onSuccess: (res, nasId) => {
      toast.success(res.data?.message || 'TTL rules generated successfully')
      refetchNasRules()
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Failed to generate rules')
    },
  })

  // Mutation to remove rules
  const removeRulesMutation = useMutation({
    mutationFn: (nasId) => sharingApi.removeTTLRules(nasId),
    onSuccess: (res) => {
      toast.success(res.data?.message || 'TTL rules removed successfully')
      refetchNasRules()
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Failed to remove rules')
    },
  })

  const accounts = data?.data || []
  const stats = data?.stats || {}
  const nasRules = nasRulesData?.data || []

  const filteredAccounts = useMemo(() => {
    let result = accounts

    if (showOnlySuspicious) {
      result = result.filter(a => a.suspicion_level === 'high' || a.suspicion_level === 'medium')
    }

    if (search) {
      const s = search.toLowerCase()
      result = result.filter(
        (a) =>
          a.username?.toLowerCase().includes(s) ||
          a.full_name?.toLowerCase().includes(s) ||
          a.ip_address?.includes(s)
      )
    }

    return result
  }, [accounts, search, showOnlySuspicious])

  const columns = useMemo(
    () => [
      {
        accessorKey: 'username',
        header: 'Subscriber',
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span className="font-medium">{row.original.username}</span>
            {row.original.full_name && (
              <span className="text-xs text-gray-500">{row.original.full_name}</span>
            )}
          </div>
        ),
      },
      {
        accessorKey: 'ip_address',
        header: 'IP Address',
        cell: ({ row }) => (
          <code className="px-2 py-1 bg-gray-100 rounded text-sm">
            {row.original.ip_address || '-'}
          </code>
        ),
      },
      {
        accessorKey: 'connection_count',
        header: 'Connections',
        cell: ({ row }) => {
          const count = row.original.connection_count || 0
          return (
            <span className={clsx(
              'font-mono font-medium',
              count >= 400 ? 'text-red-600' :
              count >= 200 ? 'text-yellow-600' :
              'text-gray-700'
            )}>
              {count}
            </span>
          )
        },
      },
      {
        accessorKey: 'ttl_status',
        header: 'TTL Status',
        cell: ({ row }) => getTTLBadge(row.original.ttl_status, row.original.ttl_values),
      },
      {
        accessorKey: 'suspicion_level',
        header: 'Risk Level',
        cell: ({ row }) => getSuspicionBadge(row.original.suspicion_level),
      },
      {
        accessorKey: 'reasons',
        header: 'Reasons',
        cell: ({ row }) => {
          const reasons = row.original.reasons || []
          if (reasons.length === 0) return <span className="text-gray-400">-</span>
          return (
            <div className="max-w-xs">
              {reasons.slice(0, 2).map((r, i) => (
                <div key={i} className="text-xs text-gray-600 truncate">{r}</div>
              ))}
              {reasons.length > 2 && (
                <span className="text-xs text-gray-400">+{reasons.length - 2} more</span>
              )}
            </div>
          )
        },
      },
      {
        accessorKey: 'nas_name',
        header: 'NAS',
        cell: ({ row }) => (
          <span className="text-sm text-gray-600">
            {row.original.nas_name || row.original.nas_ip_address || '-'}
          </span>
        ),
      },
    ],
    []
  )

  const table = useReactTable({
    data: filteredAccounts,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sharing Detection</h1>
          <p className="text-gray-500">Detect accounts that may be shared with multiple users</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowConfig(!showConfig)}
            className="btn-secondary flex items-center gap-2"
          >
            <CogIcon className="w-4 h-4" />
            Configure TTL Rules
          </button>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="btn-secondary flex items-center gap-2"
          >
            <ArrowPathIcon className={clsx('w-4 h-4', isFetching && 'animate-spin')} />
            {isFetching ? 'Analyzing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* TTL Rules Configuration Panel */}
      {showConfig && (
        <div className="card p-6 border-2 border-primary-200 bg-primary-50">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <CogIcon className="w-5 h-5 text-primary-600" />
                TTL Detection Rules Configuration
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                TTL (Time To Live) detection identifies when a customer is using a router/NAT device to share their connection.
                When packets pass through a router, the TTL value decreases by 1.
              </p>
            </div>
            <button onClick={() => setShowConfig(false)} className="text-gray-400 hover:text-gray-600">
              <XCircleIcon className="w-5 h-5" />
            </button>
          </div>

          <div className="bg-white rounded-lg p-4 mb-4">
            <h3 className="font-medium text-gray-800 mb-2">How TTL Detection Works:</h3>
            <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
              <li><strong>TTL = 128:</strong> Direct Windows connection (no router)</li>
              <li><strong>TTL = 127:</strong> Windows device behind a router (128 - 1)</li>
              <li><strong>TTL = 64:</strong> Direct Linux/Android/iOS connection (no router)</li>
              <li><strong>TTL = 63:</strong> Linux/Android/iOS device behind a router (64 - 1)</li>
            </ul>
            <p className="text-sm text-gray-500 mt-2">
              When we detect TTL=127 or TTL=63, it means the customer is using a router/NAT to share their connection with other devices.
            </p>
          </div>

          <h3 className="font-medium text-gray-800 mb-3">NAS Devices - TTL Rule Status:</h3>
          {isLoadingRules ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
            </div>
          ) : nasRules.length === 0 ? (
            <p className="text-gray-500 text-center py-4">No active NAS devices found</p>
          ) : (
            <div className="grid gap-3">
              {nasRules.map((nas) => (
                <div key={nas.nas_id} className="flex items-center justify-between bg-white p-4 rounded-lg border">
                  <div className="flex items-center gap-3">
                    <ServerIcon className="w-5 h-5 text-gray-400" />
                    <div>
                      <div className="font-medium text-gray-900">{nas.nas_name}</div>
                      <div className="text-sm text-gray-500">{nas.nas_ip_address}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    {nas.error ? (
                      <span className="text-sm text-red-600 flex items-center gap-1">
                        <XCircleIcon className="w-4 h-4" />
                        Error: {nas.error}
                      </span>
                    ) : nas.rules_configured ? (
                      <span className="text-sm text-green-600 flex items-center gap-1">
                        <CheckCircleIcon className="w-4 h-4" />
                        {nas.rule_count} rules configured
                      </span>
                    ) : (
                      <span className="text-sm text-yellow-600 flex items-center gap-1">
                        <ExclamationTriangleIcon className="w-4 h-4" />
                        Not configured ({nas.rule_count} rules)
                      </span>
                    )}
                    <div className="flex gap-2">
                      {nas.rules_configured ? (
                        <button
                          onClick={() => removeRulesMutation.mutate(nas.nas_id)}
                          disabled={removeRulesMutation.isPending}
                          className="btn-danger text-sm px-3 py-1.5"
                        >
                          {removeRulesMutation.isPending ? 'Removing...' : 'Remove Rules'}
                        </button>
                      ) : (
                        <button
                          onClick={() => generateRulesMutation.mutate(nas.nas_id)}
                          disabled={generateRulesMutation.isPending}
                          className="btn-primary text-sm px-3 py-1.5"
                        >
                          {generateRulesMutation.isPending ? 'Generating...' : 'Generate TTL Rules'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 flex justify-end">
            <button
              onClick={() => refetchNasRules()}
              className="btn-secondary text-sm flex items-center gap-2"
            >
              <ArrowPathIcon className="w-4 h-4" />
              Refresh Status
            </button>
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <SignalIcon className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <div className="text-sm text-gray-500">Online Users</div>
              <div className="text-2xl font-bold">{stats.total_online || 0}</div>
            </div>
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-yellow-100 rounded-lg">
              <ExclamationTriangleIcon className="w-5 h-5 text-yellow-600" />
            </div>
            <div>
              <div className="text-sm text-gray-500">Suspicious</div>
              <div className="text-2xl font-bold text-yellow-600">{stats.suspicious_count || 0}</div>
            </div>
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 rounded-lg">
              <ShieldExclamationIcon className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <div className="text-sm text-gray-500">High Risk</div>
              <div className="text-2xl font-bold text-red-600">{stats.high_risk_count || 0}</div>
            </div>
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <WifiIcon className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <div className="text-sm text-gray-500">Router Detected</div>
              <div className="text-2xl font-bold text-purple-600">{stats.router_detected || 0}</div>
            </div>
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-100 rounded-lg">
              <ComputerDesktopIcon className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <div className="text-sm text-gray-500">High Connections</div>
              <div className="text-2xl font-bold text-orange-600">{stats.high_connections || 0}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Info Box */}
      <div className="card p-4 bg-blue-50 border-blue-200">
        <div className="flex gap-3">
          <InformationCircleIcon className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-800">
            <p className="font-medium mb-1">How Detection Works:</p>
            <ul className="list-disc list-inside space-y-1 text-blue-700">
              <li><strong>TTL Detection:</strong> TTL=127 or 63 indicates a router behind customer's connection (normal is 128 or 64)</li>
              <li><strong>Connection Count:</strong> More than 200 connections may indicate multiple users</li>
              <li><strong>High Risk:</strong> Both router detected AND high connection count</li>
            </ul>
            <p className="mt-2 text-blue-600">
              Note: For TTL detection to work, add mangle rules on MikroTik to mark connections by TTL.
            </p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1 max-w-md">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by username, name, IP..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input pl-10"
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showOnlySuspicious}
              onChange={(e) => setShowOnlySuspicious(e.target.checked)}
              className="w-4 h-4 text-primary-600 rounded border-gray-300 focus:ring-primary-500"
            />
            <span className="text-sm text-gray-700">Show only suspicious accounts</span>
          </label>
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
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
                      <span className="text-gray-500">Analyzing connections...</span>
                    </div>
                  </td>
                </tr>
              ) : table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="text-center py-8 text-gray-500">
                    {showOnlySuspicious ? 'No suspicious accounts found' : 'No online users'}
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    className={clsx(
                      'hover:bg-gray-50',
                      row.original.suspicion_level === 'high' && 'bg-red-50',
                      row.original.suspicion_level === 'medium' && 'bg-yellow-50'
                    )}
                  >
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

      {/* Manual MikroTik Setup Instructions (collapsed) */}
      <details className="card p-4">
        <summary className="font-medium text-gray-900 cursor-pointer flex items-center gap-2">
          <InformationCircleIcon className="w-5 h-5 text-gray-400" />
          Manual MikroTik TTL Detection Setup (Advanced)
        </summary>
        <div className="mt-3">
          <p className="text-sm text-gray-600 mb-3">
            If you prefer to add the rules manually instead of using the automatic configuration above, use these commands:
          </p>
          <pre className="bg-gray-900 text-green-400 p-4 rounded-lg text-sm overflow-x-auto">
{`/ip firewall mangle
add chain=prerouting action=mark-connection new-connection-mark=ttl_128 ttl=equal:128 passthrough=yes comment="ProISP-TTL-Detection - Direct Windows"
add chain=prerouting action=mark-connection new-connection-mark=ttl_127 ttl=equal:127 passthrough=yes comment="ProISP-TTL-Detection - Windows behind router"
add chain=prerouting action=mark-connection new-connection-mark=ttl_64 ttl=equal:64 passthrough=yes comment="ProISP-TTL-Detection - Direct Linux/Android"
add chain=prerouting action=mark-connection new-connection-mark=ttl_63 ttl=equal:63 passthrough=yes comment="ProISP-TTL-Detection - Linux/Android behind router"`}
          </pre>
        </div>
      </details>
    </div>
  )
}
