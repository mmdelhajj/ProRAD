import { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { serviceApi, cdnApi, nasApi } from '../services/api'
import { useAuthStore } from '../store/authStore'
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
} from '@tanstack/react-table'
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  XMarkIcon,
  GlobeAltIcon,
  ClockIcon,
} from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'
import clsx from 'clsx'

export default function Services() {
  const queryClient = useQueryClient()
  const { hasPermission } = useAuthStore()
  const [showModal, setShowModal] = useState(false)
  const [editingService, setEditingService] = useState(null)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    download_speed: '',
    upload_speed: '',
    price: '',
    validity_days: '30',
    daily_quota: '',
    monthly_quota: '',
    burst_download: '',
    burst_upload: '',
    burst_threshold: '',
    burst_time: '',
    priority: '8',
    // Daily FUP (resets every day)
    fup1_threshold: '',
    fup1_download_speed: '',
    fup1_upload_speed: '',
    fup2_threshold: '',
    fup2_download_speed: '',
    fup2_upload_speed: '',
    fup3_threshold: '',
    fup3_download_speed: '',
    fup3_upload_speed: '',
    // Monthly FUP (resets on renew)
    monthly_fup1_threshold: '',
    monthly_fup1_download_speed: '',
    monthly_fup1_upload_speed: '',
    monthly_fup2_threshold: '',
    monthly_fup2_download_speed: '',
    monthly_fup2_upload_speed: '',
    monthly_fup3_threshold: '',
    monthly_fup3_download_speed: '',
    monthly_fup3_upload_speed: '',
    is_active: true,
    // Time-based speed control (12-hour format)
    time_based_speed_enabled: false,
    time_from_hour: '12',
    time_from_minute: '0',
    time_from_ampm: 'AM',
    time_to_hour: '12',
    time_to_minute: '0',
    time_to_ampm: 'AM',
    time_download_ratio: '100',
    time_upload_ratio: '100',
    // MikroTik/RADIUS settings
    pool_name: '',
    address_list_in: '',
    address_list_out: '',
    queue_type: 'simple',
  })

  const [serviceCDNs, setServiceCDNs] = useState([])
  const [cdnsLoaded, setCdnsLoaded] = useState(false)

  const { data: services, isLoading } = useQuery({
    queryKey: ['services'],
    queryFn: () => serviceApi.list().then((r) => r.data.data),
  })

  const { data: cdnList } = useQuery({
    queryKey: ['cdns'],
    queryFn: () => cdnApi.list({ active: 'true' }).then((r) => r.data.data),
  })

  const { data: nasList } = useQuery({
    queryKey: ['nas-list'],
    queryFn: () => nasApi.list().then((r) => r.data.data),
  })

  // PCQ pool state: { [cdn_id]: { loading: bool, pools: [], selected: [] } }
  const [pcqPools, setPcqPools] = useState({})

  const fetchPoolsForCDN = async (cdnId, nasId) => {
    if (!nasId) return
    setPcqPools(prev => ({ ...prev, [cdnId]: { ...prev[cdnId], loading: true } }))
    try {
      const response = await nasApi.getPools(nasId)
      const pools = response.data.data || []
      setPcqPools(prev => ({ ...prev, [cdnId]: { loading: false, pools } }))
    } catch (err) {
      console.error('Failed to fetch pools:', err)
      setPcqPools(prev => ({ ...prev, [cdnId]: { loading: false, pools: [] } }))
    }
  }

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      let result
      // Convert CDN time from 12h AM/PM to 24h format
      const cdnsFor24h = serviceCDNs.map(sc => {
        let fromHour24 = parseInt(sc.time_from_hour) || 12
        if (sc.time_from_ampm === 'PM' && fromHour24 !== 12) fromHour24 += 12
        if (sc.time_from_ampm === 'AM' && fromHour24 === 12) fromHour24 = 0

        let toHour24 = parseInt(sc.time_to_hour) || 12
        if (sc.time_to_ampm === 'PM' && toHour24 !== 12) toHour24 += 12
        if (sc.time_to_ampm === 'AM' && toHour24 === 12) toHour24 = 0

        return {
          cdn_id: sc.cdn_id,
          speed_limit: sc.speed_limit,
          bypass_quota: sc.bypass_quota,
          pcq_enabled: sc.pcq_enabled || false,
          pcq_limit: parseInt(sc.pcq_limit) || 50,
          pcq_total_limit: parseInt(sc.pcq_total_limit) || 2000,
          pcq_nas_id: sc.pcq_nas_id || null,
          pcq_target_pools: sc.pcq_target_pools || '',
          is_active: sc.is_active,
          time_based_speed_enabled: sc.time_based_speed_enabled || false,
          time_from_hour: fromHour24,
          time_from_minute: parseInt(sc.time_from_minute) || 0,
          time_to_hour: toHour24,
          time_to_minute: parseInt(sc.time_to_minute) || 0,
          time_speed_ratio: parseInt(sc.time_speed_ratio) || 100,
        }
      })

      if (editingService) {
        result = await serviceApi.update(editingService.id, data)
        // Save CDN configurations only if CDNs have been loaded (prevents accidental deletion)
        if (cdnsLoaded) {
          await cdnApi.updateServiceCDNs(editingService.id, { cdns: cdnsFor24h })
        }
      } else {
        result = await serviceApi.create(data)
        // Save CDN configurations for new service
        if (result.data?.data?.id) {
          await cdnApi.updateServiceCDNs(result.data.data.id, { cdns: cdnsFor24h })
        }
      }
      return result
    },
    onSuccess: () => {
      toast.success(editingService ? 'Service updated' : 'Service created')
      queryClient.invalidateQueries(['services'])
      closeModal()
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to save'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => serviceApi.delete(id),
    onSuccess: () => {
      toast.success('Service deleted')
      queryClient.invalidateQueries(['services'])
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to delete'),
  })

  const openModal = (service = null) => {
    if (service) {
      setEditingService(service)
      setFormData({
        name: service.name || '',
        description: service.description || '',
        download_speed: service.download_speed || '',
        upload_speed: service.upload_speed || '',
        price: service.price || '',
        validity_days: service.validity_days || '30',
        daily_quota: service.daily_quota ? Math.round(service.daily_quota / (1024 * 1024 * 1024)) : '',
        monthly_quota: service.monthly_quota ? Math.round(service.monthly_quota / (1024 * 1024 * 1024)) : '',
        burst_download: service.burst_download || '',
        burst_upload: service.burst_upload || '',
        burst_threshold: service.burst_threshold || '',
        burst_time: service.burst_time || '',
        priority: service.priority || '8',
        // Daily FUP (resets every day)
        fup1_threshold: service.fup1_threshold ? Math.round(service.fup1_threshold / (1024 * 1024 * 1024)) : '',
        fup1_download_speed: service.fup1_download_speed || '',
        fup1_upload_speed: service.fup1_upload_speed || '',
        fup2_threshold: service.fup2_threshold ? Math.round(service.fup2_threshold / (1024 * 1024 * 1024)) : '',
        fup2_download_speed: service.fup2_download_speed || '',
        fup2_upload_speed: service.fup2_upload_speed || '',
        fup3_threshold: service.fup3_threshold ? Math.round(service.fup3_threshold / (1024 * 1024 * 1024)) : '',
        fup3_download_speed: service.fup3_download_speed || '',
        fup3_upload_speed: service.fup3_upload_speed || '',
        // Monthly FUP (resets on renew)
        monthly_fup1_threshold: service.monthly_fup1_threshold ? Math.round(service.monthly_fup1_threshold / (1024 * 1024 * 1024)) : '',
        monthly_fup1_download_speed: service.monthly_fup1_download_speed || '',
        monthly_fup1_upload_speed: service.monthly_fup1_upload_speed || '',
        monthly_fup2_threshold: service.monthly_fup2_threshold ? Math.round(service.monthly_fup2_threshold / (1024 * 1024 * 1024)) : '',
        monthly_fup2_download_speed: service.monthly_fup2_download_speed || '',
        monthly_fup2_upload_speed: service.monthly_fup2_upload_speed || '',
        monthly_fup3_threshold: service.monthly_fup3_threshold ? Math.round(service.monthly_fup3_threshold / (1024 * 1024 * 1024)) : '',
        monthly_fup3_download_speed: service.monthly_fup3_download_speed || '',
        monthly_fup3_upload_speed: service.monthly_fup3_upload_speed || '',
        is_active: service.is_active ?? true,
        // Time-based speed control (convert 24h to 12h format)
        time_based_speed_enabled: service.time_based_speed_enabled ?? false,
        time_from_hour: (() => {
          const h = service.time_from_hour || 0
          if (h === 0) return '12'
          if (h > 12) return (h - 12).toString()
          return h.toString()
        })(),
        time_from_minute: service.time_from_minute?.toString() || '0',
        time_from_ampm: (service.time_from_hour || 0) >= 12 ? 'PM' : 'AM',
        time_to_hour: (() => {
          const h = service.time_to_hour || 0
          if (h === 0) return '12'
          if (h > 12) return (h - 12).toString()
          return h.toString()
        })(),
        time_to_minute: service.time_to_minute?.toString() || '0',
        time_to_ampm: (service.time_to_hour || 0) >= 12 ? 'PM' : 'AM',
        time_download_ratio: service.time_download_ratio?.toString() || '100',
        time_upload_ratio: service.time_upload_ratio?.toString() || '100',
        pool_name: service.pool_name || '',
        address_list_in: service.address_list_in || '',
        address_list_out: service.address_list_out || '',
        queue_type: service.queue_type || 'simple',
      })
    } else {
      setEditingService(null)
      setFormData({
        name: '',
        description: '',
        download_speed: '',
        upload_speed: '',
        price: '',
        validity_days: '30',
        daily_quota: '',
        monthly_quota: '',
        burst_download: '',
        burst_upload: '',
        burst_threshold: '',
        burst_time: '',
        priority: '8',
        // Daily FUP (resets every day)
        fup1_threshold: '',
        fup1_download_speed: '',
        fup1_upload_speed: '',
        fup2_threshold: '',
        fup2_download_speed: '',
        fup2_upload_speed: '',
        fup3_threshold: '',
        fup3_download_speed: '',
        fup3_upload_speed: '',
        // Monthly FUP (resets on renew)
        monthly_fup1_threshold: '',
        monthly_fup1_download_speed: '',
        monthly_fup1_upload_speed: '',
        monthly_fup2_threshold: '',
        monthly_fup2_download_speed: '',
        monthly_fup2_upload_speed: '',
        monthly_fup3_threshold: '',
        monthly_fup3_download_speed: '',
        monthly_fup3_upload_speed: '',
        is_active: true,
        // Time-based speed control (12-hour format)
        time_based_speed_enabled: false,
        time_from_hour: '12',
        time_from_minute: '0',
        time_from_ampm: 'AM',
        time_to_hour: '12',
        time_to_minute: '0',
        time_to_ampm: 'AM',
        time_download_ratio: '100',
        time_upload_ratio: '100',
        pool_name: '',
        address_list_in: '',
        address_list_out: '',
        queue_type: 'simple',
      })
    }
    // Load service CDNs if editing
    setCdnsLoaded(false)
    if (service) {
      cdnApi.listServiceCDNs(service.id).then((r) => {
        const cdns = r.data.data || []
        setServiceCDNs(cdns.map(sc => {
          // Convert 24h to 12h format
          const fromHour24 = sc.time_from_hour || 0
          const toHour24 = sc.time_to_hour || 0
          return {
            cdn_id: sc.cdn_id,
            speed_limit: sc.speed_limit || 0,
            bypass_quota: sc.bypass_quota || false,
            pcq_enabled: sc.pcq_enabled || false,
            pcq_limit: sc.pcq_limit || 50,
            pcq_total_limit: sc.pcq_total_limit || 2000,
            pcq_nas_id: sc.pcq_nas_id || null,
            pcq_target_pools: sc.pcq_target_pools || '',
            is_active: sc.is_active ?? true,
            time_based_speed_enabled: sc.time_based_speed_enabled || false,
            time_from_hour: fromHour24 === 0 ? 12 : (fromHour24 > 12 ? fromHour24 - 12 : fromHour24),
            time_from_minute: sc.time_from_minute || 0,
            time_from_ampm: fromHour24 >= 12 ? 'PM' : 'AM',
            time_to_hour: toHour24 === 0 ? 12 : (toHour24 > 12 ? toHour24 - 12 : toHour24),
            time_to_minute: sc.time_to_minute || 0,
            time_to_ampm: toHour24 >= 12 ? 'PM' : 'AM',
            time_speed_ratio: sc.time_speed_ratio || 100,
          }
        }))
        setCdnsLoaded(true)
      }).catch(() => {
        setServiceCDNs([])
        setCdnsLoaded(true)
      })
    } else {
      setServiceCDNs([])
      setCdnsLoaded(true)
    }
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setEditingService(null)
    setServiceCDNs([])
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    // Generate speed strings from kbps values (e.g., 1400 -> "1400k")
    const downloadSpeedKbps = parseInt(formData.download_speed) || 0
    const uploadSpeedKbps = parseInt(formData.upload_speed) || 0

    const data = {
      ...formData,
      download_speed: downloadSpeedKbps,
      upload_speed: uploadSpeedKbps,
      download_speed_str: downloadSpeedKbps > 0 ? `${downloadSpeedKbps}k` : '',
      upload_speed_str: uploadSpeedKbps > 0 ? `${uploadSpeedKbps}k` : '',
      price: parseFloat(formData.price) || 0,
      validity_days: parseInt(formData.validity_days) || 30,
      daily_quota: formData.daily_quota ? parseInt(formData.daily_quota) * 1024 * 1024 * 1024 : 0,
      monthly_quota: formData.monthly_quota ? parseInt(formData.monthly_quota) * 1024 * 1024 * 1024 : 0,
      burst_download: parseInt(formData.burst_download) || 0,
      burst_upload: parseInt(formData.burst_upload) || 0,
      burst_threshold: parseInt(formData.burst_threshold) || 0,
      burst_time: parseInt(formData.burst_time) || 0,
      priority: parseInt(formData.priority) || 8,
      // Multi-tier FUP with direct speeds (in Kbps)
      fup1_threshold: formData.fup1_threshold ? parseInt(formData.fup1_threshold) * 1024 * 1024 * 1024 : 0,
      fup1_download_speed: parseInt(formData.fup1_download_speed) || 0,
      fup1_upload_speed: parseInt(formData.fup1_upload_speed) || 0,
      fup2_threshold: formData.fup2_threshold ? parseInt(formData.fup2_threshold) * 1024 * 1024 * 1024 : 0,
      fup2_download_speed: parseInt(formData.fup2_download_speed) || 0,
      fup2_upload_speed: parseInt(formData.fup2_upload_speed) || 0,
      fup3_threshold: formData.fup3_threshold ? parseInt(formData.fup3_threshold) * 1024 * 1024 * 1024 : 0,
      fup3_download_speed: parseInt(formData.fup3_download_speed) || 0,
      fup3_upload_speed: parseInt(formData.fup3_upload_speed) || 0,
      // Monthly FUP (resets on renewal)
      monthly_fup1_threshold: formData.monthly_fup1_threshold ? parseInt(formData.monthly_fup1_threshold) * 1024 * 1024 * 1024 : 0,
      monthly_fup1_download_speed: parseInt(formData.monthly_fup1_download_speed) || 0,
      monthly_fup1_upload_speed: parseInt(formData.monthly_fup1_upload_speed) || 0,
      monthly_fup2_threshold: formData.monthly_fup2_threshold ? parseInt(formData.monthly_fup2_threshold) * 1024 * 1024 * 1024 : 0,
      monthly_fup2_download_speed: parseInt(formData.monthly_fup2_download_speed) || 0,
      monthly_fup2_upload_speed: parseInt(formData.monthly_fup2_upload_speed) || 0,
      monthly_fup3_threshold: formData.monthly_fup3_threshold ? parseInt(formData.monthly_fup3_threshold) * 1024 * 1024 * 1024 : 0,
      monthly_fup3_download_speed: parseInt(formData.monthly_fup3_download_speed) || 0,
      monthly_fup3_upload_speed: parseInt(formData.monthly_fup3_upload_speed) || 0,
      // Time-based speed control (convert 12h to 24h format)
      time_based_speed_enabled: formData.time_based_speed_enabled,
      time_from_hour: (() => {
        let h = parseInt(formData.time_from_hour) || 12
        if (formData.time_from_ampm === 'PM' && h !== 12) h += 12
        if (formData.time_from_ampm === 'AM' && h === 12) h = 0
        return h
      })(),
      time_from_minute: parseInt(formData.time_from_minute) || 0,
      time_to_hour: (() => {
        let h = parseInt(formData.time_to_hour) || 12
        if (formData.time_to_ampm === 'PM' && h !== 12) h += 12
        if (formData.time_to_ampm === 'AM' && h === 12) h = 0
        return h
      })(),
      time_to_minute: parseInt(formData.time_to_minute) || 0,
      time_download_ratio: parseInt(formData.time_download_ratio) || 100,
      time_upload_ratio: parseInt(formData.time_upload_ratio) || 100,
    }
    saveMutation.mutate(data)
  }

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }))
  }

  // CDN management functions
  const addCDNConfig = (cdnId) => {
    if (serviceCDNs.find(sc => sc.cdn_id === cdnId)) return
    setServiceCDNs([...serviceCDNs, {
      cdn_id: cdnId,
      speed_limit: 0,
      bypass_quota: false,
      pcq_enabled: false,
      pcq_limit: 50,
      pcq_total_limit: 2000,
      pcq_nas_id: null,
      pcq_target_pools: '',
      is_active: true,
      time_based_speed_enabled: false,
      time_from_hour: 12,
      time_from_minute: 0,
      time_from_ampm: 'AM',
      time_to_hour: 12,
      time_to_minute: 0,
      time_to_ampm: 'AM',
      time_speed_ratio: 100,
    }])
  }

  const removeCDNConfig = (cdnId) => {
    setServiceCDNs(serviceCDNs.filter(sc => sc.cdn_id !== cdnId))
  }

  const updateCDNConfig = (cdnId, field, value) => {
    setServiceCDNs(prev => prev.map(sc =>
      sc.cdn_id === cdnId ? { ...sc, [field]: value } : sc
    ))
  }

  const updateCDNConfigMultiple = (cdnId, updates) => {
    setServiceCDNs(prev => prev.map(sc =>
      sc.cdn_id === cdnId ? { ...sc, ...updates } : sc
    ))
  }

  const getCDNName = (cdnId) => {
    const cdn = cdnList?.find(c => c.id === cdnId)
    return cdn?.name || 'Unknown'
  }

  const columns = useMemo(
    () => [
      {
        accessorKey: 'name',
        header: 'Name',
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.name}</div>
            <div className="text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">{row.original.description}</div>
          </div>
        ),
      },
      {
        accessorKey: 'speed',
        header: 'Speed',
        cell: ({ row }) => (
          <div className="text-sm">
            <div>↓ {row.original.download_speed} kb</div>
            <div>↑ {row.original.upload_speed} kb</div>
          </div>
        ),
      },
      {
        accessorKey: 'price',
        header: 'Price',
        cell: ({ row }) => `$${row.original.price?.toFixed(2)}`,
      },
      {
        accessorKey: 'validity_days',
        header: 'Validity',
        cell: ({ row }) => `${row.original.validity_days} days`,
      },
      {
        accessorKey: 'quota',
        header: 'Quota',
        cell: ({ row }) => (
          <div className="text-sm">
            {row.original.daily_quota || row.original.monthly_quota ? (
              <>
                <div>Daily: {row.original.daily_quota ? (row.original.daily_quota / (1024 * 1024 * 1024)).toFixed(0) : '∞'} GB</div>
                <div>Monthly: {row.original.monthly_quota ? (row.original.monthly_quota / (1024 * 1024 * 1024)).toFixed(0) : '∞'} GB</div>
              </>
            ) : (
              <span className="text-gray-400 dark:text-gray-500 dark:text-gray-400">Unlimited</span>
            )}
          </div>
        ),
      },
      {
        accessorKey: 'pool_name',
        header: 'Pool',
        cell: ({ row }) => (
          <span className={clsx('text-sm', row.original.pool_name ? 'text-gray-900' : 'text-gray-400')}>
            {row.original.pool_name || 'None'}
          </span>
        ),
      },
      {
        accessorKey: 'fup',
        header: 'FUP Tiers',
        cell: ({ row }) => {
          const s = row.original
          const hasFUP = s.fup1_download_speed > 0 || s.fup2_download_speed > 0 || s.fup3_download_speed > 0
          return (
            <div className="text-xs">
              {hasFUP ? (
                <>
                  {s.fup1_threshold > 0 && s.fup1_download_speed > 0 && (
                    <div className="text-orange-600">
                      FUP1: {Math.round(s.fup1_threshold / 1024 / 1024 / 1024)}GB → {s.fup1_download_speed}k/{s.fup1_upload_speed}k
                    </div>
                  )}
                  {s.fup2_threshold > 0 && s.fup2_download_speed > 0 && (
                    <div className="text-red-600">
                      FUP2: {Math.round(s.fup2_threshold / 1024 / 1024 / 1024)}GB → {s.fup2_download_speed}k/{s.fup2_upload_speed}k
                    </div>
                  )}
                  {s.fup3_threshold > 0 && s.fup3_download_speed > 0 && (
                    <div className="text-purple-600">
                      FUP3: {Math.round(s.fup3_threshold / 1024 / 1024 / 1024)}GB → {s.fup3_download_speed}k/{s.fup3_upload_speed}k
                    </div>
                  )}
                </>
              ) : (
                <span className="text-gray-400 dark:text-gray-500 dark:text-gray-400">None</span>
              )}
            </div>
          )
        },
      },
      {
        accessorKey: 'is_active',
        header: 'Status',
        cell: ({ row }) => (
          <span className={clsx('badge', row.original.is_active ? 'badge-success' : 'badge-gray')}>
            {row.original.is_active ? 'Active' : 'Inactive'}
          </span>
        ),
      },
      {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            {hasPermission('services.edit') && (
              <button
                onClick={() => openModal(row.original)}
                className="p-1.5 text-gray-500 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/30 rounded"
                title="Edit"
              >
                <PencilIcon className="w-4 h-4" />
              </button>
            )}
            {hasPermission('services.delete') && (
              <button
                onClick={() => {
                  if (confirm('Are you sure you want to delete this service?')) {
                    deleteMutation.mutate(row.original.id)
                  }
                }}
                className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded"
                title="Delete"
              >
                <TrashIcon className="w-4 h-4" />
              </button>
            )}
          </div>
        ),
      },
    ],
    [deleteMutation, hasPermission]
  )

  const table = useReactTable({
    data: services || [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Services</h1>
          <p className="text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">Manage internet service plans</p>
        </div>
        {hasPermission('services.create') && (
          <button onClick={() => openModal()} className="btn-primary flex items-center gap-2">
            <PlusIcon className="w-4 h-4" />
            Add Service
          </button>
        )}
      </div>

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
                    No services found
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
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4">
            <div className="fixed inset-0 bg-black bg-opacity-50" onClick={closeModal} />
            <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between p-6 border-b">
                <h2 className="text-xl font-semibold">
                  {editingService ? 'Edit Service' : 'Add Service'}
                </h2>
                <button onClick={closeModal} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-6 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="label">Service Name</label>
                    <input
                      type="text"
                      name="name"
                      value={formData.name}
                      onChange={handleChange}
                      className="input"
                      required
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="label">Description</label>
                    <textarea
                      name="description"
                      value={formData.description}
                      onChange={handleChange}
                      className="input"
                      rows={2}
                    />
                  </div>
                </div>

                <div className="border-t pt-4">
                  <h3 className="font-medium mb-3">Speed Settings</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="label">Download Speed (kb)</label>
                      <input
                        type="number"
                        name="download_speed"
                        value={formData.download_speed}
                        onChange={handleChange}
                        className="input"
                        placeholder="e.g., 4000 for 4Mbps"
                        required
                      />
                    </div>
                    <div>
                      <label className="label">Upload Speed (kb)</label>
                      <input
                        type="number"
                        name="upload_speed"
                        value={formData.upload_speed}
                        onChange={handleChange}
                        className="input"
                        placeholder="e.g., 1400 for 1.4Mbps"
                        required
                      />
                    </div>
                  </div>
                </div>

                <div className="border-t pt-4">
                  <h3 className="font-medium mb-3">Pricing & Validity</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="label">Price ($)</label>
                      <input
                        type="number"
                        name="price"
                        value={formData.price}
                        onChange={handleChange}
                        className="input"
                        step="0.01"
                        required
                      />
                    </div>
                    <div>
                      <label className="label">Validity (Days)</label>
                      <input
                        type="number"
                        name="validity_days"
                        value={formData.validity_days}
                        onChange={handleChange}
                        className="input"
                        required
                      />
                    </div>
                  </div>
                </div>

                <div className="border-t pt-4">
                  <h3 className="font-medium mb-3">Quota Settings (0 = Unlimited)</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="label">Daily Quota (GB)</label>
                      <input
                        type="number"
                        name="daily_quota"
                        value={formData.daily_quota}
                        onChange={handleChange}
                        className="input"
                      />
                    </div>
                    <div>
                      <label className="label">Monthly Quota (GB)</label>
                      <input
                        type="number"
                        name="monthly_quota"
                        value={formData.monthly_quota}
                        onChange={handleChange}
                        className="input"
                      />
                    </div>
                  </div>
                </div>

                <div className="border-t pt-4">
                  <h3 className="font-medium mb-3">Burst Settings (Mikrotik)</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="label">Burst Download (kb)</label>
                      <input
                        type="number"
                        name="burst_download"
                        value={formData.burst_download}
                        onChange={handleChange}
                        className="input"
                        placeholder="e.g., 8000"
                      />
                    </div>
                    <div>
                      <label className="label">Burst Upload (kb)</label>
                      <input
                        type="number"
                        name="burst_upload"
                        value={formData.burst_upload}
                        onChange={handleChange}
                        className="input"
                      />
                    </div>
                    <div>
                      <label className="label">Burst Threshold (%)</label>
                      <input
                        type="number"
                        name="burst_threshold"
                        value={formData.burst_threshold}
                        onChange={handleChange}
                        className="input"
                      />
                    </div>
                    <div>
                      <label className="label">Burst Time (seconds)</label>
                      <input
                        type="number"
                        name="burst_time"
                        value={formData.burst_time}
                        onChange={handleChange}
                        className="input"
                      />
                    </div>
                  </div>
                </div>

                <div className="border-t pt-4">
                  <h3 className="font-medium mb-3">RADIUS Settings</h3>
                  <div>
                    <label className="label">IP Pool Name</label>
                    <input
                      type="text"
                      name="pool_name"
                      value={formData.pool_name}
                      onChange={handleChange}
                      className="input"
                      placeholder="e.g., pool-10mbps"
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500 mt-1">MikroTik IP pool name (must match pool configured on router)</p>
                  </div>
                </div>

                <div className="border-t pt-4">
                  <h3 className="font-medium mb-3">Daily FUP (Resets Every Day at Midnight)</h3>
                  <p className="text-sm text-gray-500 mb-4">
                    Set up to 3 FUP tiers. When daily usage exceeds a threshold, the specified speed is applied.
                    Speed is in Kbps (e.g., 700 = 700k).
                  </p>

                  {/* FUP Tier 1 */}
                  <div className="grid grid-cols-3 gap-4 mb-4 p-3 bg-orange-50 rounded-lg">
                    <div>
                      <label className="label text-orange-700">FUP1 Threshold (GB)</label>
                      <input
                        type="number"
                        name="fup1_threshold"
                        value={formData.fup1_threshold}
                        onChange={handleChange}
                        className="input"
                        placeholder="e.g., 7"
                      />
                    </div>
                    <div>
                      <label className="label text-orange-700">Download (Kbps)</label>
                      <input
                        type="number"
                        name="fup1_download_speed"
                        value={formData.fup1_download_speed}
                        onChange={handleChange}
                        className="input"
                        placeholder="e.g., 700"
                      />
                    </div>
                    <div>
                      <label className="label text-orange-700">Upload (Kbps)</label>
                      <input
                        type="number"
                        name="fup1_upload_speed"
                        value={formData.fup1_upload_speed}
                        onChange={handleChange}
                        className="input"
                        placeholder="e.g., 700"
                      />
                    </div>
                  </div>

                  {/* FUP Tier 2 */}
                  <div className="grid grid-cols-3 gap-4 mb-4 p-3 bg-red-50 rounded-lg">
                    <div>
                      <label className="label text-red-700">FUP2 Threshold (GB)</label>
                      <input
                        type="number"
                        name="fup2_threshold"
                        value={formData.fup2_threshold}
                        onChange={handleChange}
                        className="input"
                        placeholder="e.g., 9"
                      />
                    </div>
                    <div>
                      <label className="label text-red-700">Download (Kbps)</label>
                      <input
                        type="number"
                        name="fup2_download_speed"
                        value={formData.fup2_download_speed}
                        onChange={handleChange}
                        className="input"
                        placeholder="e.g., 500"
                      />
                    </div>
                    <div>
                      <label className="label text-red-700">Upload (Kbps)</label>
                      <input
                        type="number"
                        name="fup2_upload_speed"
                        value={formData.fup2_upload_speed}
                        onChange={handleChange}
                        className="input"
                        placeholder="e.g., 500"
                      />
                    </div>
                  </div>

                  {/* FUP Tier 3 */}
                  <div className="grid grid-cols-3 gap-4 p-3 bg-purple-50 rounded-lg">
                    <div>
                      <label className="label text-purple-700">FUP3 Threshold (GB)</label>
                      <input
                        type="number"
                        name="fup3_threshold"
                        value={formData.fup3_threshold}
                        onChange={handleChange}
                        className="input"
                        placeholder="e.g., 11"
                      />
                    </div>
                    <div>
                      <label className="label text-purple-700">Download (Kbps)</label>
                      <input
                        type="number"
                        name="fup3_download_speed"
                        value={formData.fup3_download_speed}
                        onChange={handleChange}
                        className="input"
                        placeholder="e.g., 300"
                      />
                    </div>
                    <div>
                      <label className="label text-purple-700">Upload (Kbps)</label>
                      <input
                        type="number"
                        name="fup3_upload_speed"
                        value={formData.fup3_upload_speed}
                        onChange={handleChange}
                        className="input"
                        placeholder="e.g., 300"
                      />
                    </div>
                  </div>
                </div>

                <div className="border-t pt-4">
                  <h3 className="font-medium mb-3">Monthly FUP (Resets on Subscription Renewal)</h3>
                  <p className="text-sm text-gray-500 mb-4">
                    When monthly usage exceeds the threshold, the specified speed is applied.
                    Resets when the user renews their subscription.
                  </p>

                  <div className="grid grid-cols-3 gap-4 p-3 bg-cyan-50 dark:bg-cyan-900/30 rounded-lg">
                    <div>
                      <label className="label text-cyan-700">Threshold (GB)</label>
                      <input
                        type="number"
                        name="monthly_fup1_threshold"
                        value={formData.monthly_fup1_threshold}
                        onChange={handleChange}
                        className="input"
                        placeholder="e.g., 100"
                      />
                    </div>
                    <div>
                      <label className="label text-cyan-700">Download (Kbps)</label>
                      <input
                        type="number"
                        name="monthly_fup1_download_speed"
                        value={formData.monthly_fup1_download_speed}
                        onChange={handleChange}
                        className="input"
                        placeholder="e.g., 500"
                      />
                    </div>
                    <div>
                      <label className="label text-cyan-700">Upload (Kbps)</label>
                      <input
                        type="number"
                        name="monthly_fup1_upload_speed"
                        value={formData.monthly_fup1_upload_speed}
                        onChange={handleChange}
                        className="input"
                        placeholder="e.g., 500"
                      />
                    </div>
                  </div>
                </div>

                <div className="border-t pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-medium">Time-Based Speed Control (Automatic)</h3>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        name="time_based_speed_enabled"
                        checked={formData.time_based_speed_enabled}
                        onChange={handleChange}
                        className="toggle toggle-primary"
                      />
                      <span className={`text-sm font-medium ${formData.time_based_speed_enabled ? 'text-green-600' : 'text-gray-500'}`}>
                        {formData.time_based_speed_enabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </label>
                  </div>
                  <p className="text-sm text-gray-500 mb-4">
                    Automatically apply different speed during specified hours. Set ratio to 100 for no change, 200 for double speed, 50 for half speed.
                  </p>

                  <div className={`grid grid-cols-2 gap-4 mb-4 ${!formData.time_based_speed_enabled ? 'opacity-50 pointer-events-none' : ''}`}>
                    <div className="p-3 bg-indigo-50 rounded-lg">
                      <label className="label text-indigo-700 mb-2">From Time</label>
                      <div className="flex gap-2 items-center">
                        <select
                          name="time_from_hour"
                          value={formData.time_from_hour}
                          onChange={handleChange}
                          className="input w-20"
                        >
                          {[12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(h => (
                            <option key={h} value={h}>{h}</option>
                          ))}
                        </select>
                        <span className="font-bold">:</span>
                        <select
                          name="time_from_minute"
                          value={formData.time_from_minute}
                          onChange={handleChange}
                          className="input w-20"
                        >
                          {[0, 15, 30, 45].map(m => (
                            <option key={m} value={m}>{m.toString().padStart(2, '0')}</option>
                          ))}
                        </select>
                        <select
                          name="time_from_ampm"
                          value={formData.time_from_ampm}
                          onChange={handleChange}
                          className="input w-20 font-semibold"
                        >
                          <option value="AM">AM</option>
                          <option value="PM">PM</option>
                        </select>
                      </div>
                    </div>
                    <div className="p-3 bg-indigo-50 rounded-lg">
                      <label className="label text-indigo-700 mb-2">To Time</label>
                      <div className="flex gap-2 items-center">
                        <select
                          name="time_to_hour"
                          value={formData.time_to_hour}
                          onChange={handleChange}
                          className="input w-20"
                        >
                          {[12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(h => (
                            <option key={h} value={h}>{h}</option>
                          ))}
                        </select>
                        <span className="font-bold">:</span>
                        <select
                          name="time_to_minute"
                          value={formData.time_to_minute}
                          onChange={handleChange}
                          className="input w-20"
                        >
                          {[0, 15, 30, 45].map(m => (
                            <option key={m} value={m}>{m.toString().padStart(2, '0')}</option>
                          ))}
                        </select>
                        <select
                          name="time_to_ampm"
                          value={formData.time_to_ampm}
                          onChange={handleChange}
                          className="input w-20 font-semibold"
                        >
                          <option value="AM">AM</option>
                          <option value="PM">PM</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className={`grid grid-cols-2 gap-4 p-3 bg-indigo-50 rounded-lg ${!formData.time_based_speed_enabled ? 'opacity-50 pointer-events-none' : ''}`}>
                    <div>
                      <label className="label text-indigo-700">Download Ratio (%)</label>
                      <input
                        type="number"
                        name="time_download_ratio"
                        value={formData.time_download_ratio}
                        onChange={handleChange}
                        className="input"
                        placeholder="100"
                        min="1"
                      />
                    </div>
                    <div>
                      <label className="label text-indigo-700">Upload Ratio (%)</label>
                      <input
                        type="number"
                        name="time_upload_ratio"
                        value={formData.time_upload_ratio}
                        onChange={handleChange}
                        className="input"
                        placeholder="100"
                        min="1"
                      />
                    </div>
                  </div>
                </div>

                <div className="border-t pt-4">
                  <h3 className="font-medium mb-3 flex items-center gap-2">
                    <GlobeAltIcon className="w-5 h-5 text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400" />
                    CDN Configuration
                  </h3>
                  <p className="text-sm text-gray-500 mb-4">
                    Configure which CDNs apply to this service with custom speed limits and bypass options.
                  </p>

                  {/* Add CDN dropdown */}
                  {cdnList && cdnList.length > 0 && (
                    <div className="mb-4">
                      <select
                        className="input"
                        value=""
                        onChange={(e) => {
                          if (e.target.value) {
                            addCDNConfig(parseInt(e.target.value))
                          }
                        }}
                      >
                        <option value="">+ Add CDN...</option>
                        {cdnList.filter(cdn => !serviceCDNs.find(sc => sc.cdn_id === cdn.id)).map(cdn => (
                          <option key={cdn.id} value={cdn.id}>{cdn.name}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* CDN configurations list */}
                  {serviceCDNs.length > 0 ? (
                    <div className="space-y-3">
                      {serviceCDNs.map((sc) => (
                        <div key={sc.cdn_id} className="p-3 bg-gray-50 rounded-lg border">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <GlobeAltIcon className="w-5 h-5 text-indigo-500" />
                              <span className="font-medium">{getCDNName(sc.cdn_id)}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeCDNConfig(sc.cdn_id)}
                              className="text-red-500 hover:text-red-700 p-1"
                            >
                              <TrashIcon className="w-4 h-4" />
                            </button>
                          </div>
                          <div className="grid grid-cols-3 gap-3">
                            <div>
                              <label className="label text-xs">Speed Limit (Mbps)</label>
                              <input
                                type="number"
                                value={sc.speed_limit}
                                onChange={(e) => updateCDNConfig(sc.cdn_id, 'speed_limit', parseInt(e.target.value) || 0)}
                                className="input text-sm"
                                placeholder="0 = unlimited"
                                min="0"
                              />
                            </div>
                            <div className="flex items-end">
                              <label className="flex items-center gap-2 pb-2">
                                <input
                                  type="checkbox"
                                  checked={sc.bypass_quota}
                                  onChange={(e) => updateCDNConfig(sc.cdn_id, 'bypass_quota', e.target.checked)}
                                  className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                                />
                                <span className="text-sm text-green-700 font-medium">Bypass Quota</span>
                              </label>
                            </div>
                            <div className="flex items-end">
                              <label className="flex items-center gap-2 pb-2">
                                <input
                                  type="checkbox"
                                  checked={sc.is_active}
                                  onChange={(e) => updateCDNConfig(sc.cdn_id, 'is_active', e.target.checked)}
                                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                                />
                                <span className="text-sm">Active</span>
                              </label>
                            </div>
                          </div>

                          {/* PCQ Mode Option */}
                          <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                            <div className="flex items-center gap-4">
                              <label className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={sc.pcq_enabled}
                                  onChange={(e) => updateCDNConfig(sc.cdn_id, 'pcq_enabled', e.target.checked)}
                                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:focus:ring-blue-400"
                                />
                                <span className="text-sm text-blue-700 font-medium">PCQ Mode</span>
                              </label>
                              <span className="text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">(Shared queue for all subscribers)</span>
                            </div>
                            {sc.pcq_enabled && (
                              <div className="mt-2 p-3 bg-blue-50 rounded space-y-3">
                                {/* NAS Selector */}
                                <div>
                                  <label className="label text-xs text-blue-700">Select NAS</label>
                                  <select
                                    value={sc.pcq_nas_id || ''}
                                    onChange={(e) => {
                                      const nasId = e.target.value ? parseInt(e.target.value) : null
                                      updateCDNConfigMultiple(sc.cdn_id, { pcq_nas_id: nasId, pcq_target_pools: '' })
                                      if (nasId) {
                                        fetchPoolsForCDN(sc.cdn_id, nasId)
                                      }
                                    }}
                                    className="input text-sm"
                                  >
                                    <option value="">-- Select NAS --</option>
                                    {nasList?.filter(n => n.is_active).map(nas => (
                                      <option key={nas.id} value={nas.id}>{nas.name} ({nas.ip_address})</option>
                                    ))}
                                  </select>
                                </div>

                                {/* Pool Selector */}
                                {sc.pcq_nas_id && (
                                  <div>
                                    <label className="label text-xs text-blue-700">Select Pools (Target)</label>
                                    {pcqPools[sc.cdn_id]?.loading ? (
                                      <div className="text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">Loading pools...</div>
                                    ) : pcqPools[sc.cdn_id]?.pools?.length > 0 ? (
                                      <div className="grid grid-cols-2 gap-2 mt-1">
                                        {pcqPools[sc.cdn_id].pools.map(pool => {
                                          const selectedPools = sc.pcq_target_pools ? sc.pcq_target_pools.split(',') : []
                                          const isSelected = selectedPools.includes(pool.ranges)
                                          return (
                                            <label key={pool.name} className="flex items-center gap-2 p-2 bg-white rounded border cursor-pointer hover:bg-blue-50">
                                              <input
                                                type="checkbox"
                                                checked={isSelected}
                                                onChange={(e) => {
                                                  let newPools = [...selectedPools]
                                                  if (e.target.checked) {
                                                    newPools.push(pool.ranges)
                                                  } else {
                                                    newPools = newPools.filter(p => p !== pool.ranges)
                                                  }
                                                  updateCDNConfig(sc.cdn_id, 'pcq_target_pools', newPools.filter(p => p).join(','))
                                                }}
                                                className="rounded border-gray-300 text-blue-600"
                                              />
                                              <div>
                                                <div className="text-sm font-medium">{pool.name}</div>
                                                <div className="text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">{pool.ranges}</div>
                                              </div>
                                            </label>
                                          )
                                        })}
                                      </div>
                                    ) : (
                                      <div className="text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">
                                        <button
                                          type="button"
                                          onClick={() => fetchPoolsForCDN(sc.cdn_id, sc.pcq_nas_id)}
                                          className="text-blue-600 hover:underline"
                                        >
                                          Click to fetch pools from NAS
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                )}

                                {/* PCQ Limit Settings */}
                                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-blue-200">
                                  <div>
                                    <label className="label text-xs text-blue-700">PCQ Limit (KiB)</label>
                                    <input
                                      type="number"
                                      value={sc.pcq_limit}
                                      onChange={(e) => updateCDNConfig(sc.cdn_id, 'pcq_limit', parseInt(e.target.value) || 50)}
                                      className="input text-sm"
                                      min="1"
                                    />
                                  </div>
                                  <div>
                                    <label className="label text-xs text-blue-700">PCQ Total Limit (KiB)</label>
                                    <input
                                      type="number"
                                      value={sc.pcq_total_limit}
                                      onChange={(e) => updateCDNConfig(sc.cdn_id, 'pcq_total_limit', parseInt(e.target.value) || 2000)}
                                      className="input text-sm"
                                      min="1"
                                    />
                                  </div>
                                </div>

                                {/* Selected Pools Summary */}
                                {sc.pcq_target_pools && (
                                  <div className="text-xs text-blue-600 bg-blue-100 p-2 rounded">
                                    <strong>Target:</strong> {sc.pcq_target_pools}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Time-Based Speed Control for CDN */}
                          <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <ClockIcon className="w-4 h-4 text-purple-500" />
                                <span className="text-xs font-medium text-purple-700">Time-Based Speed (Night Boost)</span>
                              </div>
                              <label className="flex items-center gap-1 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={sc.time_based_speed_enabled || false}
                                  onChange={(e) => updateCDNConfig(sc.cdn_id, 'time_based_speed_enabled', e.target.checked)}
                                  className="toggle toggle-xs toggle-primary"
                                />
                                <span className={`text-xs ${sc.time_based_speed_enabled ? 'text-green-600' : 'text-gray-400'}`}>
                                  {sc.time_based_speed_enabled ? 'On' : 'Off'}
                                </span>
                              </label>
                            </div>
                            <div className={`grid grid-cols-12 gap-2 ${!sc.time_based_speed_enabled ? 'opacity-50 pointer-events-none' : ''}`}>
                              {/* From Time */}
                              <div className="col-span-4">
                                <label className="label text-xs">From</label>
                                <div className="flex gap-1">
                                  <input
                                    type="number"
                                    value={sc.time_from_hour}
                                    onChange={(e) => updateCDNConfig(sc.cdn_id, 'time_from_hour', Math.min(12, Math.max(1, parseInt(e.target.value) || 12)))}
                                    className="input text-sm w-10 text-center px-1"
                                    min="1"
                                    max="12"
                                  />
                                  <span className="self-center">:</span>
                                  <input
                                    type="number"
                                    value={sc.time_from_minute.toString().padStart(2, '0')}
                                    onChange={(e) => updateCDNConfig(sc.cdn_id, 'time_from_minute', Math.min(59, Math.max(0, parseInt(e.target.value) || 0)))}
                                    className="input text-sm w-10 text-center px-1"
                                    min="0"
                                    max="59"
                                  />
                                  <select
                                    value={sc.time_from_ampm}
                                    onChange={(e) => updateCDNConfig(sc.cdn_id, 'time_from_ampm', e.target.value)}
                                    className="input text-sm w-14 px-1"
                                  >
                                    <option value="AM">AM</option>
                                    <option value="PM">PM</option>
                                  </select>
                                </div>
                              </div>
                              {/* To Time */}
                              <div className="col-span-4">
                                <label className="label text-xs">To</label>
                                <div className="flex gap-1">
                                  <input
                                    type="number"
                                    value={sc.time_to_hour}
                                    onChange={(e) => updateCDNConfig(sc.cdn_id, 'time_to_hour', Math.min(12, Math.max(1, parseInt(e.target.value) || 12)))}
                                    className="input text-sm w-10 text-center px-1"
                                    min="1"
                                    max="12"
                                  />
                                  <span className="self-center">:</span>
                                  <input
                                    type="number"
                                    value={sc.time_to_minute.toString().padStart(2, '0')}
                                    onChange={(e) => updateCDNConfig(sc.cdn_id, 'time_to_minute', Math.min(59, Math.max(0, parseInt(e.target.value) || 0)))}
                                    className="input text-sm w-10 text-center px-1"
                                    min="0"
                                    max="59"
                                  />
                                  <select
                                    value={sc.time_to_ampm}
                                    onChange={(e) => updateCDNConfig(sc.cdn_id, 'time_to_ampm', e.target.value)}
                                    className="input text-sm w-14 px-1"
                                  >
                                    <option value="AM">AM</option>
                                    <option value="PM">PM</option>
                                  </select>
                                </div>
                              </div>
                              {/* Speed Ratio */}
                              <div className="col-span-2">
                                <label className="label text-xs">Speed %</label>
                                <input
                                  type="number"
                                  value={sc.time_speed_ratio}
                                  onChange={(e) => updateCDNConfig(sc.cdn_id, 'time_speed_ratio', parseInt(e.target.value) || 100)}
                                  className="input text-sm"
                                  min="1"
                                  max="1000"
                                  placeholder="100"
                                />
                              </div>
                              {/* Result */}
                              <div className="col-span-2 flex items-end">
                                <p className="text-xs text-gray-500 pb-2">
                                  {sc.time_speed_ratio !== 100 && (sc.time_from_hour !== sc.time_to_hour || sc.time_from_ampm !== sc.time_to_ampm) ? (
                                    <span className="font-medium text-purple-600">{Math.round(sc.speed_limit * sc.time_speed_ratio / 100)}M</span>
                                  ) : (
                                    <span className="text-gray-400 dark:text-gray-500 dark:text-gray-400">-</span>
                                  )}
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-4 text-gray-400 text-sm">
                      No CDNs configured. Select a CDN from the dropdown above.
                    </div>
                  )}
                </div>

                <div className="border-t pt-4">
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      name="is_active"
                      checked={formData.is_active}
                      onChange={handleChange}
                      className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                    <span>Active Service</span>
                  </label>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t">
                  <button type="button" onClick={closeModal} className="btn-secondary">
                    Cancel
                  </button>
                  <button type="submit" disabled={saveMutation.isLoading || (editingService && !cdnsLoaded)} className="btn-primary">
                    {saveMutation.isLoading ? 'Saving...' : (!cdnsLoaded && editingService) ? 'Loading CDNs...' : editingService ? 'Update' : 'Create'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
