import { useState, useMemo, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { subscriberApi, serviceApi, nasApi, resellerApi } from '../services/api'
import { useAuthStore } from '../store/authStore'
import { formatDate } from '../utils/timezone'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
} from '@tanstack/react-table'
import {
  PlusIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
  ArrowPathIcon,
  PencilIcon,
  TrashIcon,
  ArrowsRightLeftIcon,
  ClockIcon,
  XCircleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ArrowUpTrayIcon,
  DocumentArrowUpIcon,
  ArchiveBoxIcon,
  ArrowUturnLeftIcon,
  XMarkIcon,
  ComputerDesktopIcon,
  CalendarDaysIcon,
  ArrowDownTrayIcon,
  EyeIcon,
  WifiIcon,
  PlayIcon,
  PauseIcon,
  BanknotesIcon,
  IdentificationIcon,
  Squares2X2Icon,
  CheckIcon,
  SignalIcon,
} from '@heroicons/react/24/outline'
import clsx from 'clsx'
import toast from 'react-hot-toast'

const statusFilters = [
  { value: '', label: 'All Status' },
  { value: 'online', label: 'Online' },
  { value: 'offline', label: 'Offline' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'expired', label: 'Expired' },
  { value: 'expiring', label: 'Expiring Soon' },
]

// Status color helper
const getStatusDisplay = (subscriber) => {
  const isExpired = subscriber.expiry_date && new Date(subscriber.expiry_date) < new Date()
  const isExpiring = subscriber.expiry_date &&
    new Date(subscriber.expiry_date) < new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) &&
    !isExpired

  if (subscriber.status === 0) {
    return { color: 'bg-gray-500', text: 'Inactive', textColor: 'text-gray-600' }
  }
  if (subscriber.status === 2) {
    return { color: 'bg-gray-500', text: 'Suspended', textColor: 'text-gray-600' }
  }
  if (isExpired) {
    return { color: 'bg-yellow-500', text: 'Expired', textColor: 'text-yellow-600' }
  }
  if (subscriber.is_online) {
    return { color: 'bg-green-500', text: 'Online', textColor: 'text-green-600' }
  }
  return { color: 'bg-red-500', text: 'Offline', textColor: 'text-red-600' }
}

