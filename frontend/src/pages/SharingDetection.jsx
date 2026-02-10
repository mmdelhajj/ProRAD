import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { sharingApi } from '../services/api'
import { useBrandingStore } from '../store/brandingStore'
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
  ClockIcon,
  ChartBarIcon,
  PlayIcon,
  CalendarDaysIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline'
import clsx from 'clsx'
import toast from 'react-hot-toast'

function getSuspicionBadge(level) {
  switch (level) {
    case 'high':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-400 rounded-full">
          <ShieldExclamationIcon className="w-3 h-3" />
          High Risk
        </span>
      )
    case 'medium':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-400 rounded-full">
          <ExclamationTriangleIcon className="w-3 h-3" />
          Medium
        </span>
      )
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-400 rounded-full">
          <SignalIcon className="w-3 h-3" />
          Normal
        </span>
      )
  }
}

function getTTLBadge(status, ttlValues) {
  if (status === 'router_detected' || status === 'double_router') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-400 rounded-full">
        <WifiIcon className="w-3 h-3" />
        Router Detected
      </span>
    )
  }
  if (status === 'multiple_os') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-400 rounded-full">
        <ComputerDesktopIcon className="w-3 h-3" />
        Multiple OS
      </span>
    )
  }
  if (ttlValues && ttlValues.length > 0) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 rounded-full">
        TTL: {ttlValues.join(', ')}
      </span>
    )
  }
  return (
    <span className="text-xs text-gray-400 dark:text-gray-500">No TTL data</span>
  )
}

