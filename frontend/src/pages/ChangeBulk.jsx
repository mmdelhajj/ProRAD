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
  FunnelIcon,
  BoltIcon,
  UsersIcon,
  AdjustmentsHorizontalIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  XMarkIcon,
  CalendarDaysIcon,
  CurrencyDollarIcon,
  ServerStackIcon,
  UserGroupIcon,
  ArrowPathIcon,
  NoSymbolIcon,
  CheckIcon,
  CircleStackIcon,
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
  const [showConfirmModal, setShowConfirmModal] = useState(false)

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
      toast.success(res.data.message || 'Bulk action completed successfully')
      setPreviewData(null)
      setPreviewTotal(0)
      setShowConfirmModal(false)
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Failed to execute')
      setShowConfirmModal(false)
    },
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
    setShowConfirmModal(true)
  }

  const confirmExecute = () => {
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
    { value: '', label: 'Select an action...', icon: null },
    { value: 'set_expiry', label: 'Set Expiry Date', icon: CalendarDaysIcon },
    { value: 'set_service', label: 'Change Service', icon: ServerStackIcon },
    { value: 'set_reseller', label: 'Change Reseller', icon: UserGroupIcon },
    { value: 'set_active', label: 'Activate Subscribers', icon: CheckIcon },
    { value: 'set_inactive', label: 'Deactivate Subscribers', icon: NoSymbolIcon },
    { value: 'set_monthly_quota', label: 'Set Monthly Quota (GB)', icon: CircleStackIcon },
    { value: 'set_daily_quota', label: 'Set Daily Quota (MB)', icon: CircleStackIcon },
    { value: 'set_price', label: 'Set Price', icon: CurrencyDollarIcon },
    { value: 'reset_mac', label: 'Reset MAC Address', icon: ArrowPathIcon },
  ]

  const filterFields = [
    { value: 'username', label: 'Username' },
    { value: 'expiry', label: 'Expiry Date' },
    { value: 'name', label: 'Full Name' },
    { value: 'address', label: 'Address' },
    { value: 'price', label: 'Price' },
  ]

  const filterRules = [
    { value: 'equal', label: '= Equal' },
    { value: 'notequal', label: '≠ Not Equal' },
    { value: 'greater', label: '> Greater Than' },
    { value: 'less', label: '< Less Than' },
    { value: 'like', label: '~ Contains' },
  ]

  const renderActionInput = () => {
    switch (action) {
      case 'set_expiry':
        return (
          <input
            type="date"
            className="mt-1 block w-full rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:focus:ring-blue-400"
            value={actionValue}
            onChange={(e) => setActionValue(e.target.value)}
          />
        )
      case 'set_service':
        return (
          <select
            className="mt-1 block w-full rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:focus:ring-blue-400"
            value={actionValue}
            onChange={(e) => setActionValue(e.target.value)}
          >
            <option value="">Select service...</option>
            {services?.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        )
      case 'set_reseller':
        return (
          <select
            className="mt-1 block w-full rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:focus:ring-blue-400"
            value={actionValue}
            onChange={(e) => setActionValue(e.target.value)}
          >
            <option value="">Select reseller...</option>
            {resellers?.map(r => (
              <option key={r.id} value={r.id}>{r.User?.username || r.company_name}</option>
            ))}
          </select>
        )
      case 'set_monthly_quota':
        return (
          <div className="relative mt-1">
            <input
              type="number"
              className="block w-full rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 pr-12"
              placeholder="Enter quota"
              value={actionValue}
              onChange={(e) => setActionValue(e.target.value)}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400 text-sm">GB</span>
          </div>
        )
      case 'set_daily_quota':
        return (
          <div className="relative mt-1">
            <input
              type="number"
              className="block w-full rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 pr-12"
              placeholder="Enter quota"
              value={actionValue}
              onChange={(e) => setActionValue(e.target.value)}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400 text-sm">MB</span>
          </div>
        )
      case 'set_price':
        return (
          <div className="relative mt-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400">$</span>
            <input
              type="number"
              step="0.01"
              className="block w-full rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 pl-7"
              placeholder="0.00"
              value={actionValue}
              onChange={(e) => setActionValue(e.target.value)}
            />
          </div>
        )
      default:
        return null
    }
  }

  const getActionIcon = () => {
    const actionDef = actionOptions.find(a => a.value === action)
    if (actionDef?.icon) {
      const Icon = actionDef.icon
      return <Icon className="w-5 h-5" />
    }
    return <BoltIcon className="w-5 h-5" />
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-xl text-white">
              <AdjustmentsHorizontalIcon className="w-6 h-6" />
            </div>
            Bulk Operations
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Apply changes to multiple subscribers at once</p>
        </div>
        {previewTotal > 0 && (
          <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 rounded-lg">
            <UsersIcon className="w-5 h-5 text-blue-600" />
            <span className="text-blue-700 font-medium">{previewTotal} subscribers selected</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Filters */}
        <div className="lg:col-span-2 space-y-6">
          {/* Basic Filters */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 bg-gradient-to-r from-gray-50 to-white dark:from-gray-700 dark:to-gray-800 border-b border-gray-200 dark:border-gray-700">
              <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <FunnelIcon className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                Filter Subscribers
              </h2>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Reseller Filter */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Reseller</label>
                  <select
                    className="block w-full rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:focus:ring-blue-400"
                    value={filters.reseller_id}
                    onChange={(e) => setFilters({ ...filters, reseller_id: parseInt(e.target.value) })}
                  >
                    <option value={0}>All Resellers</option>
                    {resellers?.map(r => (
                      <option key={r.id} value={r.id}>{r.User?.username || r.company_name}</option>
                    ))}
                  </select>
                </div>

                {/* Service Filter */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Service</label>
                  <select
                    className="block w-full rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:focus:ring-blue-400"
                    value={filters.service_id}
                    onChange={(e) => setFilters({ ...filters, service_id: parseInt(e.target.value) })}
                  >
                    <option value={0}>All Services</option>
                    {services?.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>

                {/* Status Filter */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Status</label>
                  <select
                    className="block w-full rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:focus:ring-blue-400"
                    value={filters.status_filter}
                    onChange={(e) => setFilters({ ...filters, status_filter: e.target.value })}
                  >
                    <option value="all">All Statuses</option>
                    <option value="active">Active Only</option>
                    <option value="inactive">Inactive Only</option>
                    <option value="active_inactive">Active & Inactive</option>
                    <option value="expired">Expired Only</option>
                  </select>
                </div>

                {/* Include Sub-resellers */}
                <div className="flex items-center">
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={filters.include_sub_resellers}
                      onChange={(e) => setFilters({ ...filters, include_sub_resellers: e.target.checked })}
                    />
                    <div className="w-11 h-6 bg-gray-200 dark:bg-gray-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    <span className="ml-3 text-sm font-medium text-gray-700 dark:text-gray-300">Include Sub-resellers</span>
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* Custom Filters */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 bg-gradient-to-r from-gray-50 to-white dark:from-gray-700 dark:to-gray-800 border-b border-gray-200 dark:border-gray-700">
              <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <AdjustmentsHorizontalIcon className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                Advanced Filters
              </h2>
            </div>
            <div className="p-6">
              <div className="flex gap-3 items-end flex-wrap">
                <div className="flex-1 min-w-[140px]">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Field</label>
                  <select
                    className="block w-full rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                    value={newFilter.field}
                    onChange={(e) => setNewFilter({ ...newFilter, field: e.target.value })}
                  >
                    {filterFields.map(f => (
                      <option key={f.value} value={f.value}>{f.label}</option>
                    ))}
                  </select>
                </div>

                <div className="flex-1 min-w-[140px]">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Condition</label>
                  <select
                    className="block w-full rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                    value={newFilter.rule}
                    onChange={(e) => setNewFilter({ ...newFilter, rule: e.target.value })}
                  >
                    {filterRules.map(r => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </div>

                <div className="flex-1 min-w-[160px]">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Value</label>
                  <input
                    type="text"
                    className="block w-full rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                    value={newFilter.value}
                    onChange={(e) => setNewFilter({ ...newFilter, value: e.target.value })}
                    placeholder="Enter value..."
                    onKeyDown={(e) => e.key === 'Enter' && handleAddFilter()}
                  />
                </div>

                <button
                  onClick={handleAddFilter}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
                >
                  <PlusIcon className="w-4 h-4" />
                  Add
                </button>
              </div>

              {/* Active Custom Filters */}
              {customFilters.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <p className="text-sm text-gray-500 mb-3">Active filters:</p>
                  <div className="flex flex-wrap gap-2">
                    {customFilters.map((f, i) => (
                      <div
                        key={i}
                        className="inline-flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/30 dark:to-indigo-900/30 border border-blue-200 dark:border-blue-700 rounded-full text-sm"
                      >
                        <span className="font-medium text-blue-700 dark:text-blue-300">{filterFields.find(ff => ff.value === f.field)?.label}</span>
                        <span className="text-blue-400 dark:text-blue-400">{filterRules.find(r => r.value === f.rule)?.label.split(' ')[0]}</span>
                        <span className="font-semibold text-blue-900 dark:text-blue-200">"{f.value}"</span>
                        <button
                          onClick={() => handleRemoveFilter(i)}
                          className="ml-1 text-blue-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                        >
                          <XMarkIcon className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column - Action */}
        <div className="space-y-6">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 overflow-hidden sticky top-6">
            <div className="px-6 py-4 bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/30 dark:to-indigo-900/30 border-b border-gray-200 dark:border-gray-700">
              <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <BoltIcon className="w-5 h-5 text-purple-500" />
                Action to Perform
              </h2>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Select Action</label>
                <select
                  className="block w-full rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-purple-500 focus:ring-purple-500"
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
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {actionOptions.find(a => a.value === action)?.label}
                  </label>
                  {renderActionInput()}
                </div>
              )}

              {/* Action description */}
              {action && (
                <div className="p-3 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg">
                  <div className="flex gap-2">
                    <ExclamationTriangleIcon className="w-5 h-5 text-amber-500 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-amber-700 dark:text-amber-300">
                      {action === 'set_active' && 'This will activate all matching subscribers.'}
                      {action === 'set_inactive' && 'This will deactivate all matching subscribers.'}
                      {action === 'set_expiry' && 'This will update the expiry date for all matching subscribers.'}
                      {action === 'set_service' && 'This will change the service plan for all matching subscribers.'}
                      {action === 'set_reseller' && 'This will transfer all matching subscribers to another reseller.'}
                      {action === 'set_monthly_quota' && 'This will set the monthly quota limit for all matching subscribers.'}
                      {action === 'set_daily_quota' && 'This will set the daily quota limit for all matching subscribers.'}
                      {action === 'set_price' && 'This will update the price for all matching subscribers.'}
                      {action === 'reset_mac' && 'This will reset the MAC address binding for all matching subscribers.'}
                    </p>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="pt-4 space-y-3">
                <button
                  onClick={handlePreview}
                  disabled={previewMutation.isPending}
                  className="w-full px-4 py-2.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors flex items-center justify-center gap-2 font-medium disabled:opacity-50"
                >
                  <EyeIcon className="w-5 h-5" />
                  {previewMutation.isPending ? 'Loading Preview...' : 'Preview Changes'}
                </button>
                <button
                  onClick={handleExecute}
                  disabled={!action || executeMutation.isPending}
                  className="w-full px-4 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg hover:from-purple-700 hover:to-indigo-700 transition-all flex items-center justify-center gap-2 font-medium disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-purple-500/25"
                >
                  {getActionIcon()}
                  {executeMutation.isPending ? 'Executing...' : 'Execute Action'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Preview Table */}
      {previewData && previewData.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/30 dark:to-emerald-900/30 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <CheckCircleIcon className="w-5 h-5 text-green-500 dark:text-green-400" />
              Preview Results
              <span className="ml-2 px-2.5 py-0.5 bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300 rounded-full text-sm font-medium">
                {previewTotal} subscribers
              </span>
            </h2>
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500 dark:text-gray-400">Rows per page:</span>
              <select
                className="rounded-lg border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm py-1"
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
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-700">
                {table.getHeaderGroups().map(headerGroup => (
                  <tr key={headerGroup.id}>
                    {headerGroup.headers.map(header => (
                      <th
                        key={header.id}
                        className="px-6 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider"
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {table.getRowModel().rows.map((row, idx) => (
                  <tr key={row.id} className={idx % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-700'}>
                    {row.getVisibleCells().map(cell => (
                      <td key={cell.id} className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
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
            <div className="px-6 py-4 bg-gray-50 dark:bg-gray-700 border-t border-gray-200 dark:border-gray-600 flex items-center justify-between">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Showing {((page - 1) * pageSize) + 1} to {Math.min(page * pageSize, previewTotal)} of {previewTotal} results
              </p>
              <div className="flex items-center gap-2">
                <button
                  className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                  disabled={page === 1}
                  onClick={() => {
                    setPage(page - 1)
                    setTimeout(handlePreview, 0)
                  }}
                >
                  <ChevronLeftIcon className="w-4 h-4" />
                  Previous
                </button>
                <span className="px-4 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
                  Page {page} of {Math.ceil(previewTotal / pageSize)}
                </span>
                <button
                  className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                  disabled={page >= Math.ceil(previewTotal / pageSize)}
                  onClick={() => {
                    setPage(page + 1)
                    setTimeout(handlePreview, 0)
                  }}
                >
                  Next
                  <ChevronRightIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Empty preview state */}
      {previewData && previewData.length === 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <UsersIcon className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">No subscribers found</h3>
          <p className="text-gray-500 dark:text-gray-400">Try adjusting your filters to match more subscribers.</p>
        </div>
      )}

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-md w-full overflow-hidden">
            <div className="p-6 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/30 dark:to-orange-900/30 border-b border-amber-200 dark:border-amber-700">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-100 dark:bg-amber-900/50 rounded-full">
                  <ExclamationTriangleIcon className="w-6 h-6 text-amber-600 dark:text-amber-400" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Confirm Bulk Action</h3>
              </div>
            </div>
            <div className="p-6">
              <p className="text-gray-600 dark:text-gray-300 mb-4">
                You are about to perform <span className="font-semibold text-gray-900 dark:text-white">"{actionOptions.find(a => a.value === action)?.label}"</span> on
                <span className="font-semibold text-blue-600 dark:text-blue-400"> {previewTotal || 'all matching'} subscribers</span>.
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">This action cannot be undone. Are you sure you want to continue?</p>
            </div>
            <div className="px-6 py-4 bg-gray-50 dark:bg-gray-700 flex gap-3 justify-end">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-500 font-medium"
              >
                Cancel
              </button>
              <button
                onClick={confirmExecute}
                disabled={executeMutation.isPending}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium disabled:opacity-50 flex items-center gap-2"
              >
                {executeMutation.isPending ? (
                  <>
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Executing...
                  </>
                ) : (
                  <>
                    <CheckIcon className="w-4 h-4" />
                    Yes, Execute
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