// Format bytes to human readable
const formatBytes = (bytes) => {
  if (!bytes || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

export default function Subscribers() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { hasPermission } = useAuthStore()
  const fileInputRef = useRef(null)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(25)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [serviceId, setServiceId] = useState('')
  const [nasId, setNasId] = useState('')
  const [resellerId, setResellerId] = useState('')
  const [fupLevel, setFupLevel] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [sorting, setSorting] = useState([])
  const [viewMode, setViewMode] = useState('active')

  // Selected rows - stores subscriber IDs
  const [selectedIds, setSelectedIds] = useState(new Set())

  // Column visibility - load from localStorage
  const [visibleColumns, setVisibleColumns] = useState(() => {
    const defaultColumns = {
      username: true,
      full_name: true,
      phone: true,
      mac_address: true,
      ip_address: true,
      service: true,
      status: true,
      expiry_date: true,
      daily_quota: true,
      monthly_quota: true,
      balance: false,
      address: false,
      region: false,
      notes: false,
    }
    try {
      const saved = localStorage.getItem('subscriberColumns')
      if (saved) {
        return { ...defaultColumns, ...JSON.parse(saved) }
      }
    } catch (e) {
      console.error('Failed to load column settings:', e)
    }
    return defaultColumns
  })
  const [showColumnSettings, setShowColumnSettings] = useState(false)

  // Save column visibility to localStorage when it changes
  useEffect(() => {
    try {
      localStorage.setItem('subscriberColumns', JSON.stringify(visibleColumns))
    } catch (e) {
      console.error('Failed to save column settings:', e)
    }
  }, [visibleColumns])

  // Modal states
  const [showBulkImport, setShowBulkImport] = useState(false)
  const [importFile, setImportFile] = useState(null)
  const [importServiceId, setImportServiceId] = useState('')
  const [importResults, setImportResults] = useState(null)

  // Action modal states (for forms that need input)
  const [actionModal, setActionModal] = useState(null)
  const [actionValue, setActionValue] = useState('')
  const [actionReason, setActionReason] = useState('')
  const [changeServiceOptions, setChangeServiceOptions] = useState({
    extend_expiry: false,
    reset_fup: false,
    charge_price: false,
    prorate_price: true, // Default to prorate pricing
  })
  const [priceCalculation, setPriceCalculation] = useState(null)
  const [calculatingPrice, setCalculatingPrice] = useState(false)

  // Torch modal state
  const [torchModal, setTorchModal] = useState(null)
  const [torchData, setTorchData] = useState(null)
  const [torchLoading, setTorchLoading] = useState(false)
  const [torchAutoRefresh, setTorchAutoRefresh] = useState(true) // Auto-refresh ON by default

  // Fetch subscribers
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['subscribers', page, limit, search, status, serviceId, nasId, resellerId, fupLevel, viewMode],
    queryFn: () => {
      if (viewMode === 'archived') {
        return subscriberApi.listArchived({ page, limit, search }).then((r) => r.data)
      }
      return subscriberApi
        .list({ page, limit, search, status, service_id: serviceId, nas_id: nasId, reseller_id: resellerId, fup_level: fupLevel })
        .then((r) => r.data)
    },
  })

  const { data: services } = useQuery({
    queryKey: ['services-list'],
    queryFn: () => serviceApi.list().then((r) => r.data.data),
  })

  const { data: nasList } = useQuery({
    queryKey: ['nas-list'],
    queryFn: () => nasApi.list().then((r) => r.data.data),
  })

  const { data: resellers } = useQuery({
    queryKey: ['resellers-list'],
    queryFn: () => resellerApi.list().then((r) => r.data.data),
  })

  // Get selected subscribers
  const selectedSubscribers = useMemo(() => {
    const rows = data?.data || []
    return rows.filter(r => selectedIds.has(r.id))
  }, [data?.data, selectedIds])

  const selectedCount = selectedIds.size

  // Toggle row selection
  const toggleRowSelection = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  // Select all visible rows
  const selectAll = () => {
    const rows = data?.data || []
    if (selectedIds.size === rows.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(rows.map(r => r.id)))
    }
  }

  // Clear selection
  const clearSelection = () => {
    setSelectedIds(new Set())
  }

  // Single subscriber mutations
  const renewMutation = useMutation({
    mutationFn: (id) => subscriberApi.renew(id),
    onSuccess: () => {
      toast.success('Subscriber renewed successfully')
      queryClient.invalidateQueries(['subscribers'])
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to renew'),
  })

  const disconnectMutation = useMutation({
    mutationFn: (id) => subscriberApi.disconnect(id),
    onSuccess: () => {
      toast.success('Subscriber disconnected')
      queryClient.invalidateQueries(['subscribers'])
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to disconnect'),
  })

  const resetFupMutation = useMutation({
    mutationFn: (id) => subscriberApi.resetFup(id),
    onSuccess: () => {
      toast.success('FUP quota reset successfully')
      queryClient.invalidateQueries(['subscribers'])
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to reset FUP'),
  })

  const resetMacMutation = useMutation({
    mutationFn: ({ id, mac_address, reason }) => subscriberApi.resetMac(id, { mac_address, reason }),
    onSuccess: () => {
      toast.success('MAC address reset successfully')
      setActionModal(null)
      setActionValue('')
      setActionReason('')
      queryClient.invalidateQueries(['subscribers'])
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to reset MAC'),
  })

  const renameMutation = useMutation({
    mutationFn: ({ id, new_username, reason }) => subscriberApi.rename(id, { new_username, reason }),
    onSuccess: () => {
      toast.success('Username changed successfully')
      setActionModal(null)
      setActionValue('')
      setActionReason('')
      queryClient.invalidateQueries(['subscribers'])
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to rename'),
  })

  const addDaysMutation = useMutation({
    mutationFn: ({ id, days, reason }) => subscriberApi.addDays(id, { days, reason }),
    onSuccess: () => {
      toast.success('Days added successfully')
      setActionModal(null)
      setActionValue('')
      setActionReason('')
      queryClient.invalidateQueries(['subscribers'])
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to add days'),
  })

  const changeServiceMutation = useMutation({
    mutationFn: ({ id, service_id, extend_expiry, reset_fup, charge_price, prorate_price, reason }) =>
      subscriberApi.changeService(id, { service_id, extend_expiry, reset_fup, charge_price, prorate_price, reason }),
    onSuccess: (res) => {
      const data = res.data?.data
      let message = 'Service changed successfully'
      if (data?.charge_amount) {
        message += `. Charged: $${data.charge_amount.toFixed(2)}`
      }
      toast.success(message)
      setActionModal(null)
      setActionValue('')
      setActionReason('')
      setPriceCalculation(null)
      setChangeServiceOptions({ extend_expiry: false, reset_fup: false, charge_price: false, prorate_price: true })
      queryClient.invalidateQueries(['subscribers'])
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to change service'),
  })

  // Fetch price calculation when service is selected
  const fetchPriceCalculation = async (subscriberId, serviceId) => {
    if (!subscriberId || !serviceId) {
      setPriceCalculation(null)
      return
    }
    setCalculatingPrice(true)
    try {
      const res = await subscriberApi.calculateChangeServicePrice(subscriberId, serviceId)
      setPriceCalculation(res.data?.data)
    } catch (err) {
      console.error('Failed to calculate price:', err)
      setPriceCalculation(null)
    } finally {
      setCalculatingPrice(false)
    }
  }

  // Fetch torch data for a subscriber
  const fetchTorchData = async (subscriber) => {
    if (!subscriber || !subscriber.is_online) return
    setTorchLoading(true)
    try {
      const res = await subscriberApi.getTorch(subscriber.id, 2) // 2 seconds for faster refresh
      if (res.data?.success) {
        setTorchData(res.data.data)
      } else {
        toast.error(res.data?.message || 'Failed to get torch data')
        setTorchData(null)
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to get torch data')
      setTorchData(null)
    } finally {
      setTorchLoading(false)
    }
  }

  // Auto-refresh torch data - continuous like MikroTik Winbox
  useEffect(() => {
    let interval
    if (torchModal && torchAutoRefresh && !torchLoading) {
      interval = setInterval(() => {
        fetchTorchData(torchModal)
      }, 2000) // Refresh every 2 seconds for live feel
    }
    return () => {
      if (interval) clearInterval(interval)
    }
  }, [torchModal, torchAutoRefresh, torchLoading])

  const activateMutation = useMutation({
    mutationFn: (id) => subscriberApi.activate(id),
    onSuccess: () => {
      toast.success('Subscriber activated')
      queryClient.invalidateQueries(['subscribers'])
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to activate'),
  })

  const deactivateMutation = useMutation({
    mutationFn: (id) => subscriberApi.deactivate(id),
    onSuccess: () => {
      toast.success('Subscriber deactivated')
      queryClient.invalidateQueries(['subscribers'])
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to deactivate'),
  })

  const refillMutation = useMutation({
    mutationFn: ({ id, amount, reason }) => subscriberApi.refill(id, { amount, reason }),
    onSuccess: () => {
      toast.success('Account refilled successfully')
      setActionModal(null)
      setActionValue('')
      setActionReason('')
      queryClient.invalidateQueries(['subscribers'])
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to refill'),
  })

  const pingMutation = useMutation({
    mutationFn: (id) => subscriberApi.ping(id),
    onSuccess: (res) => {
      const data = res.data.data
      // Show dismissible ping result - click anywhere to close
      toast.custom((t) => (
        <div
          onClick={() => toast.dismiss(t.id)}
          className={`${t.visible ? 'animate-enter' : 'animate-leave'} max-w-md w-full bg-white dark:bg-gray-800 shadow-lg rounded-lg pointer-events-auto cursor-pointer border border-gray-200 dark:border-gray-700`}
        >
          <div className="p-4">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0">
                <WifiIcon className="h-6 w-6 text-green-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white">Ping Result</p>
                <pre className="mt-1 text-xs text-gray-600 dark:text-gray-300 whitespace-pre-wrap font-mono">{data.output}</pre>
                <p className="mt-2 text-xs text-gray-400">Click anywhere to close</p>
              </div>
            </div>
          </div>
        </div>
      ), { duration: 30000 }) // 30 seconds max, but user can click to dismiss
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to ping'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => subscriberApi.delete(id),
    onSuccess: () => {
      toast.success('Subscriber deleted')
      clearSelection()
      queryClient.invalidateQueries(['subscribers'])
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to delete'),
  })

  // Bulk mutations
  const bulkImportMutation = useMutation({
    mutationFn: ({ file, serviceId }) => {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('service_id', serviceId)
      return subscriberApi.bulkImport(formData)
    },
    onSuccess: (res) => {
      setImportResults(res.data.data)
      toast.success(res.data.message)
      queryClient.invalidateQueries(['subscribers'])
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to import'),
  })

  const bulkActionMutation = useMutation({
    mutationFn: ({ ids, action }) => subscriberApi.bulkAction({ ids, action }),
    onSuccess: (res) => {
      toast.success(res.data.message)
      clearSelection()
      queryClient.invalidateQueries(['subscribers'])
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to perform action'),
  })

  const restoreMutation = useMutation({
    mutationFn: (id) => subscriberApi.restore(id),
    onSuccess: () => {
      toast.success('Subscriber restored')
      clearSelection()
      queryClient.invalidateQueries(['subscribers'])
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to restore'),
  })

  const permanentDeleteMutation = useMutation({
    mutationFn: (id) => subscriberApi.permanentDelete(id),
    onSuccess: () => {
      toast.success('Subscriber permanently deleted')
      clearSelection()
      queryClient.invalidateQueries(['subscribers'])
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to delete'),
  })

  // Execute action on selected subscribers
  const executeAction = (action) => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return

    if (ids.length > 1) {
      // Bulk action
      bulkActionMutation.mutate({ ids, action })
    } else {
      // Single action
      const id = ids[0]
      const sub = selectedSubscribers[0]
      switch (action) {
        case 'renew':
          renewMutation.mutate(id)
          break
        case 'disconnect':
          disconnectMutation.mutate(id)
          break
        case 'reset_fup':
          resetFupMutation.mutate(id)
          break
        case 'enable':
          activateMutation.mutate(id)
          break
        case 'disable':
          deactivateMutation.mutate(id)
          break
        case 'ping':
          pingMutation.mutate(id)
          break
        case 'delete':
          if (confirm('Are you sure you want to delete this subscriber?')) {
            deleteMutation.mutate(id)
          }
          break
        case 'reset_mac':
          setActionModal({ type: 'resetMac', subscriber: sub })
          setActionValue(sub?.mac_address || '')
          break
        case 'add_days':
          setActionModal({ type: 'addDays', subscriber: sub })
          break
        case 'change_service':
          setActionModal({ type: 'changeService', subscriber: sub })
          setActionValue(sub?.service_id?.toString() || '')
          break
        case 'rename':
          setActionModal({ type: 'rename', subscriber: sub })
          break
        case 'refill':
          setActionModal({ type: 'refill', subscriber: sub })
          break
      }
    }
  }

  // Execute bulk action
  const executeBulkAction = (action) => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return

    if (action === 'delete') {
      if (!confirm(`Delete ${ids.length} subscriber(s)?`)) return
    }

    bulkActionMutation.mutate({ ids, action })
  }

  // Handle bulk import
  const handleBulkImport = () => {
    if (!importFile || !importServiceId) {
      toast.error('Please select a file and service')
      return
    }
    bulkImportMutation.mutate({ file: importFile, serviceId: importServiceId })
  }

  // Export to CSV
  const handleExport = () => {
    const rows = data?.data || []
    if (rows.length === 0) {
      toast.error('No data to export')
      return
    }

    const headers = ['Username', 'Full Name', 'Phone', 'Email', 'Service', 'MAC Address', 'IP Address', 'Status', 'Expiry Date']
    const csvData = rows.map(r => [
      r.username,
      r.full_name,
      r.phone,
      r.email,
      r.service?.name,
      r.mac_address,
      r.ip_address || r.static_ip,
      r.status,
      r.expiry_date ? formatDate(r.expiry_date) : ''
    ])

    const csv = [headers, ...csvData].map(row => row.map(cell => `"${cell || ''}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `subscribers_${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Exported to CSV')
  }

  const columns = useMemo(
    () => [
      {
        id: 'status_indicator',
        header: '',
        cell: ({ row }) => {
          const statusInfo = getStatusDisplay(row.original)
          return (
            <div className="flex items-center justify-center">
              <span className={clsx('w-3 h-3 rounded-full', statusInfo.color, row.original.is_online && 'animate-pulse')} />
            </div>
          )
        },
        size: 30,
      },
      ...(visibleColumns.username ? [{
        accessorKey: 'username',
        header: 'Username',
        cell: ({ row }) => (
          <div>
            <span className="inline-flex items-center gap-1">
              <Link
                to={`/subscribers/${row.original.id}`}
                className="font-semibold text-primary-600 hover:text-primary-800 hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                {row.original.username}
              </Link>
              {row.original.is_online && hasPermission('subscribers.torch') && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setTorchModal(row.original)
                    setTorchData(null)
                    fetchTorchData(row.original)
                  }}
                  className="text-green-500 hover:text-green-700"
                  title="Live Traffic (Torch)"
                >
                  <SignalIcon className="w-4 h-4" />
                </button>
              )}
              {row.original.fup_level > 0 && (
                <span className={`inline-block px-1.5 py-0.5 text-[10px] font-bold text-white rounded whitespace-nowrap ${
                  row.original.fup_level === 1 ? 'bg-yellow-500' :
                  row.original.fup_level === 2 ? 'bg-orange-500' :
                  'bg-red-600'
                }`}>
                  FUP{row.original.fup_level}
                </span>
              )}
            </span>
          </div>
        ),
      }] : []),
      ...(visibleColumns.full_name ? [{
        accessorKey: 'full_name',
        header: 'Fullname',
      }] : []),
      ...(visibleColumns.phone ? [{
        accessorKey: 'phone',
        header: 'Phone',
      }] : []),
      ...(visibleColumns.mac_address ? [{
        accessorKey: 'mac_address',
        header: 'MAC',
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <span className="font-mono text-xs">{row.original.mac_address || 'N/A'}</span>
            {row.original.mac_address && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setActionModal({ type: 'resetMac', subscriber: row.original })
                  setActionValue(row.original.mac_address)
                }}
                className="text-gray-400 hover:text-primary-600"
                title="Reset MAC"
              >
                <ArrowPathIcon className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ),
      }] : []),
      ...(visibleColumns.ip_address ? [{
        accessorKey: 'ip_address',
        header: 'IP',
        cell: ({ row }) => (
          <span className={clsx(
            'font-mono text-xs',
            row.original.is_online ? 'text-green-600 font-medium' : 'text-gray-500'
          )}>
            {row.original.ip_address || row.original.static_ip || 'N/A'}
          </span>
        ),
      }] : []),
      ...(visibleColumns.service ? [{
        accessorKey: 'service.name',
        header: 'Service',
        cell: ({ row }) => {
          const used = row.original.daily_quota_used || 0
          const limit = row.original.service?.daily_quota || 0
          const serviceName = row.original.service?.name || '-'

          if (limit === 0) {
            return <div className="text-center font-medium">{serviceName}</div>
          }

          const percent = Math.min(100, (used / limit) * 100)
          const usedFormatted = formatBytes(used)

          return (
            <div className="min-w-[120px]">
              <div className="text-center font-medium text-sm">{serviceName}</div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-4 mt-1 relative border border-gray-300 dark:border-gray-600">
                <div
                  className={`h-full rounded-full transition-all ${
                    percent >= 100 ? 'bg-red-500' : percent >= 50 ? 'bg-yellow-500' : 'bg-teal-500'
                  }`}
                  style={{ width: `${Math.min(100, percent)}%` }}
                />
                <span className="absolute inset-0 flex items-center justify-center text-xs font-medium text-gray-800 dark:text-gray-200">
                  {usedFormatted}
                </span>
              </div>
            </div>
          )
        },
      }] : []),
      ...(visibleColumns.status ? [{
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => {
          const statusInfo = getStatusDisplay(row.original)
          return (
            <span className={clsx('text-xs font-medium', statusInfo.textColor)}>
              {statusInfo.text}
            </span>
          )
        },
      }] : []),
      ...(visibleColumns.expiry_date ? [{
        accessorKey: 'expiry_date',
        header: 'Expiry',
        cell: ({ row }) => {
          if (!row.original.expiry_date) return '-'
          const expiry = new Date(row.original.expiry_date)
          const isExpired = expiry < new Date()
          const daysLeft = Math.ceil((expiry - new Date()) / (1000 * 60 * 60 * 24))
          return (
            <div>
              <div className={clsx(isExpired ? 'text-red-600' : 'text-gray-900 dark:text-white', 'text-sm')}>
                {formatDate(row.original.expiry_date)}
              </div>
              <div className={clsx('text-xs', isExpired ? 'text-red-500' : 'text-gray-500 dark:text-gray-400')}>
                {isExpired ? `${Math.abs(daysLeft)}d ago` : `${daysLeft}d left`}
              </div>
            </div>
          )
        },
      }] : []),
      ...(visibleColumns.monthly_quota ? [{
        id: 'monthly_quota',
        header: 'Monthly',
        cell: ({ row }) => {
          const used = row.original.monthly_quota_used || 0
          const limit = row.original.service?.monthly_quota || 0

          if (limit === 0) return <span className="text-gray-400 dark:text-gray-500 text-xs">Unlimited</span>
          const percent = Math.min(100, (used / limit) * 100)
          const usedFormatted = formatBytes(used)

          return (
            <div className="min-w-[80px]">
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 relative border border-gray-300 dark:border-gray-600">
                <div
                  className={`h-full rounded-full ${
                    percent >= 100 ? 'bg-red-500' : percent >= 50 ? 'bg-yellow-500' : 'bg-teal-500'
                  }`}
                  style={{ width: `${Math.min(100, percent)}%` }}
                />
                <span className="absolute inset-0 flex items-center justify-center text-[10px] font-medium text-gray-800 dark:text-gray-200">
                  {usedFormatted}
                </span>
              </div>
            </div>
          )
        },
      }] : []),
      ...(visibleColumns.balance ? [{
        accessorKey: 'credit_balance',
        header: 'Balance',
        cell: ({ row }) => (
          <span className="font-medium">${(row.original.credit_balance || 0).toFixed(2)}</span>
        ),
      }] : []),
      ...(visibleColumns.address ? [{
        accessorKey: 'address',
        header: 'Address',
      }] : []),
      ...(visibleColumns.region ? [{
        accessorKey: 'region',
        header: 'Region',
      }] : []),
      ...(visibleColumns.notes ? [{
        accessorKey: 'note',
        header: 'Notes',
        cell: ({ row }) => (
          <span className="text-xs text-gray-600 dark:text-gray-400 truncate max-w-[150px] block" title={row.original.note}>
            {row.original.note || '-'}
          </span>
        ),
      }] : []),
      ...(viewMode === 'archived' ? [{
        accessorKey: 'deleted_at',
        header: 'Deleted At',
        cell: ({ row }) => formatDate(row.original.deleted_at),
      }] : []),
    ],
    [viewMode, visibleColumns]
  )

  const table = useReactTable({
    data: data?.data || [],
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    manualPagination: true,
    pageCount: Math.ceil((data?.meta?.total || 0) / limit),
  })

  const totalPages = Math.ceil((data?.meta?.total || 0) / limit)
  const stats = data?.stats || {}

  // Check if all visible rows are selected
  const allSelected = (data?.data || []).length > 0 && selectedIds.size === (data?.data || []).length

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Subscribers</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleExport}
            className="btn btn-secondary btn-sm flex items-center gap-1"
            title="Export"
          >
            <ArrowDownTrayIcon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Export</span>
          </button>
          {hasPermission('subscribers.create') && (
            <button
              onClick={() => setShowBulkImport(true)}
              className="btn btn-secondary btn-sm flex items-center gap-1"
              title="Import CSV"
            >
              <ArrowUpTrayIcon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Import CSV</span>
            </button>
          )}
          {hasPermission('subscribers.create') && (
            <Link
              to="/subscribers/import"
              className="btn btn-secondary btn-sm flex items-center gap-1"
              title="Import Excel"
            >
              <DocumentArrowUpIcon className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Import Excel</span>
            </Link>
          )}
          <button
            onClick={() => refetch()}
            className="btn btn-secondary btn-sm flex items-center gap-1"
            title="Refresh"
          >
            <ArrowPathIcon className="w-3.5 h-3.5" />
          </button>
          {hasPermission('subscribers.create') && (
            <Link to="/subscribers/new" className="btn btn-primary btn-sm flex items-center gap-1">
              <PlusIcon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Add</span>
            </Link>
          )}
        </div>
      </div>

      {/* Stats Bar - Scrollable on mobile */}
      <div className="flex items-center gap-4 px-4 py-2 bg-white dark:bg-gray-800 rounded-lg border text-sm overflow-x-auto">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-green-500"></span>
          <span className="font-semibold text-green-600">{stats.online || 0}</span>
          <span className="text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">Online</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-red-500"></span>
          <span className="font-semibold text-red-600">{stats.offline || 0}</span>
          <span className="text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">Offline</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-blue-500"></span>
          <span className="font-semibold text-blue-600">{stats.active || 0}</span>
          <span className="text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">Active</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-gray-400"></span>
          <span className="font-semibold text-gray-600 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">{stats.inactive || 0}</span>
          <span className="text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">Inactive</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-yellow-500"></span>
          <span className="font-semibold text-yellow-600">{stats.expired || 0}</span>
          <span className="text-gray-500 dark:text-gray-400">Expired</span>
        </div>
        <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-2"></div>
        <div className="flex items-center gap-1.5 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 px-2 py-1 rounded" onClick={() => { setFupLevel('0'); setPage(1); }}>
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">FUP0:</span>
          <span className="font-semibold text-emerald-600">{stats.fup0 || 0}</span>
        </div>
        <div className="flex items-center gap-1.5 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 px-2 py-1 rounded" onClick={() => { setFupLevel('1'); setPage(1); }}>
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">FUP1:</span>
          <span className="font-semibold text-amber-600">{stats.fup1 || 0}</span>
        </div>
        <div className="flex items-center gap-1.5 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 px-2 py-1 rounded" onClick={() => { setFupLevel('2'); setPage(1); }}>
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">FUP2:</span>
          <span className="font-semibold text-orange-600">{stats.fup2 || 0}</span>
        </div>
        <div className="flex items-center gap-1.5 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 px-2 py-1 rounded" onClick={() => { setFupLevel('3'); setPage(1); }}>
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">FUP3:</span>
          <span className="font-semibold text-red-600">{stats.fup3 || 0}</span>
        </div>
        {stats.fup4 > 0 && (
          <div className="flex items-center gap-1.5 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 px-2 py-1 rounded" onClick={() => { setFupLevel('4'); setPage(1); }}>
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">FUP4:</span>
            <span className="font-semibold text-purple-600">{stats.fup4 || 0}</span>
          </div>
        )}
        <div className="flex items-center gap-1.5 ml-auto">
          <span className="font-semibold text-gray-700 dark:text-gray-300">{data?.meta?.total || 0}</span>
          <span className="text-gray-500 dark:text-gray-400">Total</span>
        </div>
      </div>

      {/* Search, Filters & Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
        {/* View Mode Tabs */}
        <div className="flex rounded-lg border bg-gray-100 dark:bg-gray-700 dark:border-gray-600 p-0.5 shrink-0">
          <button
            onClick={() => { setViewMode('active'); setPage(1); clearSelection(); }}
            className={clsx(
              'px-3 py-1 text-sm font-medium rounded-md transition-colors',
              viewMode === 'active'
                ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            )}
          >
            Active
          </button>
          <button
            onClick={() => { setViewMode('archived'); setPage(1); clearSelection(); }}
            className={clsx(
              'px-3 py-1 text-sm font-medium rounded-md transition-colors flex items-center gap-1',
              viewMode === 'archived'
                ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            )}
          >
            <ArchiveBoxIcon className="w-3.5 h-3.5" />
            Archived
          </button>
        </div>

        {/* Search */}
        <div className="flex-1 relative min-w-0">
          <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            className="input input-sm pl-8 w-full"
          />
        </div>

        {viewMode === 'active' && (
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value)
                setPage(1)
              }}
              className="input input-sm w-28 sm:w-32"
            >
              {statusFilters.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={clsx(
                'btn btn-secondary btn-sm flex items-center gap-1',
                showFilters && 'bg-primary-50 text-primary-600'
              )}
            >
              <FunnelIcon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Filters</span>
            </button>
            <button
              onClick={() => setShowColumnSettings(!showColumnSettings)}
              className={clsx(
                'btn btn-secondary btn-sm flex items-center gap-1',
                showColumnSettings && 'bg-primary-50 text-primary-600'
              )}
            >
              <EyeIcon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Columns</span>
            </button>
          </div>
        )}
      </div>

      {/* Expandable Filter/Column panels */}
      {(showFilters || showColumnSettings) && (
        <div className="card p-3">
          {showColumnSettings && (
            <div>
              <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Visible Columns</div>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(visibleColumns).map(([key, visible]) => (
                  <label key={key} className="flex items-center gap-1.5 px-2 py-1 bg-gray-100 rounded cursor-pointer hover:bg-gray-200 text-xs">
                    <input
                      type="checkbox"
                      checked={visible}
                      onChange={(e) => setVisibleColumns({ ...visibleColumns, [key]: e.target.checked })}
                      className="rounded border-gray-300 w-3 h-3"
                    />
                    <span className="capitalize">{key.replace('_', ' ')}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {showFilters && viewMode === 'active' && (
            <div className={showColumnSettings ? 'mt-3 pt-3 border-t dark:border-gray-700' : ''}>
              <div className="grid grid-cols-2 sm:flex sm:items-end gap-2 sm:gap-3">
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400">Service</label>
                  <select
                    value={serviceId}
                    onChange={(e) => { setServiceId(e.target.value); setPage(1); }}
                    className="input input-sm w-full sm:w-40"
                  >
                    <option value="">All Services</option>
                    {services?.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400">NAS</label>
                  <select
                    value={nasId}
                    onChange={(e) => { setNasId(e.target.value); setPage(1); }}
                    className="input input-sm w-full sm:w-40"
                  >
                    <option value="">All NAS</option>
                    {nasList?.map((n) => (
                      <option key={n.id} value={n.id}>{n.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400">Reseller</label>
                  <select
                    value={resellerId}
                    onChange={(e) => { setResellerId(e.target.value); setPage(1); }}
                    className="input input-sm w-full sm:w-40"
                  >
                    <option value="">All Resellers</option>
                    {resellers?.map((r) => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400">FUP Level</label>
                  <select
                    value={fupLevel}
                    onChange={(e) => { setFupLevel(e.target.value); setPage(1); }}
                    className="input input-sm w-full sm:w-32"
                  >
                    <option value="">All FUP</option>
                    <option value="0">FUP 0 (Normal)</option>
                    <option value="1">FUP 1</option>
                    <option value="2">FUP 2</option>
                    <option value="3">FUP 3</option>
                    <option value="4">FUP 4</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400">Per Page</label>
                  <select
                    value={limit}
                    onChange={(e) => { setLimit(parseInt(e.target.value)); setPage(1); }}
                    className="input input-sm w-full sm:w-20"
                  >
                    <option value="10">10</option>
                    <option value="25">25</option>
                    <option value="50">50</option>
                    <option value="100">100</option>
                  </select>
                </div>
                <button
                  onClick={() => { setSearch(''); setStatus(''); setServiceId(''); setNasId(''); setResellerId(''); setFupLevel(''); setPage(1); }}
                  className="btn btn-secondary btn-sm col-span-2 sm:col-span-1"
                >
                  Clear
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ACTION BUTTONS TOOLBAR - Proradius4 style */}
      <div className="card p-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Select All Button */}
          <button
            onClick={selectAll}
            className={clsx(
              'btn btn-sm flex items-center gap-1',
              allSelected ? 'btn-primary' : 'btn-secondary'
            )}
            title={allSelected ? 'Deselect All' : 'Select All'}
          >
            <Squares2X2Icon className="w-4 h-4" />
            <span className="hidden sm:inline">{allSelected ? 'Deselect All' : 'Select All'}</span>
          </button>

          <div className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1 hidden sm:block" />

          {/* Bulk Action Buttons - disabled when nothing selected */}
          {hasPermission('subscribers.renew') && (
            <button
              onClick={() => executeBulkAction('renew')}
              disabled={selectedCount === 0}
              className="btn btn-secondary btn-sm flex items-center gap-1 disabled:opacity-40"
              title="Renew"
            >
              <ClockIcon className="w-4 h-4" />
              <span className="hidden sm:inline">Renew</span>
            </button>
          )}

          {hasPermission('subscribers.reset_fup') && (
            <button
              onClick={() => executeBulkAction('reset_fup')}
              disabled={selectedCount === 0}
              className="btn btn-secondary btn-sm flex items-center gap-1 disabled:opacity-40"
              title="Reset FUP"
            >
              <ArrowPathIcon className="w-4 h-4" />
              <span className="hidden sm:inline">Reset FUP</span>
            </button>
          )}

          {hasPermission('subscribers.inactivate') && (
            <button
              onClick={() => executeBulkAction('enable')}
              disabled={selectedCount === 0}
              className="btn btn-secondary btn-sm flex items-center gap-1 disabled:opacity-40"
              title="Activate"
            >
              <PlayIcon className="w-4 h-4" />
              <span className="hidden sm:inline">Activate</span>
            </button>
          )}

          {hasPermission('subscribers.inactivate') && (
            <button
              onClick={() => executeBulkAction('disable')}
              disabled={selectedCount === 0}
              className="btn btn-secondary btn-sm flex items-center gap-1 disabled:opacity-40"
              title="Deactivate"
            >
              <PauseIcon className="w-4 h-4" />
              <span className="hidden sm:inline">Deactivate</span>
            </button>
          )}

          {hasPermission('subscribers.disconnect') && (
            <button
              onClick={() => executeBulkAction('disconnect')}
              disabled={selectedCount === 0}
              className="btn btn-secondary btn-sm flex items-center gap-1 disabled:opacity-40"
              title="Disconnect"
            >
              <XCircleIcon className="w-4 h-4" />
              <span className="hidden sm:inline">Disconnect</span>
            </button>
          )}

          <div className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1 hidden sm:block" />

          {/* Single-select only buttons */}
          {hasPermission('subscribers.rename') && (
            <button
              onClick={() => executeAction('rename')}
              disabled={selectedCount !== 1}
              className="btn btn-secondary btn-sm flex items-center gap-1 disabled:opacity-40"
              title="Rename"
            >
              <IdentificationIcon className="w-4 h-4" />
              <span className="hidden sm:inline">Rename</span>
            </button>
          )}

          {hasPermission('subscribers.add_days') && (
            <button
              onClick={() => executeAction('add_days')}
              disabled={selectedCount !== 1}
              className="btn btn-secondary btn-sm flex items-center gap-1 disabled:opacity-40"
              title="Add Days"
            >
              <CalendarDaysIcon className="w-4 h-4" />
              <span className="hidden sm:inline">Add Days</span>
            </button>
          )}

          {hasPermission('subscribers.change_service') && (
            <button
              onClick={() => executeAction('change_service')}
              disabled={selectedCount !== 1}
              className="btn btn-secondary btn-sm flex items-center gap-1 disabled:opacity-40"
              title="Change Service"
            >
              <ArrowsRightLeftIcon className="w-4 h-4" />
              <span className="hidden md:inline">Change Service</span>
            </button>
          )}

          {hasPermission('subscribers.refill_quota') && (
            <button
              onClick={() => executeAction('refill')}
              disabled={selectedCount !== 1}
              className="btn btn-secondary btn-sm flex items-center gap-1 disabled:opacity-40"
              title="Refill"
            >
              <BanknotesIcon className="w-4 h-4" />
              <span className="hidden sm:inline">Refill</span>
            </button>
          )}

          {hasPermission('subscribers.ping') && (
            <button
              onClick={() => executeAction('ping')}
              disabled={selectedCount !== 1}
              className="btn btn-secondary btn-sm flex items-center gap-1 disabled:opacity-40"
              title="Ping"
            >
              <WifiIcon className="w-4 h-4" />
              <span className="hidden sm:inline">Ping</span>
            </button>
          )}

          <div className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1 hidden sm:block" />

          {hasPermission('subscribers.delete') && (
            <button
              onClick={() => executeBulkAction('delete')}
              disabled={selectedCount === 0}
              className="btn btn-sm flex items-center gap-1 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50 border-red-200 dark:border-red-800 disabled:opacity-40"
              title="Delete"
            >
              <TrashIcon className="w-4 h-4" />
              <span className="hidden sm:inline">Delete</span>
            </button>
          )}

          {/* Selection counter */}
          {selectedCount > 0 && (
            <div className="ml-auto flex items-center gap-2 text-sm">
              <span className="font-semibold text-primary-600">{selectedCount}</span>
              <button
                onClick={clearSelection}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
              >
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="card">
        <div className="overflow-x-auto">
          <table className="table table-compact">
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      onClick={header.column.getCanSort() ? header.column.getToggleSortingHandler() : undefined}
                      className={clsx(header.column.getCanSort() && 'cursor-pointer select-none', 'text-center')}
                    >
                      <div className="flex items-center justify-center gap-1">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getIsSorted() === 'asc' && ' ▲'}
                        {header.column.getIsSorted() === 'desc' && ' ▼'}
                      </div>
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
                    {viewMode === 'archived' ? 'No archived subscribers' : 'No subscribers found'}
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => {
                  const isSelected = selectedIds.has(row.original.id)
                  return (
                    <tr
                      key={row.id}
                      className={clsx(
                        'cursor-pointer transition-colors',
                        isSelected
                          ? 'bg-red-50 dark:bg-red-900/30 border-b-2 border-red-400 text-red-700'
                          : 'hover:bg-gray-50'
                      )}
                      onClick={() => toggleRowSelection(row.original.id)}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className="text-center">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-2 border-t text-xs">
          <span className="text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">
            {((page - 1) * limit) + 1}-{Math.min(page * limit, data?.meta?.total || 0)} of {data?.meta?.total || 0}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
            >
              <ChevronLeftIcon className="w-4 h-4" />
            </button>
            <span className="px-2 text-gray-600 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">
              {page}/{totalPages || 1}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
            >
              <ChevronRightIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Reset MAC Modal */}
      {actionModal?.type === 'resetMac' && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3 className="text-lg font-semibold">Reset MAC Address</h3>
              <button onClick={() => { setActionModal(null); setActionValue(''); setActionReason(''); }} className="btn btn-ghost btn-sm">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="modal-body space-y-4">
              <div>
                <div className="text-sm text-gray-500 dark:text-gray-400 mb-2">User: <strong>{actionModal.subscriber.username}</strong></div>
                <div className="text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">Current MAC: <code className="bg-gray-100 px-2 py-1 rounded">{actionModal.subscriber.mac_address || 'None'}</code></div>
              </div>
              <div>
                <label className="label">New MAC Address (leave empty to clear)</label>
                <input
                  type="text"
                  value={actionValue}
                  onChange={(e) => setActionValue(e.target.value)}
                  className="input font-mono"
                  placeholder="XX:XX:XX:XX:XX:XX"
                />
              </div>
              <div>
                <label className="label">Reason</label>
                <select
                  value={actionReason}
                  onChange={(e) => setActionReason(e.target.value)}
                  className="input"
                >
                  <option value="">Select reason...</option>
                  <option value="device_change">User switched device</option>
                  <option value="account_sharing">Prevent account sharing</option>
                  <option value="network_card_change">Network card changed</option>
                  <option value="sync_from_radius">Sync from RADIUS</option>
                  <option value="security">Security issue</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => { setActionModal(null); setActionValue(''); setActionReason(''); }} className="btn btn-secondary">
                Cancel
              </button>
              <button
                onClick={() => resetMacMutation.mutate({
                  id: actionModal.subscriber.id,
                  mac_address: actionValue || null,
                  reason: actionReason,
                })}
                disabled={resetMacMutation.isPending}
                className="btn btn-primary"
              >
                {resetMacMutation.isPending ? 'Resetting...' : 'Reset MAC'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename Modal */}
      {actionModal?.type === 'rename' && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3 className="text-lg font-semibold">Rename Username</h3>
              <button onClick={() => { setActionModal(null); setActionValue(''); setActionReason(''); }} className="btn btn-ghost btn-sm">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="modal-body space-y-4">
              <div>
                <div className="text-sm text-gray-500 dark:text-gray-400 mb-2">Current Username: <strong>{actionModal.subscriber.username}</strong></div>
              </div>
              <div>
                <label className="label">New Username *</label>
                <input
                  type="text"
                  value={actionValue}
                  onChange={(e) => setActionValue(e.target.value)}
                  className="input"
                  placeholder="Enter new username"
                />
              </div>
              <div>
                <label className="label">Reason</label>
                <input
                  type="text"
                  value={actionReason}
                  onChange={(e) => setActionReason(e.target.value)}
                  className="input"
                  placeholder="Enter reason for change"
                />
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => { setActionModal(null); setActionValue(''); setActionReason(''); }} className="btn btn-secondary">
                Cancel
              </button>
              <button
                onClick={() => renameMutation.mutate({
                  id: actionModal.subscriber.id,
                  new_username: actionValue,
                  reason: actionReason,
                })}
                disabled={!actionValue || renameMutation.isPending}
                className="btn btn-primary"
              >
                {renameMutation.isPending ? 'Renaming...' : 'Rename'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Days Modal */}
      {actionModal?.type === 'addDays' && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3 className="text-lg font-semibold">Add/Subtract Days</h3>
              <button onClick={() => { setActionModal(null); setActionValue(''); setActionReason(''); }} className="btn btn-ghost btn-sm">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="modal-body space-y-4">
              <div>
                <div className="text-sm text-gray-500 dark:text-gray-400 mb-2">User: <strong>{actionModal.subscriber.username}</strong></div>
                <div className="text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">Current Expiry: <strong>{actionModal.subscriber.expiry_date ? formatDate(actionModal.subscriber.expiry_date) : 'N/A'}</strong></div>
              </div>
              <div>
                <label className="label">Days *</label>
                <input
                  type="number"
                  value={actionValue}
                  onChange={(e) => setActionValue(e.target.value)}
                  className="input"
                  placeholder="Enter days (negative to subtract)"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500 mt-1">Use negative number to subtract days</p>
              </div>
              <div>
                <label className="label">Reason</label>
                <select
                  value={actionReason}
                  onChange={(e) => setActionReason(e.target.value)}
                  className="input"
                >
                  <option value="">Select reason...</option>
                  <option value="compensation">Compensation</option>
                  <option value="overdue_fix">Overdue fix</option>
                  <option value="promotion">Promotion</option>
                  <option value="manual_adjustment">Manual adjustment</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => { setActionModal(null); setActionValue(''); setActionReason(''); }} className="btn btn-secondary">
                Cancel
              </button>
              <button
                onClick={() => addDaysMutation.mutate({
                  id: actionModal.subscriber.id,
                  days: parseInt(actionValue),
                  reason: actionReason,
                })}
                disabled={!actionValue || addDaysMutation.isPending}
                className="btn btn-primary"
              >
                {addDaysMutation.isPending ? 'Updating...' : 'Apply'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Change Service Modal */}
      {actionModal?.type === 'changeService' && (
        <div className="modal-overlay">
          <div className="modal max-w-lg">
            <div className="modal-header">
              <h3 className="text-lg font-semibold">Change Service</h3>
              <button onClick={() => { setActionModal(null); setActionValue(''); setActionReason(''); setPriceCalculation(null); setChangeServiceOptions({ extend_expiry: false, reset_fup: false, charge_price: false, prorate_price: true }); }} className="btn btn-ghost btn-sm">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="modal-body space-y-4">
              <div>
                <div className="text-sm text-gray-500 dark:text-gray-400 mb-2">User: <strong>{actionModal.subscriber.username}</strong></div>
                <div className="text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">Current Service: <strong>{actionModal.subscriber.service?.name || 'N/A'}</strong> - ${actionModal.subscriber.service?.price?.toFixed(2) || '0.00'}</div>
                <div className="text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">Expiry: <strong>{actionModal.subscriber.expiry_date ? new Date(actionModal.subscriber.expiry_date).toLocaleDateString() : 'N/A'}</strong></div>
              </div>
              <div>
                <label className="label">New Service *</label>
                <select
                  value={actionValue}
                  onChange={(e) => {
                    setActionValue(e.target.value)
                    if (e.target.value) {
                      fetchPriceCalculation(actionModal.subscriber.id, e.target.value)
                    } else {
                      setPriceCalculation(null)
                    }
                  }}
                  className="input"
                >
                  <option value="">Select Service</option>
                  {services?.map((s) => (
                    <option key={s.id} value={s.id}>{s.name} - ${s.price?.toFixed(2)}</option>
                  ))}
                </select>
              </div>

              {/* Price Calculation Display */}
              {calculatingPrice && (
                <div className="bg-gray-50 p-3 rounded-lg text-sm text-gray-600 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">
                  Calculating price...
                </div>
              )}
              {priceCalculation && !calculatingPrice && (
                <div className={`p-3 rounded-lg text-sm ${priceCalculation.is_upgrade ? 'bg-blue-50 dark:bg-blue-900/30 border border-blue-200' : priceCalculation.is_downgrade ? 'bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200' : 'bg-gray-50'}`}>
                  <div className="font-semibold mb-2">
                    {priceCalculation.is_upgrade ? '⬆️ Upgrade' : priceCalculation.is_downgrade ? '⬇️ Downgrade' : '↔️ Same Price'}
                  </div>
                  <div className="space-y-1 text-gray-600 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">
                    <div className="flex justify-between">
                      <span>Remaining days:</span>
                      <span className="font-medium">{priceCalculation.remaining_days} days</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Old day price:</span>
                      <span>${priceCalculation.old_day_price?.toFixed(2)}/day</span>
                    </div>
                    <div className="flex justify-between">
                      <span>New day price:</span>
                      <span>${priceCalculation.new_day_price?.toFixed(2)}/day</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Credit from old service:</span>
                      <span className="text-green-600">-${priceCalculation.old_credit?.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Cost for new service:</span>
                      <span className="text-red-600">+${priceCalculation.new_cost?.toFixed(2)}</span>
                    </div>
                    {priceCalculation.change_fee > 0 && (
                      <div className="flex justify-between">
                        <span>Change fee:</span>
                        <span>+${priceCalculation.change_fee?.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="border-t pt-1 mt-1 flex justify-between font-semibold">
                      <span>Total to {priceCalculation.total_charge >= 0 ? 'charge' : 'refund'}:</span>
                      <span className={priceCalculation.total_charge >= 0 ? 'text-red-600' : 'text-green-600'}>
                        ${Math.abs(priceCalculation.total_charge)?.toFixed(2)}
                      </span>
                    </div>
                  </div>
                  {priceCalculation.is_downgrade && !priceCalculation.downgrade_allowed && (
                    <div className="mt-2 text-red-600 font-medium">
                      ⚠️ Downgrade is not allowed by system settings
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={changeServiceOptions.extend_expiry}
                    onChange={(e) => setChangeServiceOptions({ ...changeServiceOptions, extend_expiry: e.target.checked })}
                    className="rounded border-gray-300 dark:border-gray-600"
                  />
                  <span className="text-sm">Extend Expiry</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={changeServiceOptions.reset_fup}
                    onChange={(e) => setChangeServiceOptions({ ...changeServiceOptions, reset_fup: e.target.checked })}
                    className="rounded border-gray-300 dark:border-gray-600"
                  />
                  <span className="text-sm">Reset FUP Quota</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={changeServiceOptions.prorate_price}
                    onChange={(e) => setChangeServiceOptions({ ...changeServiceOptions, prorate_price: e.target.checked, charge_price: false })}
                    className="rounded border-gray-300 dark:border-gray-600"
                  />
                  <span className="text-sm">Prorate Price (recommended)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={changeServiceOptions.charge_price}
                    onChange={(e) => setChangeServiceOptions({ ...changeServiceOptions, charge_price: e.target.checked, prorate_price: false })}
                    className="rounded border-gray-300 dark:border-gray-600"
                  />
                  <span className="text-sm">Charge Full Price</span>
                </label>
              </div>
              <div>
                <label className="label">Reason</label>
                <input
                  type="text"
                  value={actionReason}
                  onChange={(e) => setActionReason(e.target.value)}
                  className="input"
                  placeholder="Enter reason for change"
                />
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => { setActionModal(null); setActionValue(''); setActionReason(''); setPriceCalculation(null); setChangeServiceOptions({ extend_expiry: false, reset_fup: false, charge_price: false, prorate_price: true }); }} className="btn btn-secondary">
                Cancel
              </button>
              <button
                onClick={() => changeServiceMutation.mutate({
                  id: actionModal.subscriber.id,
                  service_id: parseInt(actionValue),
                  ...changeServiceOptions,
                  reason: actionReason,
                })}
                disabled={!actionValue || changeServiceMutation.isPending || (priceCalculation?.is_downgrade && !priceCalculation?.downgrade_allowed)}
                className="btn btn-primary"
              >
                {changeServiceMutation.isPending ? 'Changing...' : 'Change Service'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Refill Modal */}
      {actionModal?.type === 'refill' && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3 className="text-lg font-semibold">Refill Account</h3>
              <button onClick={() => { setActionModal(null); setActionValue(''); setActionReason(''); }} className="btn btn-ghost btn-sm">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="modal-body space-y-4">
              <div>
                <div className="text-sm text-gray-500 dark:text-gray-400 mb-2">User: <strong>{actionModal.subscriber.username}</strong></div>
              </div>
              <div>
                <label className="label">Amount *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={actionValue}
                  onChange={(e) => setActionValue(e.target.value)}
                  className="input"
                  placeholder="Enter amount"
                />
              </div>
              <div>
                <label className="label">Reason</label>
                <select
                  value={actionReason}
                  onChange={(e) => setActionReason(e.target.value)}
                  className="input"
                >
                  <option value="">Select reason...</option>
                  <option value="prepaid_card">Prepaid Card</option>
                  <option value="cash_payment">Cash Payment</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="credit">Credit</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => { setActionModal(null); setActionValue(''); setActionReason(''); }} className="btn btn-secondary">
                Cancel
              </button>
              <button
                onClick={() => refillMutation.mutate({
                  id: actionModal.subscriber.id,
                  amount: parseFloat(actionValue),
                  reason: actionReason,
                })}
                disabled={!actionValue || parseFloat(actionValue) <= 0 || refillMutation.isPending}
                className="btn btn-primary"
              >
                {refillMutation.isPending ? 'Refilling...' : 'Refill'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Import Modal */}
      {showBulkImport && (
        <div className="modal-overlay">
          <div className="modal modal-lg">
            <div className="modal-header">
              <h3 className="text-lg font-semibold">Bulk Import Subscribers</h3>
              <button onClick={() => { setShowBulkImport(false); setImportFile(null); setImportResults(null); }} className="btn btn-ghost btn-sm">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="modal-body space-y-4">
              <div>
                <label className="label">CSV File</label>
                <div
                  className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary-400"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <DocumentArrowUpIcon className="w-10 h-10 text-gray-400 mx-auto mb-2" />
                  <p className="text-sm text-gray-600 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">
                    {importFile ? importFile.name : 'Click to select CSV file'}
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    Columns: username, password, full_name, email, phone, address
                  </p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                  className="hidden"
                />
              </div>

              <div>
                <label className="label">Service Plan *</label>
                <select
                  value={importServiceId}
                  onChange={(e) => setImportServiceId(e.target.value)}
                  className="input"
                >
                  <option value="">Select Service</option>
                  {services?.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              {importResults && (
                <div className="bg-gray-50 rounded-lg p-4 max-h-48 overflow-y-auto">
                  <h4 className="font-medium mb-2">Import Results</h4>
                  <p className="text-sm text-green-600">Created: {importResults.created}</p>
                  <p className="text-sm text-red-600">Failed: {importResults.failed}</p>
                  {importResults.results?.filter(r => !r.success).slice(0, 10).map((r, i) => (
                    <p key={i} className="text-xs text-red-500">
                      Row {r.row}: {r.message}
                    </p>
                  ))}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button
                onClick={() => { setShowBulkImport(false); setImportFile(null); setImportResults(null); }}
                className="btn btn-secondary"
              >
                Close
              </button>
              <button
                onClick={handleBulkImport}
                disabled={!importFile || !importServiceId || bulkImportMutation.isPending}
                className="btn btn-primary flex items-center gap-2"
              >
                {bulkImportMutation.isPending ? (
                  <ArrowPathIcon className="w-4 h-4 animate-spin" />
                ) : (
                  <ArrowUpTrayIcon className="w-4 h-4" />
                )}
                Import
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Torch Modal - Live Traffic (Mobile Friendly) */}
      {torchModal && (
        <div className="modal-overlay">
          <div className="modal-content w-full max-w-2xl mx-2 sm:mx-auto max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="modal-header flex-shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <SignalIcon className="w-5 h-5 text-green-500 flex-shrink-0" />
                <h3 className="text-base sm:text-lg font-bold truncate">
                  <span className="hidden sm:inline">Live Traffic - </span>{torchModal.username}
                </h3>
                {torchAutoRefresh && (
                  <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
                  </span>
                )}
              </div>
              <button onClick={() => { setTorchModal(null); setTorchData(null); setTorchAutoRefresh(false); }} className="btn btn-ghost btn-sm flex-shrink-0">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            {/* Body - Scrollable */}
            <div className="modal-body flex-1 overflow-y-auto">
              {/* Controls - Stack on mobile */}
              <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="text-sm text-gray-600 dark:text-gray-300">
                  IP: <code className="bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-100 px-2 py-1 rounded text-xs font-mono">{torchModal.ip_address || 'N/A'}</code>
                </div>
                <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                  <label className="flex items-center gap-2 text-sm cursor-pointer text-gray-700 dark:text-gray-300">
                    <input
                      type="checkbox"
                      checked={torchAutoRefresh}
                      onChange={(e) => setTorchAutoRefresh(e.target.checked)}
                      className="rounded border-gray-300 dark:border-gray-500"
                    />
                    <span className="text-xs sm:text-sm">Auto</span>
                  </label>
                  <button
                    onClick={() => fetchTorchData(torchModal)}
                    disabled={torchLoading}
                    className="btn btn-sm btn-secondary flex items-center gap-1"
                  >
                    <ArrowPathIcon className={clsx('w-4 h-4', torchLoading && 'animate-spin')} />
                    <span className="hidden sm:inline">Refresh</span>
                  </button>
                </div>
              </div>

              {/* Loading */}
              {torchLoading && !torchData && (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
                  <span className="ml-3 text-gray-500 dark:text-gray-400">Capturing...</span>
                </div>
              )}

              {/* Torch Data */}
              {torchData && (
                <div>
                  {/* Summary Header - Stack on mobile */}
                  <div className="bg-gray-900 text-white rounded-t-lg p-3">
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                      <div className="text-sm">
                        <span className="text-gray-400">Interface: </span>
                        <span className="font-mono text-green-400">{torchData.interface}</span>
                      </div>
                      <div className="flex items-center gap-4 text-sm">
                        <div className="flex items-center gap-1">
                          <ArrowDownTrayIcon className="w-4 h-4 text-green-400" />
                          <span className="text-green-400 font-bold">
                            {((torchData.total_tx || 0) * 8 / 1000000).toFixed(1)} Mbps
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <ArrowUpTrayIcon className="w-4 h-4 text-blue-400" />
                          <span className="text-blue-400 font-bold">
                            {((torchData.total_rx || 0) * 8 / 1000000).toFixed(1)} Mbps
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Traffic Entries */}
                  {torchData.entries && torchData.entries.length > 0 ? (
                    <div className="border border-t-0 border-gray-300 dark:border-gray-600 rounded-b-lg overflow-hidden">
                      {/* Mobile: Card Layout */}
                      <div className="sm:hidden max-h-64 overflow-y-auto divide-y divide-gray-200 dark:divide-gray-600 bg-white dark:bg-gray-800">
                        {torchData.entries.slice(0, 50).map((entry, idx) => (
                          <div key={idx} className={clsx(
                            'p-3 text-xs',
                            entry.tx_rate > 1000000 ? 'bg-green-50 dark:bg-green-900/30' : 'bg-white dark:bg-gray-800',
                            entry.tx_rate > 5000000 && 'bg-yellow-50 dark:bg-yellow-900/30'
                          )}>
                            <div className="flex justify-between items-start mb-1">
                              <span className={clsx(
                                'font-bold uppercase',
                                entry.protocol === 'tcp' && 'text-blue-600 dark:text-blue-400',
                                entry.protocol === 'udp' && 'text-purple-600 dark:text-purple-400',
                                entry.protocol === 'icmp' && 'text-orange-600 dark:text-orange-400',
                                !entry.protocol && 'text-gray-600 dark:text-gray-400'
                              )}>
                                {entry.protocol || '-'}
                              </span>
                              <div className="text-right">
                                <span className="text-green-600 dark:text-green-400 font-semibold">
                                  ↓ {entry.tx_rate > 1000000 ? `${(entry.tx_rate * 8 / 1000000).toFixed(1)}M` : entry.tx_rate > 1000 ? `${(entry.tx_rate * 8 / 1000).toFixed(0)}k` : `${(entry.tx_rate * 8).toFixed(0)}b`}
                                </span>
                                <span className="text-gray-400 dark:text-gray-500 mx-1">/</span>
                                <span className="text-blue-600 dark:text-blue-400 font-semibold">
                                  ↑ {entry.rx_rate > 1000000 ? `${(entry.rx_rate * 8 / 1000000).toFixed(1)}M` : entry.rx_rate > 1000 ? `${(entry.rx_rate * 8 / 1000).toFixed(0)}k` : `${(entry.rx_rate * 8).toFixed(0)}b`}
                                </span>
                              </div>
                            </div>
                            <div className="text-gray-600 dark:text-gray-300 truncate font-mono">
                              {entry.src_address}{entry.src_port > 0 && `:${entry.src_port}`}
                              <span className="mx-1 text-gray-400">→</span>
                              {entry.dst_address}{entry.dst_port > 0 && `:${entry.dst_port}`}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Desktop: Table Layout */}
                      <div className="hidden sm:block max-h-80 overflow-y-auto">
                        <table className="w-full text-xs font-mono">
                          <thead className="bg-gray-100 dark:bg-gray-700 sticky top-0">
                            <tr className="text-gray-600 dark:text-gray-400">
                              <th className="px-2 py-1.5 text-left">Proto</th>
                              <th className="px-2 py-1.5 text-left">Src. Address</th>
                              <th className="px-2 py-1.5 text-left">Dst. Address</th>
                              <th className="px-2 py-1.5 text-right">Download</th>
                              <th className="px-2 py-1.5 text-right">Upload</th>
                            </tr>
                          </thead>
                          <tbody className="bg-white dark:bg-gray-800">
                            {torchData.entries.slice(0, 100).map((entry, idx) => (
                              <tr key={idx} className={clsx(
                                'border-t border-gray-100 dark:border-gray-700 hover:bg-blue-50 dark:hover:bg-gray-700',
                                entry.tx_rate > 1000000 && 'bg-green-50 dark:bg-green-900/20',
                                entry.tx_rate > 5000000 && 'bg-yellow-50 dark:bg-yellow-900/20'
                              )}>
                                <td className="px-2 py-1">
                                  <span className={clsx(
                                    'uppercase',
                                    entry.protocol === 'tcp' && 'text-blue-600',
                                    entry.protocol === 'udp' && 'text-purple-600',
                                    entry.protocol === 'icmp' && 'text-orange-600'
                                  )}>
                                    {entry.protocol || '-'}
                                  </span>
                                </td>
                                <td className="px-2 py-1 text-gray-700 dark:text-gray-300">
                                  {entry.src_address}{entry.src_port > 0 && `:${entry.src_port}`}
                                </td>
                                <td className="px-2 py-1 text-gray-700 dark:text-gray-300">
                                  {entry.dst_address}{entry.dst_port > 0 && `:${entry.dst_port}`}
                                </td>
                                <td className="px-2 py-1 text-right text-green-700 dark:text-green-400 font-medium">
                                  {entry.tx_rate > 1000000 ? `${(entry.tx_rate * 8 / 1000000).toFixed(1)} Mbps` : entry.tx_rate > 1000 ? `${(entry.tx_rate * 8 / 1000).toFixed(1)} kbps` : `${(entry.tx_rate * 8).toFixed(0)} bps`}
                                </td>
                                <td className="px-2 py-1 text-right text-blue-700 dark:text-blue-400 font-medium">
                                  {entry.rx_rate > 1000000 ? `${(entry.rx_rate * 8 / 1000000).toFixed(1)} Mbps` : entry.rx_rate > 1000 ? `${(entry.rx_rate * 8 / 1000).toFixed(1)} kbps` : `${(entry.rx_rate * 8).toFixed(0)} bps`}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Footer */}
                      <div className="bg-gray-100 dark:bg-gray-700 px-3 py-1.5 text-xs text-gray-500 dark:text-gray-400 border-t dark:border-gray-600 flex justify-between">
                        <span>{torchData.entries.length} flows</span>
                        <span>{torchData.duration}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="border border-t-0 border-gray-300 dark:border-gray-600 rounded-b-lg p-6 text-center text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700">
                      No active traffic flows
                    </div>
                  )}
                </div>
              )}

              {!torchLoading && !torchData && (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  Click Refresh to capture traffic
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="modal-footer flex-shrink-0">
              <button onClick={() => { setTorchModal(null); setTorchData(null); setTorchAutoRefresh(false); }} className="btn btn-secondary w-full sm:w-auto">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
