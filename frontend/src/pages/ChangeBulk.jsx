import { useState, useMemo } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import api, { serviceApi, resellerApi } from '../services/api'
import { formatDate } from '../utils/timezone'
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
} from '@tanstack/react-table'
import {
  PlusIcon,
  TrashIcon,
  EyeIcon,
  PlayIcon,
} from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'

export default function ChangeBulk() {
  const [filters, setFilters] = useState({
    reseller_id: 0,
    service_id: 0,
    status_filter: 'all',
    include_sub_resellers: false,
  })
  const [action, setAction] = useState('')
  const [actionValue, setActionValue] = useState('')
  const [customFilters, setCustomFilters] = useState([])
  const [newFilter, setNewFilter] = useState({ field: 'username', rule: 'like', value: '' })
  const [previewData, setPreviewData] = useState(null)
  const [previewTotal, setPreviewTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)

  // Fetch services
  const { data: services } = useQuery({
    queryKey: ['services'],
    queryFn: () => serviceApi.list().then(r => r.data.data || []),
  })

  // Fetch resellers
  const { data: resellers } = useQuery({
    queryKey: ['resellers'],
    queryFn: () => resellerApi.list().then(r => r.data.data || []),
  })

  // Preview mutation
  const previewMutation = useMutation({
    mutationFn: (data) => api.post(`/subscribers/change-bulk?page=${page}&limit=${pageSize}`, { ...data, preview: true }),
    onSuccess: (res) => {
      setPreviewData(res.data.data || [])
      setPreviewTotal(res.data.meta?.total || 0)
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to preview'),
  })

  // Execute mutation
  const executeMutation = useMutation({
    mutationFn: (data) => api.post('/subscribers/change-bulk', { ...data, preview: false }),
    onSuccess: (res) => {
      toast.success(res.data.message || 'Bulk action completed')
      setPreviewData(null)
      setPreviewTotal(0)
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to execute'),
  })

  const handleAddFilter = () => {
    if (newFilter.value.trim()) {
      setCustomFilters([...customFilters, { ...newFilter }])
      setNewFilter({ field: 'username', rule: 'like', value: '' })
    }
  }

  const handleRemoveFilter = (index) => {
    setCustomFilters(customFilters.filter((_, i) => i !== index))
  }

  const handlePreview = () => {
    const data = {
      ...filters,
      action,
      action_value: actionValue,
      filters: customFilters,
    }
    previewMutation.mutate(data)
  }

  const handleExecute = () => {
    if (!action) {
      toast.error('Please select an action')
      return
    }
    if (['set_expiry', 'set_service', 'set_reseller', 'set_monthly_quota', 'set_daily_quota', 'set_price'].includes(action) && !actionValue) {
      toast.error('Please enter a value for the action')
      return
    }
    const data = {
      ...filters,
      action,
      action_value: actionValue,
      filters: customFilters,
    }
    executeMutation.mutate(data)
  }

  // Table columns
  const columns = useMemo(() => [
    { accessorKey: 'username', header: 'Username' },
    { accessorKey: 'full_name', header: 'Name' },
    {
      accessorKey: 'Reseller',
      header: 'Reseller',
      cell: ({ row }) => row.original.Reseller?.User?.username || '-',
    },
    { accessorKey: 'address', header: 'Address' },
    { accessorKey: 'price', header: 'Price', cell: ({ getValue }) => `$${getValue()?.toFixed(2) || '0.00'}` },
    { accessorKey: 'phone', header: 'Phone' },
    {
      accessorKey: 'Service',
      header: 'Service',
      cell: ({ row }) => row.original.Service?.name || '-',
    },
    {
      accessorKey: 'created_at',
      header: 'Created',
      cell: ({ getValue }) => formatDate(getValue()),
    },
    {
      accessorKey: 'expiry_date',
      header: 'Expiry',
      cell: ({ getValue }) => formatDate(getValue()),
    },
  ], [])

  const table = useReactTable({
    data: previewData || [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  const actionOptions = [
    { value: '', label: 'Please select action' },
    { value: 'set_expiry', label: 'Set expiry date' },
    { value: 'set_service', label: 'Set service' },
    { value: 'set_reseller', label: 'Set reseller' },
    { value: 'set_active', label: 'Set active' },
    { value: 'set_inactive', label: 'Set inactive' },
    { value: 'set_monthly_quota', label: 'Set monthly quota (GB)' },
    { value: 'set_daily_quota', label: 'Set daily quota (MB)' },
    { value: 'set_price', label: 'Set price' },
    { value: 'reset_mac', label: 'Reset MAC' },
  ]

  const filterFields = [
    { value: 'username', label: 'Username' },
    { value: 'expiry', label: 'Expiry' },
    { value: 'name', label: 'Name' },
    { value: 'address', label: 'Address' },
    { value: 'price', label: 'Price' },
  ]

  const filterRules = [
    { value: 'equal', label: 'Equal' },
    { value: 'notequal', label: 'Not Equal' },
    { value: 'greater', label: 'Greater' },
    { value: 'less', label: 'Less' },
    { value: 'like', label: 'Like' },
  ]

  const renderActionInput = () => {
    switch (action) {
      case 'set_expiry':
        return (
          <input
            type="date"
            className="input input-bordered w-full"
            value={actionValue}
            onChange={(e) => setActionValue(e.target.value)}
          />
        )
      case 'set_service':
        return (
          <select
            className="select select-bordered w-full"
            value={actionValue}
            onChange={(e) => setActionValue(e.target.value)}
          >
            <option value="">Select service</option>
            {services?.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        )
      case 'set_reseller':
        return (
          <select
            className="select select-bordered w-full"
            value={actionValue}
            onChange={(e) => setActionValue(e.target.value)}
          >
            <option value="">Select reseller</option>
            {resellers?.map(r => (
              <option key={r.id} value={r.id}>{r.User?.username || r.company_name}</option>
            ))}
          </select>
        )
      case 'set_monthly_quota':
        return (
          <input
            type="number"
            className="input input-bordered w-full"
            placeholder="Quota in GB"
            value={actionValue}
            onChange={(e) => setActionValue(e.target.value)}
          />
        )
      case 'set_daily_quota':
        return (
          <input
            type="number"
            className="input input-bordered w-full"
            placeholder="Quota in MB"
            value={actionValue}
            onChange={(e) => setActionValue(e.target.value)}
          />
        )
      case 'set_price':
        return (
          <input
            type="number"
            step="0.01"
            className="input input-bordered w-full"
            placeholder="Price"
            value={actionValue}
            onChange={(e) => setActionValue(e.target.value)}
          />
        )
      default:
        return null
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Change Bulk</h1>
        <p className="text-gray-600">Perform bulk operations on subscribers based on filters</p>
      </div>

      {/* Filters Card */}
      <div className="card bg-base-100 shadow">
        <div className="card-body">
          <h2 className="card-title text-lg">Filters & Action</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Reseller Filter */}
            <div className="form-control">
              <label className="label">
                <span className="label-text">Reseller</span>
              </label>
              <select
                className="select select-bordered"
                value={filters.reseller_id}
                onChange={(e) => setFilters({ ...filters, reseller_id: parseInt(e.target.value) })}
              >
                <option value={0}>All</option>
                {resellers?.map(r => (
                  <option key={r.id} value={r.id}>{r.User?.username || r.company_name}</option>
                ))}
              </select>
            </div>

            {/* Service Filter */}
            <div className="form-control">
              <label className="label">
                <span className="label-text">Service</span>
              </label>
              <select
                className="select select-bordered"
                value={filters.service_id}
                onChange={(e) => setFilters({ ...filters, service_id: parseInt(e.target.value) })}
              >
                <option value={0}>All</option>
                {services?.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            {/* Status Filter */}
            <div className="form-control">
              <label className="label">
                <span className="label-text">Status</span>
              </label>
              <select
                className="select select-bordered"
                value={filters.status_filter}
                onChange={(e) => setFilters({ ...filters, status_filter: e.target.value })}
              >
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="active_inactive">Active/Inactive</option>
                <option value="expired">Expired</option>
              </select>
            </div>

            {/* Include Sub-resellers */}
            <div className="form-control">
              <label className="label cursor-pointer justify-start gap-2">
                <input
                  type="checkbox"
                  className="checkbox checkbox-primary"
                  checked={filters.include_sub_resellers}
                  onChange={(e) => setFilters({ ...filters, include_sub_resellers: e.target.checked })}
                />
                <span className="label-text">Include Sub-resellers</span>
              </label>
            </div>

            {/* Action */}
            <div className="form-control">
              <label className="label">
                <span className="label-text">Action to be done</span>
              </label>
              <select
                className="select select-bordered"
                value={action}
                onChange={(e) => {
                  setAction(e.target.value)
                  setActionValue('')
                }}
              >
                {actionOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            {/* Action Value */}
            {action && !['set_active', 'set_inactive', 'reset_mac'].includes(action) && (
              <div className="form-control">
                <label className="label">
                  <span className="label-text">{actionOptions.find(a => a.value === action)?.label}</span>
                </label>
                {renderActionInput()}
              </div>
            )}
          </div>

          {/* Custom Filters */}
          <div className="divider">Custom Filters</div>

          <div className="flex gap-2 items-end flex-wrap">
            <div className="form-control">
              <label className="label">
                <span className="label-text">Field</span>
              </label>
              <select
                className="select select-bordered select-sm"
                value={newFilter.field}
                onChange={(e) => setNewFilter({ ...newFilter, field: e.target.value })}
              >
                {filterFields.map(f => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </select>
            </div>

            <div className="form-control">
              <label className="label">
                <span className="label-text">Rule</span>
              </label>
              <select
                className="select select-bordered select-sm"
                value={newFilter.rule}
                onChange={(e) => setNewFilter({ ...newFilter, rule: e.target.value })}
              >
                {filterRules.map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>

            <div className="form-control">
              <label className="label">
                <span className="label-text">Value</span>
              </label>
              <input
                type="text"
                className="input input-bordered input-sm"
                value={newFilter.value}
                onChange={(e) => setNewFilter({ ...newFilter, value: e.target.value })}
                placeholder="Filter value"
              />
            </div>

            <button
              className="btn btn-primary btn-sm"
              onClick={handleAddFilter}
            >
              <PlusIcon className="w-4 h-4" />
            </button>
          </div>

          {/* Active Custom Filters */}
          {customFilters.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-4">
              {customFilters.map((f, i) => (
                <div key={i} className="badge badge-lg gap-2">
                  <span>{filterFields.find(ff => ff.value === f.field)?.label}</span>
                  <span className="text-xs opacity-70">{filterRules.find(r => r.value === f.rule)?.label}</span>
                  <span className="font-semibold">{f.value}</span>
                  <button
                    className="btn btn-ghost btn-xs"
                    onClick={() => handleRemoveFilter(i)}
                  >
                    <TrashIcon className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2 mt-6">
            <button
              className="btn btn-success"
              onClick={handleExecute}
              disabled={!action || executeMutation.isPending}
            >
              <PlayIcon className="w-4 h-4" />
              {executeMutation.isPending ? 'Executing...' : 'Execute'}
            </button>
            <button
              className="btn btn-outline"
              onClick={handlePreview}
              disabled={previewMutation.isPending}
            >
              <EyeIcon className="w-4 h-4" />
              {previewMutation.isPending ? 'Loading...' : 'Preview'}
            </button>
          </div>
        </div>
      </div>

      {/* Preview Table */}
      {previewData && (
        <div className="card bg-base-100 shadow">
          <div className="card-body">
            <div className="flex justify-between items-center">
              <h2 className="card-title text-lg">Preview ({previewTotal} subscribers affected)</h2>
              <div className="flex items-center gap-2">
                <span className="text-sm">Page size:</span>
                <select
                  className="select select-bordered select-sm"
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(parseInt(e.target.value))
                    setPage(1)
                  }}
                >
                  <option value={10}>10</option>
                  <option value={30}>30</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="table table-zebra">
                <thead>
                  {table.getHeaderGroups().map(headerGroup => (
                    <tr key={headerGroup.id}>
                      {headerGroup.headers.map(header => (
                        <th key={header.id}>
                          {flexRender(header.column.columnDef.header, header.getContext())}
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody>
                  {table.getRowModel().rows.map(row => (
                    <tr key={row.id}>
                      {row.getVisibleCells().map(cell => (
                        <td key={cell.id}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {previewTotal > pageSize && (
              <div className="flex justify-center gap-2 mt-4">
                <button
                  className="btn btn-sm"
                  disabled={page === 1}
                  onClick={() => {
                    setPage(page - 1)
                    handlePreview()
                  }}
                >
                  Previous
                </button>
                <span className="flex items-center px-4">
                  Page {page} of {Math.ceil(previewTotal / pageSize)}
                </span>
                <button
                  className="btn btn-sm"
                  disabled={page >= Math.ceil(previewTotal / pageSize)}
                  onClick={() => {
                    setPage(page + 1)
                    handlePreview()
                  }}
                >
                  Next
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
