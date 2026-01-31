import { useQuery } from '@tanstack/react-query'
import { dashboardApi } from '../services/api'
import { formatDate } from '../utils/timezone'
import { useBrandingStore } from '../store/brandingStore'
import { useAuthStore } from '../store/authStore'
import ReactECharts from 'echarts-for-react'
import {
  UsersIcon,
  SignalIcon,
  CurrencyDollarIcon,
  ServerIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  ClockIcon,
  CpuChipIcon,
  CircleStackIcon,
} from '@heroicons/react/24/outline'
import clsx from 'clsx'

function SystemMetricCard({ title, value, icon: Icon, color = 'blue' }) {
  const colorClasses = {
    blue: {
      bg: 'bg-blue-500',
      track: 'bg-blue-100 dark:bg-blue-900/30',
      text: 'text-blue-600 dark:text-blue-400',
      iconBg: 'bg-blue-50 dark:bg-blue-900/50',
    },
    green: {
      bg: 'bg-green-500',
      track: 'bg-green-100 dark:bg-green-900/30',
      text: 'text-green-600 dark:text-green-400',
      iconBg: 'bg-green-50 dark:bg-green-900/50',
    },
    purple: {
      bg: 'bg-purple-500',
      track: 'bg-purple-100 dark:bg-purple-900/30',
      text: 'text-purple-600 dark:text-purple-400',
      iconBg: 'bg-purple-50 dark:bg-purple-900/50',
    },
  }

  const colors = colorClasses[color]
  const percentage = value || 0

  return (
    <div className="stat-card">
      <div className="flex items-center gap-4">
        <div className={clsx('p-3 rounded-xl', colors.iconBg)}>
          <Icon className={clsx('w-6 h-6', colors.text)} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{title}</p>
          <div className="flex items-center gap-3 mt-1">
            <div className={clsx('flex-1 h-2.5 rounded-full', colors.track)}>
              <div
                className={clsx('h-2.5 rounded-full transition-all duration-500', colors.bg)}
                style={{ width: `${Math.min(percentage, 100)}%` }}
              />
            </div>
            <span className={clsx('text-lg font-bold', colors.text)}>{percentage}%</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function StatCard({ title, value, icon: Icon, trend, color = 'primary' }) {
  const colors = {
    primary: 'bg-primary-50 text-primary-600',
    green: 'bg-green-50 text-green-600',
    red: 'bg-red-50 text-red-600',
    yellow: 'bg-yellow-50 text-yellow-600',
    blue: 'bg-blue-50 text-blue-600',
    purple: 'bg-purple-50 dark:bg-purple-900/50 text-purple-600 dark:text-purple-300',
  }

  return (
    <div className="stat-card">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">{title}</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">{value}</p>
          {trend !== undefined && (
            <div className={clsx('flex items-center mt-1 text-sm', trend >= 0 ? 'text-green-600' : 'text-red-600')}>
              {trend >= 0 ? (
                <ArrowTrendingUpIcon className="w-4 h-4 mr-1" />
              ) : (
                <ArrowTrendingDownIcon className="w-4 h-4 mr-1" />
              )}
              {Math.abs(trend)}%
            </div>
          )}
        </div>
        <div className={clsx('p-3 rounded-xl', colors[color])}>
          <Icon className="w-6 h-6" />
        </div>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { companyName } = useBrandingStore()
  const { isAdmin } = useAuthStore()

  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => dashboardApi.stats().then((r) => r.data.data),
    refetchInterval: 30000, // Refresh every 30 seconds
  })

  const { data: chartData } = useQuery({
    queryKey: ['dashboard-chart'],
    queryFn: () => dashboardApi.chart({ type: 'new_expired', days: 30 }).then((r) => r.data.data),
  })

  const { data: serviceData } = useQuery({
    queryKey: ['dashboard-services'],
    queryFn: () => dashboardApi.chart({ type: 'services' }).then((r) => r.data.data),
  })

  const { data: transactions } = useQuery({
    queryKey: ['dashboard-transactions'],
    queryFn: () => dashboardApi.transactions({ limit: 5 }).then((r) => r.data.data),
  })

  const { data: systemMetrics } = useQuery({
    queryKey: ['dashboard-system-metrics'],
    queryFn: () => dashboardApi.systemMetrics().then((r) => r.data.data),
    refetchInterval: 10000, // Refresh every 10 seconds for real-time monitoring
    enabled: isAdmin(), // Only fetch for admins
  })

  const { data: systemCapacityResponse } = useQuery({
    queryKey: ['dashboard-system-capacity'],
    queryFn: () => dashboardApi.systemCapacity().then((r) => r.data),
    refetchInterval: 30000, // Refresh every 30 seconds
    enabled: isAdmin(), // Only fetch for admins
  })

  // Don't show capacity on secondary/replica servers
  // API returns { success, is_replica, data } - extract data only for main server
  const systemCapacity = systemCapacityResponse?.is_replica ? null : systemCapacityResponse?.data


  const lineChartOption = {
    tooltip: {
      trigger: 'axis',
    },
    legend: {
      data: ['New', 'Expired'],
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: chartData?.new?.map((d) => d.date) || [],
    },
    yAxis: {
      type: 'value',
    },
    series: [
      {
        name: 'New',
        type: 'line',
        smooth: true,
        data: chartData?.new?.map((d) => d.count) || [],
        lineStyle: { color: '#10B981' },
        itemStyle: { color: '#10B981' },
        areaStyle: { color: 'rgba(16, 185, 129, 0.1)' },
      },
      {
        name: 'Expired',
        type: 'line',
        smooth: true,
        data: chartData?.expired?.map((d) => d.count) || [],
        lineStyle: { color: '#EF4444' },
        itemStyle: { color: '#EF4444' },
        areaStyle: { color: 'rgba(239, 68, 68, 0.1)' },
      },
    ],
  }

  const pieChartOption = {
    tooltip: {
      trigger: 'item',
    },
    legend: {
      orient: 'vertical',
      left: 'left',
    },
    series: [
      {
        name: 'Subscribers',
        type: 'pie',
        radius: ['40%', '70%'],
        avoidLabelOverlap: false,
        itemStyle: {
          borderRadius: 10,
          borderColor: '#fff',
          borderWidth: 2,
        },
        label: {
          show: false,
        },
        emphasis: {
          label: {
            show: true,
            fontSize: 14,
            fontWeight: 'bold',
          },
        },
        data: serviceData?.map((s) => ({ value: s.count, name: s.name })) || [],
      },
    ],
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
        <p className="text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">Welcome to {companyName || 'ISP'} Management System</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total Subscribers"
          value={stats?.total_subscribers?.toLocaleString() || 0}
          icon={UsersIcon}
          color="primary"
        />
        <StatCard
          title="Online Now"
          value={stats?.online_subscribers?.toLocaleString() || 0}
          icon={SignalIcon}
          color="green"
        />
        <StatCard
          title="Expired"
          value={stats?.expired_subscribers?.toLocaleString() || 0}
          icon={ClockIcon}
          color="red"
        />
        <StatCard
          title="Expiring Soon"
          value={stats?.expiring_subscribers?.toLocaleString() || 0}
          icon={ClockIcon}
          color="yellow"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Today's Revenue"
          value={`$${stats?.today_revenue?.toFixed(2) || '0.00'}`}
          icon={CurrencyDollarIcon}
          color="green"
        />
        <StatCard
          title="Month Revenue"
          value={`$${stats?.month_revenue?.toFixed(2) || '0.00'}`}
          icon={CurrencyDollarIcon}
          color="blue"
        />
        <StatCard
          title="Active Sessions"
          value={stats?.active_sessions?.toLocaleString() || 0}
          icon={ServerIcon}
          color="purple"
        />
        <StatCard
          title="Total Resellers"
          value={stats?.total_resellers?.toLocaleString() || 0}
          icon={UsersIcon}
          color="primary"
        />
      </div>

      {/* System Metrics - Admin Only */}
      {isAdmin() && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <SystemMetricCard
            title="CPU"
            value={systemMetrics?.cpu_percent}
            icon={CpuChipIcon}
            color="blue"
          />
          <SystemMetricCard
            title="Memory"
            value={systemMetrics?.memory_percent}
            icon={ServerIcon}
            color="green"
          />
          <SystemMetricCard
            title="HDD"
            value={systemMetrics?.disk_percent}
            icon={CircleStackIcon}
            color="purple"
          />
        </div>
      )}

      {/* Server Capacity & Cluster - Admin Only */}
      {isAdmin() && systemCapacity && (
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Server Capacity</h2>
              {systemCapacity.cluster_enabled ? (
                <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                  Cluster: {systemCapacity.online_nodes}/{systemCapacity.total_nodes} Online
                </span>
              ) : (
                <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400">
                  Standalone
                </span>
              )}
            </div>
            <span className={clsx(
              'px-3 py-1 rounded-full text-sm font-medium',
              systemCapacity.status === 'healthy' && 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
              systemCapacity.status === 'warning' && 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
              systemCapacity.status === 'critical' && 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
            )}>
              {systemCapacity.status === 'healthy' ? 'Healthy' : systemCapacity.status === 'warning' ? 'Warning' : 'Critical'}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
            <div className="text-center p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <p className="text-2xl font-bold text-primary-600 dark:text-primary-400">{systemCapacity.online_users?.toLocaleString()}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Online Users</p>
            </div>
            <div className="text-center p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">{systemCapacity.recommended_capacity?.toLocaleString()}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Recommended (70%)</p>
            </div>
            <div className="text-center p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{systemCapacity.maximum_capacity?.toLocaleString()}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Maximum</p>
            </div>
            <div className="text-center p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">{systemCapacity.usage_percent}%</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Usage</p>
            </div>
          </div>

          <div className="mb-4">
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-600 dark:text-gray-400">Capacity Usage</span>
              <span className="font-medium text-gray-900 dark:text-white">{systemCapacity.online_users?.toLocaleString()} / {systemCapacity.maximum_capacity?.toLocaleString()} users</span>
            </div>
            <div className="w-full h-3 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
              <div
                className={clsx(
                  'h-full rounded-full transition-all duration-500',
                  systemCapacity.usage_percent < 70 && 'bg-green-500',
                  systemCapacity.usage_percent >= 70 && systemCapacity.usage_percent < 90 && 'bg-yellow-500',
                  systemCapacity.usage_percent >= 90 && 'bg-red-500'
                )}
                style={{ width: `${Math.min(systemCapacity.usage_percent, 100)}%` }}
              />
            </div>
          </div>

          {/* Cluster Nodes */}
          {systemCapacity.nodes && systemCapacity.nodes.length > 0 && (
            <div className="mb-4">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {systemCapacity.cluster_enabled ? 'Cluster Nodes' : 'Server Specs'}
              </h3>
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-600">
                      <th className="pb-2 pr-4">Server</th>
                      <th className="pb-2 pr-4">Role</th>
                      <th className="pb-2 pr-4">Status</th>
                      <th className="pb-2 pr-4">CPU</th>
                      <th className="pb-2 pr-4">RAM</th>
                      <th className="pb-2 pr-4">Capacity</th>
                      {systemCapacity.cluster_enabled && <th className="pb-2 pr-4">CPU%</th>}
                      {systemCapacity.cluster_enabled && <th className="pb-2">MEM%</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {systemCapacity.nodes.map((node, idx) => (
                      <tr key={idx} className="border-b border-gray-100 dark:border-gray-700">
                        <td className="py-2 pr-4">
                          <div className="font-medium text-gray-900 dark:text-white">{node.name}</div>
                          <div className="text-gray-500 dark:text-gray-400">{node.ip}</div>
                        </td>
                        <td className="py-2 pr-4">
                          <span className={clsx(
                            'px-2 py-0.5 rounded text-xs',
                            node.role === 'main' && 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
                            node.role === 'secondary' && 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
                            node.role === 'standalone' && 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                          )}>
                            {node.role}
                          </span>
                        </td>
                        <td className="py-2 pr-4">
                          <span className={clsx(
                            'px-2 py-0.5 rounded text-xs',
                            node.status === 'online' && 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
                            node.status === 'offline' && 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                          )}>
                            {node.status}
                          </span>
                        </td>
                        <td className="py-2 pr-4 text-gray-900 dark:text-white">{node.cpu_cores} cores</td>
                        <td className="py-2 pr-4 text-gray-900 dark:text-white">{node.ram_gb} GB</td>
                        <td className="py-2 pr-4 font-medium text-gray-900 dark:text-white">{node.capacity?.toLocaleString()}</td>
                        {systemCapacity.cluster_enabled && (
                          <td className="py-2 pr-4 text-gray-900 dark:text-white">{node.cpu_usage?.toFixed(1)}%</td>
                        )}
                        {systemCapacity.cluster_enabled && (
                          <td className="py-2 text-gray-900 dark:text-white">{node.mem_usage?.toFixed(1)}%</td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Capacity Formula Explanation */}
          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-xs">
            <div className="font-medium text-blue-800 dark:text-blue-300 mb-1">Capacity Formula</div>
            <div className="text-blue-700 dark:text-blue-400 space-y-1">
              <div><span className="font-mono bg-blue-100 dark:bg-blue-800/30 px-1 rounded">{systemCapacity.total_cpu_cores} cores × 2000</span> = {(systemCapacity.total_cpu_cores * 2000).toLocaleString()} base users/CPU</div>
              <div><span className="font-mono bg-blue-100 dark:bg-blue-800/30 px-1 rounded">× {systemCapacity.storage_multiplier}</span> storage factor ({systemCapacity.storage_type?.toUpperCase()})</div>
              <div><span className="font-mono bg-blue-100 dark:bg-blue-800/30 px-1 rounded">× {systemCapacity.interim_factor}</span> interim factor ({systemCapacity.interim_interval} min)</div>
              <div><span className="font-mono bg-blue-100 dark:bg-blue-800/30 px-1 rounded">× {systemCapacity.safety_margin}</span> safety margin (15% reserve)</div>
              <div className="pt-1 border-t border-blue-200 dark:border-blue-700">
                <span className="font-medium">= {systemCapacity.maximum_capacity?.toLocaleString()} max users</span>
                {systemCapacity.limiting_factor && (
                  <span className="ml-2 text-blue-600 dark:text-blue-400">(limited by {systemCapacity.limiting_factor?.toUpperCase()})</span>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-4 text-xs text-gray-500 dark:text-gray-400">
            <div><span className="font-medium">CPU Model:</span> {systemCapacity.cpu_model?.split('@')[0]?.trim() || 'N/A'}</div>
            <div><span className="font-medium">DB Writes/sec:</span> {systemCapacity.db_writes_per_sec}</div>
            <div><span className="font-medium">NAS Routers:</span> {systemCapacity.nas_count}</div>
            <div><span className="font-medium">Total Subs:</span> {systemCapacity.total_subscribers?.toLocaleString()}</div>
          </div>
        </div>
      )}


      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 card p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">New vs Expired Users</h2>
          <ReactECharts option={lineChartOption} style={{ height: '300px' }} />
        </div>
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Users by Service</h2>
          <ReactECharts option={pieChartOption} style={{ height: '300px' }} />
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="card p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Recent Transactions</h2>
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>User</th>
                <th>Amount</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {transactions?.map((tx) => (
                <tr key={tx.id}>
                  <td>{formatDate(tx.created_at)}</td>
                  <td>
                    <span className={clsx('badge', tx.type === 'renewal' ? 'badge-success' : tx.type === 'new' ? 'badge-info' : 'badge-gray')}>
                      {tx.type}
                    </span>
                  </td>
                  <td>{tx.subscriber?.username || '-'}</td>
                  <td className={tx.amount >= 0 ? 'text-green-600' : 'text-red-600'}>
                    ${Math.abs(tx.amount).toFixed(2)}
                  </td>
                  <td className="max-w-xs truncate">{tx.description}</td>
                </tr>
              )) || (
                <tr>
                  <td colSpan={5} className="text-center text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">No transactions</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
