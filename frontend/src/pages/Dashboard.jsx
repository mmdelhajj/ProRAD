import { useQuery } from '@tanstack/react-query'
import { dashboardApi } from '../services/api'
import { formatDate } from '../utils/timezone'
import { useBrandingStore } from '../store/brandingStore'
import ReactECharts from 'echarts-for-react'
import {
  UsersIcon,
  SignalIcon,
  CurrencyDollarIcon,
  ServerIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  ClockIcon,
} from '@heroicons/react/24/outline'
import clsx from 'clsx'

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