export default function SharingDetection() {
  const { companyName } = useBrandingStore()
  const brandName = companyName || 'ISP'
  const queryClient = useQueryClient()

  const [activeTab, setActiveTab] = useState('live')
  const [search, setSearch] = useState('')
  const [showOnlySuspicious, setShowOnlySuspicious] = useState(false)
  const [showConfig, setShowConfig] = useState(false)
  const [historyDays, setHistoryDays] = useState(7)
  const [historyLevel, setHistoryLevel] = useState('')

  // Live detection query
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['sharing-detection'],
    queryFn: () => sharingApi.list().then((r) => r.data),
    refetchInterval: 60000,
    enabled: activeTab === 'live',
  })

  // History query
  const { data: historyData, isLoading: isLoadingHistory, refetch: refetchHistory } = useQuery({
    queryKey: ['sharing-history', historyDays, historyLevel],
    queryFn: () => sharingApi.getHistory({ days: historyDays, suspicion_level: historyLevel }).then((r) => r.data),
    enabled: activeTab === 'history',
  })

  // Trends query
  const { data: trendsData, isLoading: isLoadingTrends } = useQuery({
    queryKey: ['sharing-trends', historyDays],
    queryFn: () => sharingApi.getTrends({ days: historyDays }).then((r) => r.data),
    enabled: activeTab === 'history',
  })

  // Repeat offenders query
  const { data: offendersData, isLoading: isLoadingOffenders } = useQuery({
    queryKey: ['sharing-offenders'],
    queryFn: () => sharingApi.getRepeatOffenders({ days: 30, min_count: 3 }).then((r) => r.data),
    enabled: activeTab === 'history',
  })

  // Settings query
  const { data: settingsData, isLoading: isLoadingSettings, refetch: refetchSettings } = useQuery({
    queryKey: ['sharing-settings'],
    queryFn: () => sharingApi.getSettings().then((r) => r.data),
    enabled: activeTab === 'settings',
  })

  // NAS rules query
  const { data: nasRulesData, refetch: refetchNasRules, isLoading: isLoadingRules } = useQuery({
    queryKey: ['sharing-nas-rules'],
    queryFn: () => sharingApi.getNasRuleStatus().then((r) => r.data),
    enabled: showConfig,
  })

  // Mutations
  const generateRulesMutation = useMutation({
    mutationFn: (nasId) => sharingApi.generateTTLRules(nasId),
    onSuccess: (res) => {
      toast.success(res.data?.message || 'TTL rules generated successfully')
      refetchNasRules()
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to generate rules'),
  })

  const removeRulesMutation = useMutation({
    mutationFn: (nasId) => sharingApi.removeTTLRules(nasId),
    onSuccess: (res) => {
      toast.success(res.data?.message || 'TTL rules removed successfully')
      refetchNasRules()
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to remove rules'),
  })

  const manualScanMutation = useMutation({
    mutationFn: () => sharingApi.runManualScan(),
    onSuccess: (res) => {
      toast.success(res.data?.message || `Scan completed. Found ${res.data?.saved || 0} suspicious accounts.`)
      refetchHistory()
      queryClient.invalidateQueries(['sharing-trends'])
      queryClient.invalidateQueries(['sharing-offenders'])
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Scan failed'),
  })

  const updateSettingsMutation = useMutation({
    mutationFn: (settings) => sharingApi.updateSettings(settings),
    onSuccess: () => {
      toast.success('Settings saved')
      refetchSettings()
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to save settings'),
  })

  const accounts = data?.data || []
  const stats = data?.stats || {}
  const nasRules = nasRulesData?.data || []
  const history = historyData?.data || []
  const trends = trendsData?.data || []
  const offenders = offendersData?.data || []
  const settings = settingsData?.data || {}

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
            <span className="font-medium text-gray-900 dark:text-white">{row.original.username}</span>
            {row.original.full_name && (
              <span className="text-xs text-gray-500 dark:text-gray-400">{row.original.full_name}</span>
            )}
          </div>
        ),
      },
      {
        accessorKey: 'ip_address',
        header: 'IP Address',
        cell: ({ row }) => (
          <code className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-sm">
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
              'text-gray-700 dark:text-gray-300'
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
          if (reasons.length === 0) return <span className="text-gray-400 dark:text-gray-500">-</span>
          return (
            <div className="max-w-xs">
              {reasons.slice(0, 2).map((r, i) => (
                <div key={i} className="text-xs text-gray-600 dark:text-gray-400 truncate">{r}</div>
              ))}
              {reasons.length > 2 && (
                <span className="text-xs text-gray-400 dark:text-gray-500">+{reasons.length - 2} more</span>
              )}
            </div>
          )
        },
      },
      {
        accessorKey: 'nas_name',
        header: 'NAS',
        cell: ({ row }) => (
          <span className="text-sm text-gray-600 dark:text-gray-400">
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

  const tabs = [
    { id: 'live', label: 'Live Analysis', icon: SignalIcon },
    { id: 'history', label: 'History & Trends', icon: ChartBarIcon },
    { id: 'settings', label: 'Settings', icon: CogIcon },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Sharing Detection</h1>
          <p className="text-gray-500 dark:text-gray-400">Detect accounts that may be shared with multiple users</p>
        </div>
        <div className="flex gap-2">
          {activeTab === 'live' && (
            <>
              <button
                onClick={() => setShowConfig(!showConfig)}
                className="btn-secondary flex items-center gap-2"
              >
                <CogIcon className="w-4 h-4" />
                TTL Rules
              </button>
              <button
                onClick={() => refetch()}
                disabled={isFetching}
                className="btn-secondary flex items-center gap-2"
              >
                <ArrowPathIcon className={clsx('w-4 h-4', isFetching && 'animate-spin')} />
                {isFetching ? 'Analyzing...' : 'Refresh'}
              </button>
            </>
          )}
          {activeTab === 'history' && (
            <button
              onClick={() => manualScanMutation.mutate()}
              disabled={manualScanMutation.isPending}
              className="btn-primary flex items-center gap-2"
            >
              <PlayIcon className={clsx('w-4 h-4', manualScanMutation.isPending && 'animate-pulse')} />
              {manualScanMutation.isPending ? 'Scanning...' : 'Run Manual Scan'}
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={clsx(
                'flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm',
                activeTab === tab.id
                  ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
              )}
            >
              <tab.icon className="w-5 h-5" />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Live Analysis Tab */}
      {activeTab === 'live' && (
        <>
          {/* TTL Rules Configuration Panel */}
          {showConfig && (
            <div className="card p-6 border-2 border-primary-200 dark:border-primary-800 bg-primary-50 dark:bg-primary-900/20">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    <CogIcon className="w-5 h-5 text-primary-600" />
                    TTL Detection Rules Configuration
                  </h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    Configure MikroTik mangle rules for TTL-based sharing detection.
                  </p>
                </div>
                <button onClick={() => setShowConfig(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                  <XCircleIcon className="w-5 h-5" />
                </button>
              </div>

              <h3 className="font-medium text-gray-800 dark:text-gray-200 mb-3">NAS Devices - TTL Rule Status:</h3>
              {isLoadingRules ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
                </div>
              ) : nasRules.length === 0 ? (
                <p className="text-gray-500 dark:text-gray-400 text-center py-4">No active NAS devices found</p>
              ) : (
                <div className="grid gap-3">
                  {nasRules.map((nas) => (
                    <div key={nas.nas_id} className="flex items-center justify-between bg-white dark:bg-gray-800 p-4 rounded-lg border dark:border-gray-700">
                      <div className="flex items-center gap-3">
                        <ServerIcon className="w-5 h-5 text-gray-400" />
                        <div>
                          <div className="font-medium text-gray-900 dark:text-white">{nas.nas_name}</div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">{nas.nas_ip_address}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        {nas.error ? (
                          <span className="text-sm text-red-600 flex items-center gap-1">
                            <XCircleIcon className="w-4 h-4" />
                            Error
                          </span>
                        ) : nas.rules_configured ? (
                          <span className="text-sm text-green-600 flex items-center gap-1">
                            <CheckCircleIcon className="w-4 h-4" />
                            {nas.rule_count} rules
                          </span>
                        ) : (
                          <span className="text-sm text-yellow-600 flex items-center gap-1">
                            <ExclamationTriangleIcon className="w-4 h-4" />
                            Not configured
                          </span>
                        )}
                        <div className="flex gap-2">
                          {nas.rules_configured ? (
                            <button
                              onClick={() => removeRulesMutation.mutate(nas.nas_id)}
                              disabled={removeRulesMutation.isPending}
                              className="btn-danger text-sm px-3 py-1.5"
                            >
                              Remove
                            </button>
                          ) : (
                            <button
                              onClick={() => generateRulesMutation.mutate(nas.nas_id)}
                              disabled={generateRulesMutation.isPending}
                              className="btn-primary text-sm px-3 py-1.5"
                            >
                              Generate
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div className="card p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/50 rounded-lg">
                  <SignalIcon className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">Online Users</div>
                  <div className="text-2xl font-bold text-gray-900 dark:text-white">{stats.total_online || 0}</div>
                </div>
              </div>
            </div>
            <div className="card p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-yellow-100 dark:bg-yellow-900/50 rounded-lg">
                  <ExclamationTriangleIcon className="w-5 h-5 text-yellow-600" />
                </div>
                <div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">Suspicious</div>
                  <div className="text-2xl font-bold text-yellow-600">{stats.suspicious_count || 0}</div>
                </div>
              </div>
            </div>
            <div className="card p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-100 dark:bg-red-900/50 rounded-lg">
                  <ShieldExclamationIcon className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">High Risk</div>
                  <div className="text-2xl font-bold text-red-600">{stats.high_risk_count || 0}</div>
                </div>
              </div>
            </div>
            <div className="card p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 dark:bg-purple-900/50 rounded-lg">
                  <WifiIcon className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">Router Detected</div>
                  <div className="text-2xl font-bold text-purple-600">{stats.router_detected || 0}</div>
                </div>
              </div>
            </div>
            <div className="card p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-100 dark:bg-orange-900/50 rounded-lg">
                  <ComputerDesktopIcon className="w-5 h-5 text-orange-600" />
                </div>
                <div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">High Connections</div>
                  <div className="text-2xl font-bold text-orange-600">{stats.high_connections || 0}</div>
                </div>
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
                <span className="text-sm text-gray-700 dark:text-gray-300">Show only suspicious</span>
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
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {isLoading ? (
                    <tr>
                      <td colSpan={columns.length} className="text-center py-8">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
                          <span className="text-gray-500 dark:text-gray-400">Analyzing connections...</span>
                        </div>
                      </td>
                    </tr>
                  ) : table.getRowModel().rows.length === 0 ? (
                    <tr>
                      <td colSpan={columns.length} className="text-center py-8 text-gray-500 dark:text-gray-400">
                        {showOnlySuspicious ? 'No suspicious accounts found' : 'No online users'}
                      </td>
                    </tr>
                  ) : (
                    table.getRowModel().rows.map((row) => (
                      <tr
                        key={row.id}
                        className={clsx(
                          'hover:bg-gray-50 dark:hover:bg-gray-700',
                          row.original.suspicion_level === 'high' && 'bg-red-50 dark:bg-red-900/20',
                          row.original.suspicion_level === 'medium' && 'bg-yellow-50 dark:bg-yellow-900/20'
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
        </>
      )}

      {/* History Tab */}
      {activeTab === 'history' && (
        <>
          {/* Filters */}
          <div className="card p-4">
            <div className="flex flex-wrap gap-4 items-center">
              <div className="flex items-center gap-2">
                <CalendarDaysIcon className="w-5 h-5 text-gray-400" />
                <select
                  value={historyDays}
                  onChange={(e) => setHistoryDays(Number(e.target.value))}
                  className="input w-40"
                >
                  <option value={7}>Last 7 days</option>
                  <option value={14}>Last 14 days</option>
                  <option value={30}>Last 30 days</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <ShieldExclamationIcon className="w-5 h-5 text-gray-400" />
                <select
                  value={historyLevel}
                  onChange={(e) => setHistoryLevel(e.target.value)}
                  className="input w-40"
                >
                  <option value="">All Levels</option>
                  <option value="high">High Risk</option>
                  <option value="medium">Medium</option>
                </select>
              </div>
              <button
                onClick={() => refetchHistory()}
                className="btn-secondary flex items-center gap-2"
              >
                <ArrowPathIcon className="w-4 h-4" />
                Refresh
              </button>
            </div>
          </div>

          {/* Trends Summary */}
          {!isLoadingTrends && trends.length > 0 && (
            <div className="card p-6">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <ChartBarIcon className="w-5 h-5 text-primary-600" />
                Detection Trends (Last {historyDays} Days)
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
                  <div className="text-sm text-gray-500 dark:text-gray-400">Total Detections</div>
                  <div className="text-2xl font-bold text-gray-900 dark:text-white">
                    {trends.reduce((sum, t) => sum + t.total_detected, 0)}
                  </div>
                </div>
                <div className="bg-red-50 dark:bg-red-900/30 p-4 rounded-lg">
                  <div className="text-sm text-red-600 dark:text-red-400">High Risk</div>
                  <div className="text-2xl font-bold text-red-600">
                    {trends.reduce((sum, t) => sum + t.high_risk_count, 0)}
                  </div>
                </div>
                <div className="bg-yellow-50 dark:bg-yellow-900/30 p-4 rounded-lg">
                  <div className="text-sm text-yellow-600 dark:text-yellow-400">Medium Risk</div>
                  <div className="text-2xl font-bold text-yellow-600">
                    {trends.reduce((sum, t) => sum + t.medium_risk_count, 0)}
                  </div>
                </div>
                <div className="bg-blue-50 dark:bg-blue-900/30 p-4 rounded-lg">
                  <div className="text-sm text-blue-600 dark:text-blue-400">Avg Confidence</div>
                  <div className="text-2xl font-bold text-blue-600">
                    {Math.round(trends.reduce((sum, t) => sum + t.avg_confidence, 0) / (trends.length || 1))}%
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Repeat Offenders */}
          {!isLoadingOffenders && offenders.length > 0 && (
            <div className="card p-6">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <UserGroupIcon className="w-5 h-5 text-red-600" />
                Repeat Offenders (Detected 3+ times in 30 days)
              </h3>
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Username</th>
                      <th>Detections</th>
                      <th>High Risk Count</th>
                      <th>Avg Confidence</th>
                      <th>Last Detected</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {offenders.slice(0, 10).map((o) => (
                      <tr key={o.subscriber_id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                        <td>
                          <div>
                            <div className="font-medium text-gray-900 dark:text-white">{o.username}</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">{o.full_name}</div>
                          </div>
                        </td>
                        <td>
                          <span className="font-bold text-red-600">{o.detection_count}x</span>
                        </td>
                        <td>{o.high_risk_count}</td>
                        <td>{Math.round(o.avg_confidence)}%</td>
                        <td className="text-sm text-gray-500 dark:text-gray-400">
                          {new Date(o.last_detected_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* History Table */}
          <div className="card">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="font-semibold text-gray-900 dark:text-white">Detection History</h3>
            </div>
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Username</th>
                    <th>Connections</th>
                    <th>TTL Status</th>
                    <th>Risk Level</th>
                    <th>Confidence</th>
                    <th>Scan Type</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {isLoadingHistory ? (
                    <tr>
                      <td colSpan={7} className="text-center py-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
                      </td>
                    </tr>
                  ) : history.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-gray-500 dark:text-gray-400">
                        No detection history found. Run a manual scan or wait for the nightly automatic scan.
                      </td>
                    </tr>
                  ) : (
                    history.map((h) => (
                      <tr key={h.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                        <td className="text-sm text-gray-500 dark:text-gray-400">
                          {new Date(h.detected_at).toLocaleString()}
                        </td>
                        <td>
                          <div className="font-medium text-gray-900 dark:text-white">{h.username}</div>
                        </td>
                        <td className="font-mono">{h.connection_count}</td>
                        <td>{getTTLBadge(h.ttl_status, h.ttl_values ? JSON.parse(h.ttl_values) : [])}</td>
                        <td>{getSuspicionBadge(h.suspicion_level)}</td>
                        <td>
                          <span className={clsx(
                            'font-medium',
                            h.confidence_score >= 70 ? 'text-red-600' :
                            h.confidence_score >= 40 ? 'text-yellow-600' :
                            'text-gray-600 dark:text-gray-400'
                          )}>
                            {h.confidence_score}%
                          </span>
                        </td>
                        <td>
                          <span className={clsx(
                            'px-2 py-1 text-xs rounded-full',
                            h.scan_type === 'automatic'
                              ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-400'
                              : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                          )}>
                            {h.scan_type}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Settings Tab */}
      {activeTab === 'settings' && (
        <div className="card p-6">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
            <CogIcon className="w-5 h-5 text-primary-600" />
            Automatic Scan Settings
          </h3>

          {isLoadingSettings ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
            </div>
          ) : (
            <div className="space-y-6 max-w-xl">
              <div className="flex items-center justify-between">
                <div>
                  <label className="font-medium text-gray-900 dark:text-white">Enable Automatic Scanning</label>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Run nightly scans automatically</p>
                </div>
                <button
                  onClick={() => updateSettingsMutation.mutate({ enabled: !settings.enabled })}
                  className={clsx(
                    'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                    settings.enabled ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'
                  )}
                >
                  <span
                    className={clsx(
                      'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                      settings.enabled ? 'translate-x-6' : 'translate-x-1'
                    )}
                  />
                </button>
              </div>

              <div>
                <label className="block font-medium text-gray-900 dark:text-white mb-2">
                  <ClockIcon className="w-4 h-4 inline mr-2" />
                  Scan Time
                </label>
                <input
                  type="time"
                  value={settings.scan_time || '03:00'}
                  onChange={(e) => updateSettingsMutation.mutate({ scan_time: e.target.value })}
                  className="input w-40"
                />
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Recommended: 03:00 - 05:00 (off-peak hours)
                </p>
              </div>

              <div>
                <label className="block font-medium text-gray-900 dark:text-white mb-2">Retention Days</label>
                <select
                  value={settings.retention_days || 30}
                  onChange={(e) => updateSettingsMutation.mutate({ retention_days: Number(e.target.value) })}
                  className="input w-40"
                >
                  <option value={7}>7 days</option>
                  <option value={14}>14 days</option>
                  <option value={30}>30 days</option>
                  <option value={60}>60 days</option>
                  <option value={90}>90 days</option>
                </select>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Old detection records will be automatically deleted
                </p>
              </div>

              <div>
                <label className="block font-medium text-gray-900 dark:text-white mb-2">Minimum Risk Level to Save</label>
                <select
                  value={settings.min_suspicion_level || 'medium'}
                  onChange={(e) => updateSettingsMutation.mutate({ min_suspicion_level: e.target.value })}
                  className="input w-40"
                >
                  <option value="low">Low (save all)</option>
                  <option value="medium">Medium (recommended)</option>
                  <option value="high">High only</option>
                </select>
              </div>

              <div>
                <label className="block font-medium text-gray-900 dark:text-white mb-2">Connection Threshold</label>
                <input
                  type="number"
                  value={settings.connection_threshold || 500}
                  onChange={(e) => updateSettingsMutation.mutate({ connection_threshold: Number(e.target.value) })}
                  className="input w-40"
                  min={100}
                  max={2000}
                  step={100}
                />
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Users with more connections are flagged as suspicious
                </p>
              </div>

              <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  <InformationCircleIcon className="w-4 h-4 inline mr-1" />
                  The automatic scan will run daily at the configured time and save suspicious accounts to history.
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
