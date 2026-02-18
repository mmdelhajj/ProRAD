import { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { serviceApi, cdnApi, nasApi } from '../services/api'
import { useAuthStore } from '../store/authStore'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
} from '@tanstack/react-table'
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  XMarkIcon,
  GlobeAltIcon,
  ClockIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  ChevronUpDownIcon,
} from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'
import clsx from 'clsx'

export default function Services() {
  const queryClient = useQueryClient()
  const { hasPermission } = useAuthStore()
  const [showModal, setShowModal] = useState(false)
  const [editingService, setEditingService] = useState(null)
  const [sorting, setSorting] = useState(() => {
    try {
      const saved = localStorage.getItem('services_sorting')
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })

  useEffect(() => {
    localStorage.setItem('services_sorting', JSON.stringify(sorting))
  }, [sorting])
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
    time_download_ratio: '0',
    time_upload_ratio: '0',
    // MikroTik/RADIUS settings
    nas_id: null,
    pool_name: '',
    address_list_in: '',
    address_list_out: '',
    queue_type: 'simple',
  })

  const [serviceCDNs, setServiceCDNs] = useState([])
  const [cdnsLoaded, setCdnsLoaded] = useState(false)

  // IP Pool state for RADIUS settings
  const [selectedNasId, setSelectedNasId] = useState(null)
  const [ipPools, setIpPools] = useState([])
  const [ipPoolsLoading, setIpPoolsLoading] = useState(false)

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
      // Auto-select pool matching service's pool_name if no real range selected yet
      const poolName = formData.pool_name
      if (poolName) {
        const match = pools.find(p => p.name === poolName)
        if (match) {
          setServiceCDNs(prev => prev.map(sc => {
            if (sc.cdn_id !== cdnId) return sc
            // Only override if current value is not already a CIDR range
            const hasRange = sc.pcq_target_pools && sc.pcq_target_pools.includes('/')
            if (!hasRange) {
              return { ...sc, pcq_target_pools: match.ranges }
            }
            return sc
          }))
        }
      }
    } catch (err) {
      console.error('Failed to fetch pools:', err)
      setPcqPools(prev => ({ ...prev, [cdnId]: { loading: false, pools: [] } }))
    }
  }

  // Fetch IP pools for RADIUS settings when NAS is selected
  const fetchIPPoolsForService = async (nasId) => {
    if (!nasId) {
      setIpPools([])
      return
    }
    setIpPoolsLoading(true)
    try {
      const response = await nasApi.getPools(nasId)
      const pools = response.data.data || []
      setIpPools(pools)
    } catch (err) {
      console.error('Failed to fetch IP pools:', err)
      setIpPools([])
      toast.error('Failed to fetch IP pools from NAS')
    } finally {
      setIpPoolsLoading(false)
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
          time_speed_ratio: parseInt(sc.time_speed_ratio) || 0,
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
        time_download_ratio: service.time_download_ratio?.toString() || '0',
        time_upload_ratio: service.time_upload_ratio?.toString() || '0',
        nas_id: service.nas_id || null,
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
        time_download_ratio: '0',
        time_upload_ratio: '0',
        pool_name: '',
        address_list_in: '',
        address_list_out: '',
        queue_type: 'simple',
      })
    }
    // Reset IP pools state (restore NAS from service if editing)
    const restoredNasId = service?.nas_id || null
    setSelectedNasId(restoredNasId)
    setIpPools([])
    setIpPoolsLoading(false)
    if (restoredNasId) {
      fetchIPPoolsForService(restoredNasId)
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
            time_speed_ratio: sc.time_speed_ratio || 0,
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

  const [showDuplicateModal, setShowDuplicateModal] = useState(false)
  const [duplicatingService, setDuplicatingService] = useState(null)
  const [duplicateName, setDuplicateName] = useState('')

  const handleRowClick = (service) => {
    setDuplicatingService(service)
    setDuplicateName(service.name + ' (Copy)')
    setShowDuplicateModal(true)
  }

  const duplicateMutation = useMutation({
    mutationFn: async ({ originalService, newName }) => {
      const data = {
        name: newName,
        description: originalService.description || '',
        download_speed: originalService.download_speed || 0,
        upload_speed: originalService.upload_speed || 0,
        download_speed_str: originalService.download_speed ? `${originalService.download_speed}k` : '',
        upload_speed_str: originalService.upload_speed ? `${originalService.upload_speed}k` : '',
        price: originalService.price || 0,
        day_price: originalService.day_price || 0,
        validity_days: originalService.validity_days || 30,
        daily_quota: originalService.daily_quota || 0,
        monthly_quota: originalService.monthly_quota || 0,
        burst_download: originalService.burst_download || 0,
        burst_upload: originalService.burst_upload || 0,
        burst_threshold: originalService.burst_threshold || 0,
        burst_time: originalService.burst_time || 0,
        priority: originalService.priority || 8,
        fup1_threshold: originalService.fup1_threshold || 0,
        fup1_download_speed: originalService.fup1_download_speed || 0,
        fup1_upload_speed: originalService.fup1_upload_speed || 0,
        fup2_threshold: originalService.fup2_threshold || 0,
        fup2_download_speed: originalService.fup2_download_speed || 0,
        fup2_upload_speed: originalService.fup2_upload_speed || 0,
        fup3_threshold: originalService.fup3_threshold || 0,
        fup3_download_speed: originalService.fup3_download_speed || 0,
        fup3_upload_speed: originalService.fup3_upload_speed || 0,
        monthly_fup1_threshold: originalService.monthly_fup1_threshold || 0,
        monthly_fup1_download_speed: originalService.monthly_fup1_download_speed || 0,
        monthly_fup1_upload_speed: originalService.monthly_fup1_upload_speed || 0,
        monthly_fup2_threshold: originalService.monthly_fup2_threshold || 0,
        monthly_fup2_download_speed: originalService.monthly_fup2_download_speed || 0,
        monthly_fup2_upload_speed: originalService.monthly_fup2_upload_speed || 0,
        monthly_fup3_threshold: originalService.monthly_fup3_threshold || 0,
        monthly_fup3_download_speed: originalService.monthly_fup3_download_speed || 0,
        monthly_fup3_upload_speed: originalService.monthly_fup3_upload_speed || 0,
        time_based_speed_enabled: originalService.time_based_speed_enabled || false,
        time_from_hour: originalService.time_from_hour || 0,
        time_from_minute: originalService.time_from_minute || 0,
        time_to_hour: originalService.time_to_hour || 0,
        time_to_minute: originalService.time_to_minute || 0,
        time_download_ratio: originalService.time_download_ratio || 0,
        time_upload_ratio: originalService.time_upload_ratio || 0,
        nas_id: originalService.nas_id || null,
        pool_name: originalService.pool_name || '',
        address_list_in: originalService.address_list_in || '',
        address_list_out: originalService.address_list_out || '',
        queue_type: originalService.queue_type || 'simple',
        is_active: true,
      }
      const result = await serviceApi.create(data)
      // Copy CDN configurations
      if (result.data?.data?.id) {
        try {
          const cdnRes = await cdnApi.listServiceCDNs(originalService.id)
          const cdns = cdnRes.data.data || []
          if (cdns.length > 0) {
            await cdnApi.updateServiceCDNs(result.data.data.id, { cdns: cdns.map(sc => ({
              cdn_id: sc.cdn_id,
              speed_limit: sc.speed_limit,
              bypass_quota: sc.bypass_quota,
              pcq_enabled: sc.pcq_enabled || false,
              pcq_limit: sc.pcq_limit || 50,
              pcq_total_limit: sc.pcq_total_limit || 2000,
              pcq_nas_id: sc.pcq_nas_id || null,
              pcq_target_pools: sc.pcq_target_pools || '',
              is_active: sc.is_active ?? true,
              time_based_speed_enabled: sc.time_based_speed_enabled || false,
              time_from_hour: sc.time_from_hour || 0,
              time_from_minute: sc.time_from_minute || 0,
              time_to_hour: sc.time_to_hour || 0,
              time_to_minute: sc.time_to_minute || 0,
              time_speed_ratio: sc.time_speed_ratio || 0,
            }))})
          }
        } catch (err) {
          console.error('Failed to copy CDN configs:', err)
        }
      }
      return result
    },
    onSuccess: () => {
      toast.success('Service duplicated successfully')
      queryClient.invalidateQueries(['services'])
      setShowDuplicateModal(false)
      setDuplicatingService(null)
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to duplicate service'),
  })

  const handleDuplicate = (e) => {
    e.preventDefault()
    if (!duplicateName.trim()) {
      toast.error('Service name is required')
      return
    }
    duplicateMutation.mutate({ originalService: duplicatingService, newName: duplicateName.trim() })
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
      time_download_ratio: parseInt(formData.time_download_ratio) || 0,
      time_upload_ratio: parseInt(formData.time_upload_ratio) || 0,
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
    // Auto-fill NAS and pool from RADIUS Settings if already selected
    const autoNasId = selectedNasId || formData.nas_id || null
    const autoPool = formData.pool_name || ''
    setServiceCDNs([...serviceCDNs, {
      cdn_id: cdnId,
      speed_limit: 0,
      bypass_quota: false,
      pcq_enabled: false,
      pcq_limit: 50,
      pcq_total_limit: 2000,
      pcq_nas_id: autoNasId,
      pcq_target_pools: autoPool,
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
    // Auto-fetch pools for this CDN if NAS is already selected
    if (autoNasId) {
      fetchPoolsForCDN(cdnId, autoNasId)
    }
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
        enableSorting: true,
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.name}</div>
            <div className="text-sm text-gray-500 dark:text-gray-400">{row.original.description}</div>
          </div>
        ),
      },
      {
        id: 'speed',
        header: 'Speed',
        enableSorting: true,
        accessorFn: (row) => row.download_speed || 0,
        sortingFn: 'basic',
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
        enableSorting: true,
        sortingFn: 'basic',
        cell: ({ row }) => `$${row.original.price?.toFixed(2)}`,
      },
      {
        accessorKey: 'validity_days',
        header: 'Validity',
        enableSorting: false,
        cell: ({ row }) => `${row.original.validity_days} days`,
      },
      {
        accessorKey: 'quota',
        header: 'Quota',
        enableSorting: false,
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
        enableSorting: false,
        cell: ({ row }) => (
          <span className={clsx('text-sm', row.original.pool_name ? 'text-gray-900' : 'text-gray-400')}>
            {row.original.pool_name || 'None'}
          </span>
        ),
      },
      {
        accessorKey: 'fup',
        header: 'FUP Tiers',
        enableSorting: false,
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
        enableSorting: false,
        cell: ({ row }) => (
          <span className={clsx('badge', row.original.is_active ? 'badge-success' : 'badge-gray')}>
            {row.original.is_active ? 'Active' : 'Inactive'}
          </span>
        ),
      },
      {
        id: 'actions',
        header: 'Actions',
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
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
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Services</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Manage internet service plans</p>
        </div>
        {hasPermission('services.create') && (
          <button onClick={() => openModal()} className="btn-primary flex items-center gap-2 w-full sm:w-auto justify-center">
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
                      {header.column.getCanSort() ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className="flex items-center gap-1 cursor-pointer select-none hover:text-primary-600 dark:hover:text-primary-400"
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {{
                            asc: <ChevronUpIcon className="w-4 h-4 text-primary-600 dark:text-primary-400" />,
                            desc: <ChevronDownIcon className="w-4 h-4 text-primary-600 dark:text-primary-400" />,
                          }[header.column.getIsSorted()] ?? <ChevronUpDownIcon className="w-3.5 h-3.5 text-gray-400" />}
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
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
                  <tr
                    key={row.id}
                    className="hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
                    onClick={() => handleRowClick(row.original)}
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

      {/* Duplicate Modal */}
      {showDuplicateModal && duplicatingService && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4">
            <div className="fixed inset-0 bg-black bg-opacity-50" onClick={() => setShowDuplicateModal(false)} />
            <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full">
              <div className="p-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Duplicate Service</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                  Copy all settings from <span className="font-medium text-gray-700 dark:text-gray-300">{duplicatingService.name}</span>
                </p>
                <div className="mb-2 text-xs text-gray-500 dark:text-gray-400 space-y-1">
                  <div>Speed: ↓{duplicatingService.download_speed}kb / ↑{duplicatingService.upload_speed}kb</div>
                  <div>Price: ${duplicatingService.price?.toFixed(2)} | Validity: {duplicatingService.validity_days} days</div>
                  {duplicatingService.pool_name && <div>Pool: {duplicatingService.pool_name}</div>}
                </div>
                <form onSubmit={handleDuplicate} className="mt-4">
                  <label className="label">New Service Name</label>
                  <input
                    type="text"
                    value={duplicateName}
                    onChange={(e) => setDuplicateName(e.target.value)}
                    className="input w-full"
                    autoFocus
                    required
                  />
                  <div className="flex justify-end gap-3 mt-4">
                    <button type="button" onClick={() => setShowDuplicateModal(false)} className="btn-secondary">
                      Cancel
                    </button>
                    <button type="submit" disabled={duplicateMutation.isLoading} className="btn-primary">
                      {duplicateMutation.isLoading ? 'Duplicating...' : 'Duplicate'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit/Create Modal */}
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
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="label">Select NAS/Router</label>
                      <select
                        value={selectedNasId || ''}
                        onChange={(e) => {
                          const nasId = e.target.value ? parseInt(e.target.value) : null
                          setSelectedNasId(nasId)
                          setFormData(prev => ({ ...prev, nas_id: nasId }))
                          if (nasId) {
                            fetchIPPoolsForService(nasId)
                          } else {
                            setIpPools([])
                          }
                        }}
                        className="input"
                      >
                        <option value="">-- Select NAS to fetch pools --</option>
                        {nasList?.filter(n => n.is_active).map(nas => (
                          <option key={nas.id} value={nas.id}>{nas.name} ({nas.ip_address})</option>
                        ))}
                      </select>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Select router to load available IP pools</p>
                    </div>
                    <div>
                      <label className="label">IP Pool Name</label>
                      {ipPoolsLoading ? (
                        <div className="input flex items-center text-gray-500 dark:text-gray-400">
                          <svg className="animate-spin h-4 w-4 mr-2" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          Loading pools...
                        </div>
                      ) : ipPools.length > 0 || formData.pool_name ? (
                        <select
                          name="pool_name"
                          value={formData.pool_name}
                          onChange={handleChange}
                          className="input"
                        >
                          <option value="">-- Select Pool --</option>
                          {/* Show current pool_name as option if not in ipPools list */}
                          {formData.pool_name && !ipPools.find(p => p.name === formData.pool_name) && (
                            <option key={formData.pool_name} value={formData.pool_name}>
                              {formData.pool_name} (current)
                            </option>
                          )}
                          {ipPools.map(pool => (
                            <option key={pool.name} value={pool.name}>
                              {pool.name} ({pool.ranges})
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          name="pool_name"
                          value={formData.pool_name}
                          onChange={handleChange}
                          className="input"
                          placeholder={selectedNasId ? "No pools found - enter manually" : "Select NAS first or enter manually"}
                        />
                      )}
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {formData.pool_name ? (
                          <span className="text-green-600 dark:text-green-400">Selected: {formData.pool_name}</span>
                        ) : (
                          "Pool for Framed-Pool RADIUS attribute"
                        )}
                      </p>
                    </div>
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
                    <h3 className="font-medium">Free Hours — Quota Discount (Automatic)</h3>
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
                    Give customers free quota during specified hours. Set 100% = completely free (no quota counted), 70% = 70% free (only 30% counted), 0% = no discount. Use Bandwidth Rules to boost speed separately.
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
                      <label className="label text-indigo-700">Quota Free % (Download)</label>
                      <input
                        type="number"
                        name="time_download_ratio"
                        value={formData.time_download_ratio}
                        onChange={handleChange}
                        className="input"
                        placeholder="100"
                        min="0"
                        max="100"
                      />
                      <p className="text-xs text-indigo-500 mt-1">100% = fully free, 70% = 30% counted</p>
                    </div>
                    <div>
                      <label className="label text-indigo-700">Quota Free % (Upload)</label>
                      <input
                        type="number"
                        name="time_upload_ratio"
                        value={formData.time_upload_ratio}
                        onChange={handleChange}
                        className="input"
                        placeholder="100"
                        min="0"
                        max="100"
                      />
                      <p className="text-xs text-indigo-500 mt-1">100% = fully free, 70% = 30% counted</p>
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
                                value={sc.speed_limit === 0 ? '' : sc.speed_limit}
                                onChange={(e) => updateCDNConfig(sc.cdn_id, 'speed_limit', e.target.value === '' ? 0 : parseInt(e.target.value) || 0)}
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
                            <div className="flex flex-col">
                              <label className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={sc.is_active}
                                  onChange={(e) => updateCDNConfig(sc.cdn_id, 'is_active', e.target.checked)}
                                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                                />
                                <span className="text-sm">Active</span>
                              </label>
                              <span className="text-xs text-gray-400 mt-1">Show in Live Graph</span>
                            </div>
                          </div>

                          {/* PCQ Mode Option */}
                          <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                            <div className="flex items-center gap-4">
                              <label className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={sc.pcq_enabled}
                                  onChange={(e) => {
                                    const enabled = e.target.checked
                                    const autoNasId = selectedNasId || formData.nas_id || null
                                    if (enabled && autoNasId && !sc.pcq_nas_id) {
                                      updateCDNConfigMultiple(sc.cdn_id, { pcq_enabled: true, pcq_nas_id: autoNasId })
                                      fetchPoolsForCDN(sc.cdn_id, autoNasId)
                                    } else {
                                      updateCDNConfig(sc.cdn_id, 'pcq_enabled', enabled)
                                    }
                                  }}
                                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:focus:ring-blue-400"
                                />
                                <span className="text-sm text-blue-700 font-medium">PCQ Mode</span>
                              </label>
                              <span className="text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">(Shared queue for all subscribers)</span>
                            </div>
                            {sc.pcq_enabled && (
                              <div className="mt-2 p-3 bg-blue-50 rounded space-y-3">
                                {/* NAS Selector - hidden if service already has NAS selected in RADIUS Settings */}
                                {(() => {
                                  const serviceNasId = selectedNasId || formData.nas_id || null
                                  const serviceNas = serviceNasId ? nasList?.find(n => n.id === serviceNasId) : null
                                  if (serviceNas) {
                                    return (
                                      <div className="text-xs text-blue-700">
                                        NAS: <span className="font-medium">{serviceNas.name} ({serviceNas.ip_address})</span>
                                        <span className="text-gray-400 ml-1">— from RADIUS Settings</span>
                                      </div>
                                    )
                                  }
                                  return (
                                    <div>
                                      <label className="label text-xs text-blue-700">Select NAS</label>
                                      <select
                                        value={sc.pcq_nas_id || ''}
                                        onChange={(e) => {
                                          const nasId = e.target.value ? parseInt(e.target.value) : null
                                          updateCDNConfigMultiple(sc.cdn_id, { pcq_nas_id: nasId, pcq_target_pools: '' })
                                          if (nasId) { fetchPoolsForCDN(sc.cdn_id, nasId) }
                                        }}
                                        className="input text-sm"
                                      >
                                        <option value="">-- Select NAS --</option>
                                        {nasList?.filter(n => n.is_active).map(nas => (
                                          <option key={nas.id} value={nas.id}>{nas.name} ({nas.ip_address})</option>
                                        ))}
                                      </select>
                                    </div>
                                  )
                                })()}

                                {/* Pool Selector */}
                                {sc.pcq_nas_id && (
                                  <div>
                                    <label className="label text-xs text-blue-700">Select Pools (Target)</label>
                                    {pcqPools[sc.cdn_id]?.loading ? (
                                      <div className="text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">Loading pools...</div>
                                    ) : pcqPools[sc.cdn_id]?.pools?.length > 0 ? (
                                      <div className="grid grid-cols-2 gap-2 mt-1">
                                        {pcqPools[sc.cdn_id].pools.filter(pool =>
                                          !formData.pool_name || pool.name === formData.pool_name
                                        ).map(pool => {
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
