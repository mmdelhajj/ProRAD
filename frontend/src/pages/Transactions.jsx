import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { dashboardApi } from '../services/api'
import { formatDate, formatTime } from '../utils/timezone'
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
} from '@tanstack/react-table'
import {
  ArrowPathIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  BanknotesIcon,
} from '@heroicons/react/24/outline'
import clsx from 'clsx'

const typeFilters = [
  { value: '', label: 'All Types' },
  { value: 'new', label: 'New Subscription' },
  { value: 'renewal', label: 'Renewal' },
  { value: 'change_service', label: 'Change Service' },
  { value: 'refund', label: 'Refund' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'withdraw', label: 'Withdrawal' },
  { value: 'reset_fup', label: 'Reset FUP' },
  { value: 'refill', label: 'Refill' },
]

export default function Transactions() {
  const [page, setPage] = useState(1)
  const [limit] = useState(25)
  const [search, setSearch] = useState('')
  const [type, setType] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [showFilters, setShowFilters] = useState(false)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['transactions', page, limit, search, type, dateFrom, dateTo],
    queryFn: () =>
      dashboardApi
        .transactions({ page, limit, search, type, date_from: dateFrom, date_to: dateTo })
        .then((r) => r.data),
  })

  const columns = useMemo(
    () => [
      {
        accessorKey: 'created_at',
        header: 'Date',
        cell: ({ row }) => (
          <div className="text-sm">
            <div>{formatDate(row.original.created_at)}</div>
            <div className="text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">
              {formatTime(row.original.created_at)}
            </div>
          </div>
        ),
      },
      {
        accessorKey: 'type',
        header: 'Type',
        cell: ({ row }) => {
          const typeColors = {
            new: 'badge-success',
            renewal: 'badge-info',
            change_service: 'badge-purple',
            refund: 'badge-warning',
            transfer: 'badge-primary',
            withdraw: 'badge-danger',
            reset_fup: 'badge-orange',
            refill: 'badge-success',
            adjustment: 'badge-gray',
          }
          const typeLabels = {
            new: 'New',
            renewal: 'Renewal',
            change_service: 'Change Service',
            refund: 'Refund',
            transfer: 'Transfer',
            withdraw: 'Withdrawal',
            reset_fup: 'Reset FUP',
            refill: 'Refill',
          }
          return (
            <span className={clsx('badge', typeColors[row.original.type] || 'badge-gray')}>
              {typeLabels[row.original.type] || row.original.type}
            </span>
          )
        },
      },
      {
        accessorKey: 'subscriber',
        header: 'User',
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.subscriber?.username || '-'}</div>
            <div className="text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">
              {row.original.subscriber?.fullname || row.original.reseller?.username || ''}
            </div>
          </div>
        ),
      },
      {
        accessorKey: 'service',
        header: 'Service',
        cell: ({ row }) => {
          const t = row.original
          if (t.type === 'change_service' && (t.old_service_name || t.new_service_name)) {
            return (
              <div className="text-sm">
                <span className="text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">{t.old_service_name || '-'}</span>
                <span className="mx-1 text-gray-400 dark:text-gray-500 dark:text-gray-400">→</span>
                <span className="font-medium text-primary-600">{t.new_service_name || '-'}</span>
              </div>
            )
          }
          if (t.service_name) {
            return <span className="text-sm">{t.service_name}</span>
          }
          return <span className="text-sm text-gray-400 dark:text-gray-500 dark:text-gray-400">-</span>
        },
      },
      {
        accessorKey: 'amount',
        header: 'Amount',
        cell: ({ row }) => (
          <div className={clsx('flex items-center gap-1 font-semibold', row.original.amount >= 0 ? 'text-green-600' : 'text-red-600')}>
            {row.original.amount >= 0 ? (
              <ArrowTrendingUpIcon className="w-4 h-4" />
            ) : (
              <ArrowTrendingDownIcon className="w-4 h-4" />
            )}
            ${Math.abs(row.original.amount).toFixed(2)}
          </div>
        ),
      },
      {
        accessorKey: 'balance_after',
        header: 'Balance After',
        cell: ({ row }) =>
          row.original.balance_after !== undefined
            ? `$${row.original.balance_after?.toFixed(2)}`
            : '-',
      },
      {
        accessorKey: 'description',
        header: 'Description',
        cell: ({ row }) => (
          <div className="max-w-xs truncate text-sm text-gray-600 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">
            {row.original.description || '-'}
          </div>
        ),
      },
      {
        accessorKey: 'reference',
        header: 'Reference',
        cell: ({ row }) => (
          <code className="text-xs px-2 py-1 bg-gray-100 rounded">
            {row.original.reference || '-'}
          </code>
        ),
      },
    ],
    []
  )

  const table = useReactTable({
    data: data?.data || [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  const totalPages = Math.ceil((data?.meta?.total || 0) / limit)

  // Calculate summary stats
  const totalIncome = data?.data?.reduce((sum, t) => (t.amount > 0 ? sum + t.amount : sum), 0) || 0
  const totalExpense = data?.data?.reduce((sum, t) => (t.amount < 0 ? sum + Math.abs(t.amount) : sum), 0) || 0

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Transactions</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Financial transaction history</p>
        </div>
        <button
          onClick={() => refetch()}
          className="btn-secondary flex items-center gap-2 w-full sm:w-auto justify-center"
        >
          <ArrowPathIcon className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <BanknotesIcon className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <div className="text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">Total Transactions</div>
              <div className="text-2xl font-bold">{data?.meta?.total || 0}</div>
            </div>
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <ArrowTrendingUpIcon className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <div className="text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">Page Income</div>
              <div className="text-2xl font-bold text-green-600">${totalIncome.toFixed(2)}</div>
            </div>
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 rounded-lg">
              <ArrowTrendingDownIcon className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <div className="text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">Page Expense</div>
              <div className="text-2xl font-bold text-red-600">${totalExpense.toFixed(2)}</div>
            </div>
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 dark:bg-purple-900/50 rounded-lg">
              <BanknotesIcon className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <div className="text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">Page Net</div>
              <div className={clsx('text-2xl font-bold', totalIncome - totalExpense >= 0 ? 'text-green-600' : 'text-red-600')}>
                ${(totalIncome - totalExpense).toFixed(2)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="card p-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-gray-500 dark:text-gray-400" />
            <input
              type="text"
              placeholder="Search by username, description, reference..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
              className="input pl-10"
            />
          </div>
          <div className="flex items-center gap-3">
            <select
              value={type}
              onChange={(e) => {
                setType(e.target.value)
                setPage(1)
              }}
              className="input"
            >
              {typeFilters.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={clsx(
                'btn-secondary flex items-center gap-2',
                showFilters && 'bg-primary-50 text-primary-600'
              )}
            >
              <FunnelIcon className="w-4 h-4" />
              Filters
            </button>
          </div>
        </div>

        {showFilters && (
          <div className="mt-4 pt-4 border-t grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="label">Date From</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value)
                  setPage(1)
                }}
                className="input"
              />
            </div>
            <div>
              <label className="label">Date To</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value)
                  setPage(1)
                }}
                className="input"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={() => {
                  setSearch('')
                  setType('')
                  setDateFrom('')
                  setDateTo('')
                  setPage(1)
                }}
                className="btn-secondary"
              >
                Clear Filters
              </button>
            </div>
          </div>
        )}
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
                    <div className="flex items-center justify-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
                    </div>
                  </td>
                </tr>
              ) : table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="text-center py-8 text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">
                    No transactions found
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50 dark:bg-gray-700">
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

        {/* Pagination */}
        <div className="flex items-center justify-between px-6 py-4 border-t">
          <div className="text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">
            Showing {((page - 1) * limit) + 1} to {Math.min(page * limit, data?.meta?.total || 0)} of{' '}
            {data?.meta?.total || 0} results
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="btn-secondary p-2 disabled:opacity-50"
            >
              <ChevronLeftIcon className="w-5 h-5" />
            </button>
            <span className="px-4 py-2 text-sm">
              Page {page} of {totalPages || 1}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="btn-secondary p-2 disabled:opacity-50"
            >
              <ChevronRightIcon className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
