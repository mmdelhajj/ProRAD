import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { subscriberApi, serviceApi, nasApi, resellerApi, cdnApi } from '../services/api'
import { useAuthStore } from '../store/authStore'
import { formatDateTime } from '../utils/timezone'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import ReactECharts from 'echarts-for-react'
import {
  UserIcon,
  ChartBarIcon,
  DocumentTextIcon,
  ClockIcon,
  ArrowPathIcon,
  EyeIcon,
  EyeSlashIcon,
  CircleStackIcon,
  SignalIcon,
} from '@heroicons/react/24/outline'

const tabs = [
  { id: 'info', name: 'Info', icon: UserIcon },
  { id: 'usage', name: 'Usage', icon: CircleStackIcon },
  { id: 'graph', name: 'Live Graph', icon: ChartBarIcon },
  { id: 'invoices', name: 'Invoices', icon: DocumentTextIcon },
  { id: 'logs', name: 'Logs', icon: ClockIcon },
]

export default function SubscriberEdit() {
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { hasPermission } = useAuthStore()
  const isNew = !id || id === 'new'
  const [showPassword, setShowPassword] = useState(false)

  // Get saved tab from localStorage or default to 'info'
  const getInitialTab = () => {
    if (isNew) return 'info'
    const saved = localStorage.getItem(`subscriber-tab-${id}`)
    const validTabs = ['info', 'usage', 'graph', 'invoices', 'logs']
    return validTabs.includes(saved) ? saved : 'info'
  }

  const [activeTab, setActiveTab] = useState(getInitialTab)

  // Save tab to localStorage when it changes
  const handleTabChange = (tabId) => {
    setActiveTab(tabId)
    if (!isNew) {
      localStorage.setItem(`subscriber-tab-${id}`, tabId)
    }
  }

  // Live bandwidth state
  const [currentBandwidth, setCurrentBandwidth] = useState({
    download: 0,
    upload: 0,
    uptime: '',
    ipAddress: '',
    cdnTraffic: [], // Array of { cdn_id, cdn_name, bytes, color }
    portRuleTraffic: [], // Array of { rule_id, rule_name, bytes, color }
  })
  const chartRef = useRef(null) // Reference to ECharts instance
  const downloadDataRef = useRef(Array(30).fill(0))
  const uploadDataRef = useRef(Array(30).fill(0))
  const cdnDataRefs = useRef({}) // { cdn_id: [30 data points] }
  const cdnPrevBytesRef = useRef({}) // { cdn_id: previous_bytes } - for calculating delta
  const [cdnList, setCdnList] = useState([]) // List of CDNs with their colors
  const portRuleDataRefs = useRef({}) // { rule_id: [30 data points] }
  const portRulePrevBytesRef = useRef({}) // { rule_id: previous_bytes }
  const [portRuleList, setPortRuleList] = useState([]) // List of port rules with their colors
  const [livePing, setLivePing] = useState({ ms: 0, ok: false }) // Live ping to subscriber
  const pingDataRef = useRef(Array(30).fill(null)) // RTT history (null = timeout)

  const [formData, setFormData] = useState({
    username: '',
    password: '',
    full_name: '',
    email: '',
    phone: '',
    address: '',
    region: '',
    building: '',
    nationality: '',
    country: '',
    service_id: '',
    nas_id: '',
    reseller_id: '',
    status: 1,
    auto_renew: false,
    mac_address: '',
    save_mac: true,
    static_ip: '',
    simultaneous_sessions: 1,
    expiry_date: '',
    note: '',
    price: '',
    override_price: false,
  })

  const { data: subscriberResponse, isLoading } = useQuery({
    queryKey: ['subscriber', id],
    queryFn: () => subscriberApi.get(id).then((r) => r.data),
    enabled: !isNew,
  })

  // Extract subscriber data, quota info, and sessions
  const subscriber = subscriberResponse?.data
  const subscriberPassword = subscriberResponse?.password || ''
  const dailyQuota = subscriberResponse?.daily_quota
  const monthlyQuota = subscriberResponse?.monthly_quota
  const sessions = subscriberResponse?.sessions || []

  // Debug logging
  console.log('subscriberResponse:', subscriberResponse)
  console.log('sessions:', sessions, 'length:', sessions?.length)

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

  // Bandwidth rules
  const { data: bandwidthRulesResponse, refetch: refetchBandwidthRules } = useQuery({
    queryKey: ['bandwidth-rules', id],
    queryFn: () => subscriberApi.getBandwidthRules(id).then((r) => r.data),
    enabled: !isNew && !!id,
  })
  const bandwidthRules = bandwidthRulesResponse?.data || []

  // CDN upgrades
  const { data: cdnUpgradesResponse } = useQuery({
    queryKey: ['cdn-upgrades', id],
    queryFn: () => subscriberApi.getCDNUpgrades(id).then((r) => r.data),
    enabled: !isNew && !!id,
  })
  const cdnUpgrades = cdnUpgradesResponse?.available_upgrades || []
  const currentCDNs = cdnUpgradesResponse?.current_cdns || []

  // All CDNs with their available speeds (for bandwidth rules)
  const { data: cdnSpeedsResponse } = useQuery({
    queryKey: ['cdn-speeds'],
    queryFn: () => cdnApi.getSpeeds().then((r) => r.data),
  })
  const cdnSpeedsData = cdnSpeedsResponse?.data || []

  // Filter CDNs by subscriber's NAS - only show CDNs that sync to this NAS
  const filteredCDNsForNAS = cdnSpeedsData.filter(cdn => {
    // If subscriber has no NAS selected, show all CDNs
    if (!formData.nas_id) return true
    // If CDN has no NAS restriction (empty nas_ids), it syncs to all NAS
    if (!cdn.nas_ids || cdn.nas_ids === '') return true
    // Check if subscriber's NAS ID is in the CDN's nas_ids list
    const nasIdsList = cdn.nas_ids.split(',').map(id => id.trim())
    return nasIdsList.includes(String(formData.nas_id))
  })

  // Get speeds for the selected CDN
  const getSpeedsForCDN = (cdnId) => {
    const cdn = cdnSpeedsData.find(c => c.cdn_id === parseInt(cdnId))
    return cdn?.speeds || []
  }

  // Bandwidth rule modal state
  const [showBandwidthRuleModal, setShowBandwidthRuleModal] = useState(false)
  const [editingBandwidthRule, setEditingBandwidthRule] = useState(null)
  const [bandwidthRuleForm, setBandwidthRuleForm] = useState({
    rule_type: 'internet',
    enabled: true,
    download_speed: '',
    upload_speed: '',
    duration: 'permanent',
    priority: 0,
    cdn_id: '',
    cdn_speed: '',
  })

  const resetBandwidthRuleForm = () => {
    setBandwidthRuleForm({
      rule_type: 'internet',
      enabled: true,
      download_speed: '',
      upload_speed: '',
      duration: 'permanent',
      priority: 0,
      cdn_id: '',
      cdn_speed: '',
    })
    setEditingBandwidthRule(null)
  }

  const openBandwidthRuleModal = (rule = null) => {
    if (rule) {
      setEditingBandwidthRule(rule)
      // For CDN rules, convert kbps back to Mbps for display
      const isCDN = rule.rule_type === 'cdn'
      setBandwidthRuleForm({
        rule_type: rule.rule_type || 'internet',
        enabled: rule.enabled ?? true,
        download_speed: isCDN ? Math.round((rule.download_speed || 0) / 1000) : (rule.download_speed || ''),
        upload_speed: isCDN ? Math.round((rule.upload_speed || 0) / 1000) : (rule.upload_speed || ''),
        duration: rule.duration || 'permanent',
        priority: rule.priority || 0,
        cdn_id: rule.cdn_id || '',
        cdn_speed: rule.cdn_speed || '',
      })
    } else {
      resetBandwidthRuleForm()
    }
    setShowBandwidthRuleModal(true)
  }

  // Handle CDN upgrade selection
  const handleCDNUpgradeSelect = (value) => {
    if (!value) {
      setBandwidthRuleForm({ ...bandwidthRuleForm, cdn_id: '', cdn_speed: '', download_speed: '', upload_speed: '' })
      return
    }
    const [cdnId, speed] = value.split('-')
    const speedKbps = parseInt(speed) * 1000 // Convert Mbps to kbps
    setBandwidthRuleForm({
      ...bandwidthRuleForm,
      cdn_id: cdnId,
      cdn_speed: speed,
      download_speed: speedKbps,
      upload_speed: speedKbps,
    })
  }

  // Helper function to format time remaining for bandwidth rules
  const formatTimeRemaining = (rule) => {
    if (!rule.expires_at) return 'Permanent'
    const expiresAt = new Date(rule.expires_at)
    const now = new Date()
    if (expiresAt <= now) return 'Expired'
    const diffMs = expiresAt - now
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))
    if (diffHours >= 24) {
      const days = Math.floor(diffHours / 24)
      const hours = diffHours % 24
      return `${days}d ${hours}h remaining`
    }
    return `${diffHours}h ${diffMins}m remaining`
  }

  useEffect(() => {
    if (subscriber) {
      setFormData({
        username: subscriber.username || '',
        password: subscriberPassword || '',
        full_name: subscriber.full_name || '',
        email: subscriber.email || '',
        phone: subscriber.phone || '',
        address: subscriber.address || '',
        region: subscriber.region || '',
        building: subscriber.building || '',
        nationality: subscriber.nationality || '',
        country: subscriber.country || '',
        service_id: subscriber.service_id || '',
        nas_id: subscriber.nas_id || '',
        reseller_id: subscriber.reseller_id || '',
        status: subscriber.status ?? 1,
        auto_renew: subscriber.auto_renew ?? false,
        mac_address: subscriber.mac_address || '',
        save_mac: subscriber.save_mac ?? false,
        static_ip: subscriber.static_ip || '',
        simultaneous_sessions: subscriber.simultaneous_sessions || 1,
        expiry_date: subscriber.expiry_date ? subscriber.expiry_date.split('T')[0] : '',
        note: subscriber.note || '',
        price: subscriber.price || '',
        override_price: subscriber.override_price || false,
      })

    }
  }, [subscriber, subscriberPassword, id, isNew])

  // Start/stop polling when graph tab is active
  useEffect(() => {
    // Only poll when on graph tab, subscriber is online, and not creating new
    if (activeTab !== 'graph' || !subscriber?.is_online || isNew) {
      return
    }

    let isMounted = true

    const fetchBandwidthData = async () => {
      try {
        const response = await subscriberApi.getBandwidth(id)

        if (response.data.success && isMounted) {
          const data = response.data.data
          const downloadValue = data.download || 0
          const uploadValue = data.upload || 0
          const cdnTraffic = data.cdn_traffic || []
          const cdnIsRate = data.cdn_is_rate || false // true = Torch (bytes/sec), false = connection tracking (cumulative)
          const portRuleTraffic = data.port_rule_traffic || []

          // Update CDN data arrays first to calculate total CDN rate
          const updatedCdnList = []
          let totalCdnMbps = 0

          cdnTraffic.forEach(cdn => {
            if (!cdnDataRefs.current[cdn.cdn_id]) {
              cdnDataRefs.current[cdn.cdn_id] = Array(30).fill(0)
            }

            const currentBytes = cdn.bytes || 0
            let cdnMbps = 0

            if (cdnIsRate) {
              cdnMbps = (currentBytes * 8 / 1000000) || 0
            } else {
              const prevBytes = cdnPrevBytesRef.current[cdn.cdn_id]
              if (prevBytes !== undefined && currentBytes >= prevBytes) {
                const deltaBytes = currentBytes - prevBytes
                cdnMbps = (deltaBytes * 8 / 1000000 / 2) || 0
              }
              cdnPrevBytesRef.current[cdn.cdn_id] = currentBytes
            }

            cdnDataRefs.current[cdn.cdn_id] = [...cdnDataRefs.current[cdn.cdn_id].slice(1), cdnMbps]
            totalCdnMbps += cdnMbps
            updatedCdnList.push({ id: cdn.cdn_id, name: cdn.cdn_name, color: cdn.color })
          })
          setCdnList(updatedCdnList)

          // Update Port Rule data arrays
          const updatedPortRuleList = []
          portRuleTraffic.forEach(pr => {
            if (!portRuleDataRefs.current[pr.rule_id]) {
              portRuleDataRefs.current[pr.rule_id] = Array(30).fill(0)
            }
            const currentBytes = pr.bytes || 0
            // Port rules always use Torch (bytes/sec rate)
            const prMbps = (currentBytes * 8 / 1000000) || 0
            portRuleDataRefs.current[pr.rule_id] = [...portRuleDataRefs.current[pr.rule_id].slice(1), prMbps]
            updatedPortRuleList.push({ id: pr.rule_id, name: pr.rule_name, color: pr.color })
          })
          setPortRuleList(updatedPortRuleList)

          // Subtract CDN traffic from download to show only regular internet
          const regularDownload = Math.max(0, downloadValue - totalCdnMbps)

          setCurrentBandwidth({
            download: regularDownload.toFixed(2),
            upload: uploadValue.toFixed(2),
            uptime: data.uptime || '',
            ipAddress: data.ip_address || '',
            cdnTraffic: cdnTraffic,
            portRuleTraffic: portRuleTraffic,
          })

          // Update live ping
          if (data.ping_ok) {
            setLivePing({ ms: data.ping_ms, ok: true })
            pingDataRef.current = [...pingDataRef.current.slice(1), data.ping_ms]
          } else {
            setLivePing(prev => ({ ...prev, ok: false }))
            pingDataRef.current = [...pingDataRef.current.slice(1), null] // null = gap in line
          }

          // Update data arrays
          downloadDataRef.current = [...downloadDataRef.current.slice(1), regularDownload]
          uploadDataRef.current = [...uploadDataRef.current.slice(1), uploadValue]

          // Directly update the chart instance for smooth animation
          if (chartRef.current) {
            const chartInstance = chartRef.current.getEchartsInstance()
            if (chartInstance) {
              const legendData = ['Download', 'Upload', 'Ping (ms)', ...updatedCdnList.map(c => c.name), ...updatedPortRuleList.map(pr => pr.name)]
              const seriesConfig = [
                { name: 'Download', data: downloadDataRef.current },
                { name: 'Upload', data: uploadDataRef.current },
                {
                  name: 'Ping (ms)',
                  type: 'line',
                  yAxisIndex: 1,
                  smooth: false,
                  data: pingDataRef.current,
                  lineStyle: { color: '#F59E0B', width: 1.5, type: 'dotted' },
                  itemStyle: { color: '#F59E0B' },
                  showSymbol: false,
                  connectNulls: false,
                  z: 10,
                },
                ...updatedCdnList.map(cdn => ({
                  name: cdn.name,
                  type: 'line',
                  smooth: true,
                  data: cdnDataRefs.current[cdn.id] || Array(30).fill(0),
                  lineStyle: { color: cdn.color, width: 2 },
                  itemStyle: { color: cdn.color },
                  areaStyle: {
                    color: {
                      type: 'linear',
                      x: 0, y: 0, x2: 0, y2: 1,
                      colorStops: [
                        { offset: 0, color: cdn.color + '66' },
                        { offset: 1, color: cdn.color + '0D' }
                      ]
                    }
                  },
                  showSymbol: false,
                })),
                ...updatedPortRuleList.map(pr => ({
                  name: pr.name,
                  type: 'line',
                  smooth: true,
                  data: portRuleDataRefs.current[pr.id] || Array(30).fill(0),
                  lineStyle: { color: pr.color, width: 2, type: 'dashed' },
                  itemStyle: { color: pr.color },
                  areaStyle: {
                    color: {
                      type: 'linear',
                      x: 0, y: 0, x2: 0, y2: 1,
                      colorStops: [
                        { offset: 0, color: pr.color + '55' },
                        { offset: 1, color: pr.color + '0D' }
                      ]
                    }
                  },
                  showSymbol: false,
                }))
              ]

              chartInstance.setOption({
                legend: { data: legendData },
                series: seriesConfig
              })
            }
          }
        }
      } catch (error) {
        console.error('Failed to fetch bandwidth:', error)
      }
    }

    // Initial fetch
    fetchBandwidthData()

    // Poll every 2 seconds
    const intervalId = setInterval(fetchBandwidthData, 2000)

    return () => {
      isMounted = false
      clearInterval(intervalId)
    }
  }, [activeTab, subscriber?.is_online, isNew, id])

  const saveMutation = useMutation({
    mutationFn: (data) =>
      isNew ? subscriberApi.create(data) : subscriberApi.update(id, data),
    onSuccess: () => {
      toast.success(isNew ? 'Subscriber created' : 'Subscriber updated')
      queryClient.invalidateQueries(['subscribers'])
      navigate('/subscribers')
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to save'),
  })

  // Bandwidth rule mutations
  const saveBandwidthRuleMutation = useMutation({
    mutationFn: (data) =>
      editingBandwidthRule
        ? subscriberApi.updateBandwidthRule(id, editingBandwidthRule.id, data)
        : subscriberApi.createBandwidthRule(id, data),
    onSuccess: () => {
      toast.success(editingBandwidthRule ? 'Rule updated' : 'Rule created')
      refetchBandwidthRules()
      setShowBandwidthRuleModal(false)
      resetBandwidthRuleForm()
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to save rule'),
  })

  const deleteBandwidthRuleMutation = useMutation({
    mutationFn: (ruleId) => subscriberApi.deleteBandwidthRule(id, ruleId),
    onSuccess: () => {
      toast.success('Rule deleted')
      refetchBandwidthRules()
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to delete rule'),
  })

  const handleSaveBandwidthRule = () => {
    // For CDN rules, convert Mbps to kbps (user enters 30, we send 30000)
    const isCDN = bandwidthRuleForm.rule_type === 'cdn'
    const downloadSpeed = parseInt(bandwidthRuleForm.download_speed) || 0
    const uploadSpeed = parseInt(bandwidthRuleForm.upload_speed) || 0

    const data = {
      ...bandwidthRuleForm,
      download_speed: isCDN ? downloadSpeed * 1000 : downloadSpeed,
      upload_speed: isCDN ? uploadSpeed * 1000 : uploadSpeed,
      priority: parseInt(bandwidthRuleForm.priority) || 0,
      cdn_id: bandwidthRuleForm.cdn_id ? parseInt(bandwidthRuleForm.cdn_id) : 0,
    }
    saveBandwidthRuleMutation.mutate(data)
  }

  const handleDeleteBandwidthRule = (ruleId) => {
    if (confirm('Are you sure you want to delete this rule?')) {
      deleteBandwidthRuleMutation.mutate(ruleId)
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    const data = { ...formData }
    if (!data.password) delete data.password
    if (data.override_price && data.price !== '') {
      data.price = parseFloat(data.price)
    } else {
      data.price = 0
      data.override_price = false
    }
    if (data.service_id) data.service_id = parseInt(data.service_id)
    if (data.nas_id) data.nas_id = parseInt(data.nas_id)
    else delete data.nas_id
    if (data.reseller_id) data.reseller_id = parseInt(data.reseller_id)
    else delete data.reseller_id
    data.status = parseInt(data.status)
    data.simultaneous_sessions = parseInt(data.simultaneous_sessions) || 1
    saveMutation.mutate(data)
  }

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }))
  }

  // Generate time labels (30s ago to now)
  const timeLabels = Array.from({ length: 30 }, (_, i) => `${30 - i}s`)

  const bandwidthChartOption = {
    animation: true,
    animationDuration: 300,
    animationEasing: 'linear',
    tooltip: {
      trigger: 'axis',
      formatter: (params) => {
        let result = params[0].name + '<br/>'
        params.forEach((param) => {
          if (param.value === null || param.value === undefined) return
          const isPing = param.seriesName === 'Ping (ms)'
          const val = typeof param.value === 'number' ? param.value.toFixed(isPing ? 1 : 2) : '—'
          const unit = isPing ? 'ms' : 'Mbps'
          result += `${param.marker} ${param.seriesName}: ${val} ${unit}<br/>`
        })
        return result
      },
    },
    legend: {
      data: ['Download', 'Upload', 'Ping (ms)'],
      top: 0,
    },
    grid: {
      left: '3%',
      right: '8%',
      bottom: '3%',
      top: '40px',
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: timeLabels,
      axisLine: { lineStyle: { color: '#ccc' } },
    },
    yAxis: [
      {
        type: 'value',
        min: 0,
        max: (value) => {
          const maxVal = Math.max(value.max, 0.1)
          return Math.max(3, Math.ceil(maxVal * 1.2))
        },
        axisLabel: { formatter: '{value} Mbps' },
        axisLine: { lineStyle: { color: '#ccc' } },
        splitLine: { lineStyle: { color: '#eee' } },
      },
      {
        type: 'value',
        name: 'ms',
        min: 0,
        max: (value) => Math.max(100, Math.ceil(value.max * 1.3)),
        position: 'right',
        axisLabel: { formatter: '{value} ms', color: '#F59E0B' },
        axisLine: { lineStyle: { color: '#F59E0B33' } },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: 'Download',
        type: 'line',
        yAxisIndex: 0,
        smooth: true,
        data: downloadDataRef.current,
        lineStyle: { color: '#10B981', width: 2 },
        itemStyle: { color: '#10B981' },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(16, 185, 129, 0.4)' },
              { offset: 1, color: 'rgba(16, 185, 129, 0.05)' }
            ]
          }
        },
        showSymbol: false,
      },
      {
        name: 'Upload',
        type: 'line',
        yAxisIndex: 0,
        smooth: true,
        data: uploadDataRef.current,
        lineStyle: { color: '#3B82F6', width: 2 },
        itemStyle: { color: '#3B82F6' },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(59, 130, 246, 0.4)' },
              { offset: 1, color: 'rgba(59, 130, 246, 0.05)' }
            ]
          }
        },
        showSymbol: false,
      },
      {
        name: 'Ping (ms)',
        type: 'line',
        yAxisIndex: 1,
        smooth: false,
        data: pingDataRef.current,
        lineStyle: { color: '#F59E0B', width: 1.5, type: 'dotted' },
        itemStyle: { color: '#F59E0B' },
        showSymbol: false,
        connectNulls: false,
        z: 10,
      },
    ],
  }

  if (!isNew && isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {isNew ? 'Add Subscriber' : `Edit: ${subscriber?.username}`}
          </h1>
          <p className="text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">
            {isNew ? 'Create a new PPPoE subscriber' : 'Manage subscriber details'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {!isNew && subscriber?.is_online && (
            <span className="badge badge-success">Online</span>
          )}
          {!isNew && !subscriber?.is_online && (
            <span className="badge badge-gray">Offline</span>
          )}
          {!isNew && subscriber?.fup_level > 0 && (
            <span className="px-2.5 py-1 text-xs font-bold bg-red-500 text-white rounded-full animate-pulse">
              FUP {subscriber.fup_level === 1 ? '(Daily)' : '(Monthly)'}
            </span>
          )}
        </div>
      </div>

      {/* Tabs */}
      {!isNew && (
        <div className="border-b border-gray-200 dark:border-gray-700">
          <nav className="-mb-px flex space-x-8">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={clsx(
                  'flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm',
                  activeTab === tab.id
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 hover:border-gray-300'
                )}
              >
                <tab.icon className="w-5 h-5" />
                {tab.name}
              </button>
            ))}
          </nav>
        </div>
      )}

      {/* Info Tab */}
      {(isNew || activeTab === 'info') && (
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Account Info */}
            <div className="card p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Account Information</h3>
              <div className="space-y-4">
                <div>
                  <label className="label">Username (PPPoE) {!isNew && <span className="text-xs text-gray-400 ml-1">(locked)</span>}</label>
                  <input
                    type="text"
                    name="username"
                    value={formData.username}
                    onChange={handleChange}
                    className={`input ${!isNew ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                    required
                    autoComplete="off"
                    disabled={!isNew}
                  />
                </div>
                <div>
                  <label className="label">Password</label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        name="password"
                        value={formData.password}
                        onChange={handleChange}
                        className="input pr-10"
                        placeholder={isNew ? '' : 'Leave blank to keep current'}
                        required={isNew}
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400"
                      >
                        {showPassword ? (
                          <EyeSlashIcon className="h-5 w-5" />
                        ) : (
                          <EyeIcon className="h-5 w-5" />
                        )}
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
                        const length = 8 + Math.floor(Math.random() * 3)
                        let password = ''
                        for (let i = 0; i < length; i++) {
                          password += chars.charAt(Math.floor(Math.random() * chars.length))
                        }
                        setFormData(prev => ({ ...prev, password }))
                        setShowPassword(true)
                      }}
                      className="btn btn-secondary whitespace-nowrap"
                    >
                      Generate
                    </button>
                  </div>
                </div>
                {(isNew || hasPermission('subscribers.change_service')) ? (
                  <div>
                    <label className="label">Service Plan</label>
                    <select
                      name="service_id"
                      value={formData.service_id}
                      onChange={handleChange}
                      className="input"
                      required
                    >
                      <option value="">Select Service</option>
                      {services?.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} - ${s.price}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div>
                    <label className="label">Service Plan</label>
                    <input
                      type="text"
                      value={services?.find(s => s.id === parseInt(formData.service_id))?.name || 'N/A'}
                      className="input bg-gray-100 dark:bg-gray-700"
                      disabled
                    />
                  </div>
                )}
                {/* Override Price */}
                <div>
                  <label className="label">Price</label>
                  <div className="flex items-center gap-3 mb-2">
                    <input
                      type="checkbox"
                      id="override_price"
                      name="override_price"
                      checked={formData.override_price}
                      onChange={handleChange}
                      className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                    <label htmlFor="override_price" className="text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                      Override service price for this subscriber
                    </label>
                  </div>
                  {formData.override_price ? (
                    <input
                      type="number"
                      name="price"
                      value={formData.price}
                      onChange={handleChange}
                      placeholder="Enter custom price"
                      step="0.01"
                      min="0"
                      className="input"
                    />
                  ) : (
                    <div className="text-sm text-gray-500 dark:text-gray-400 px-3 py-2 bg-gray-50 dark:bg-gray-700 rounded border border-gray-200 dark:border-gray-600">
                      Using service default: ${services?.find(s => s.id == formData.service_id)?.price ?? '—'}
                    </div>
                  )}
                </div>
                <div>
                  <label className="label">NAS</label>
                  <select
                    name="nas_id"
                    value={formData.nas_id}
                    onChange={handleChange}
                    className="input"
                  >
                    <option value="">Select NAS</option>
                    {nasList?.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.name} ({n.ip_address})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Reseller</label>
                  <select
                    name="reseller_id"
                    value={formData.reseller_id}
                    onChange={handleChange}
                    className="input"
                  >
                    <option value="">No Reseller (Admin)</option>
                    {resellers?.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name || r.username} (Balance: ${r.balance})
                      </option>
                    ))}
                  </select>
                </div>
                {!isNew && subscriber?.created_at && (
                  <div>
                    <label className="label">Created At</label>
                    <div className="input bg-gray-50 dark:bg-gray-700 cursor-default text-gray-700 dark:text-gray-200 font-medium">
                      {formatDateTime(subscriber.created_at)}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Personal Info */}
            <div className="card p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Personal Information</h3>
              <div className="space-y-4">
                <div>
                  <label className="label">Full Name</label>
                  <input
                    type="text"
                    name="full_name"
                    value={formData.full_name}
                    onChange={handleChange}
                    className="input"
                  />
                </div>
                <div>
                  <label className="label">Email</label>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    className="input"
                  />
                </div>
                <div>
                  <label className="label">Phone</label>
                  <input
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    className="input"
                  />
                </div>
                <div>
                  <label className="label">Address</label>
                  <textarea
                    name="address"
                    value={formData.address}
                    onChange={handleChange}
                    className="input"
                    rows={3}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label">Region</label>
                    <input
                      type="text"
                      name="region"
                      value={formData.region}
                      onChange={handleChange}
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="label">Building</label>
                    <input
                      type="text"
                      name="building"
                      value={formData.building}
                      onChange={handleChange}
                      className="input"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label">Nationality</label>
                    <select
                      name="nationality"
                      value={formData.nationality}
                      onChange={handleChange}
                      className="input"
                    >
                      <option value="">Select Nationality</option>
                      <option value="Afghan">Afghan</option>
                      <option value="Albanian">Albanian</option>
                      <option value="Algerian">Algerian</option>
                      <option value="Argentine">Argentine</option>
                      <option value="Australian">Australian</option>
                      <option value="Austrian">Austrian</option>
                      <option value="Bahraini">Bahraini</option>
                      <option value="Bangladeshi">Bangladeshi</option>
                      <option value="Belgian">Belgian</option>
                      <option value="Brazilian">Brazilian</option>
                      <option value="Canadian">Canadian</option>
                      <option value="Chinese">Chinese</option>
                      <option value="Colombian">Colombian</option>
                      <option value="Czech">Czech</option>
                      <option value="Danish">Danish</option>
                      <option value="Egyptian">Egyptian</option>
                      <option value="Finnish">Finnish</option>
                      <option value="French">French</option>
                      <option value="German">German</option>
                      <option value="Greek">Greek</option>
                      <option value="Hong Konger">Hong Konger</option>
                      <option value="Hungarian">Hungarian</option>
                      <option value="Indian">Indian</option>
                      <option value="Indonesian">Indonesian</option>
                      <option value="Iranian">Iranian</option>
                      <option value="Iraqi">Iraqi</option>
                      <option value="Irish">Irish</option>
                      <option value="Israeli">Israeli</option>
                      <option value="Italian">Italian</option>
                      <option value="Japanese">Japanese</option>
                      <option value="Jordanian">Jordanian</option>
                      <option value="Kuwaiti">Kuwaiti</option>
                      <option value="Lebanese">Lebanese</option>
                      <option value="Libyan">Libyan</option>
                      <option value="Malaysian">Malaysian</option>
                      <option value="Mexican">Mexican</option>
                      <option value="Moroccan">Moroccan</option>
                      <option value="Dutch">Dutch</option>
                      <option value="New Zealander">New Zealander</option>
                      <option value="Nigerian">Nigerian</option>
                      <option value="Norwegian">Norwegian</option>
                      <option value="Omani">Omani</option>
                      <option value="Pakistani">Pakistani</option>
                      <option value="Palestinian">Palestinian</option>
                      <option value="Filipino">Filipino</option>
                      <option value="Polish">Polish</option>
                      <option value="Portuguese">Portuguese</option>
                      <option value="Qatari">Qatari</option>
                      <option value="Romanian">Romanian</option>
                      <option value="Russian">Russian</option>
                      <option value="Saudi">Saudi</option>
                      <option value="Singaporean">Singaporean</option>
                      <option value="South African">South African</option>
                      <option value="South Korean">South Korean</option>
                      <option value="Spanish">Spanish</option>
                      <option value="Sudanese">Sudanese</option>
                      <option value="Swedish">Swedish</option>
                      <option value="Swiss">Swiss</option>
                      <option value="Syrian">Syrian</option>
                      <option value="Taiwanese">Taiwanese</option>
                      <option value="Thai">Thai</option>
                      <option value="Tunisian">Tunisian</option>
                      <option value="Turkish">Turkish</option>
                      <option value="Ukrainian">Ukrainian</option>
                      <option value="Emirati">Emirati</option>
                      <option value="British">British</option>
                      <option value="American">American</option>
                      <option value="Vietnamese">Vietnamese</option>
                      <option value="Yemeni">Yemeni</option>
                    </select>
                  </div>
                  <div>
                    <label className="label">Country</label>
                    <select
                      name="country"
                      value={formData.country}
                      onChange={handleChange}
                      className="input"
                    >
                      <option value="">Select Country</option>
                      <option value="Afghanistan">Afghanistan</option>
                      <option value="Albania">Albania</option>
                      <option value="Algeria">Algeria</option>
                      <option value="Argentina">Argentina</option>
                      <option value="Australia">Australia</option>
                      <option value="Austria">Austria</option>
                      <option value="Bahrain">Bahrain</option>
                      <option value="Bangladesh">Bangladesh</option>
                      <option value="Belgium">Belgium</option>
                      <option value="Brazil">Brazil</option>
                      <option value="Canada">Canada</option>
                      <option value="China">China</option>
                      <option value="Colombia">Colombia</option>
                      <option value="Czech Republic">Czech Republic</option>
                      <option value="Denmark">Denmark</option>
                      <option value="Egypt">Egypt</option>
                      <option value="Finland">Finland</option>
                      <option value="France">France</option>
                      <option value="Germany">Germany</option>
                      <option value="Greece">Greece</option>
                      <option value="Hong Kong">Hong Kong</option>
                      <option value="Hungary">Hungary</option>
                      <option value="India">India</option>
                      <option value="Indonesia">Indonesia</option>
                      <option value="Iran">Iran</option>
                      <option value="Iraq">Iraq</option>
                      <option value="Ireland">Ireland</option>
                      <option value="Israel">Israel</option>
                      <option value="Italy">Italy</option>
                      <option value="Japan">Japan</option>
                      <option value="Jordan">Jordan</option>
                      <option value="Kuwait">Kuwait</option>
                      <option value="Lebanon">Lebanon</option>
                      <option value="Libya">Libya</option>
                      <option value="Malaysia">Malaysia</option>
                      <option value="Mexico">Mexico</option>
                      <option value="Morocco">Morocco</option>
                      <option value="Netherlands">Netherlands</option>
                      <option value="New Zealand">New Zealand</option>
                      <option value="Nigeria">Nigeria</option>
                      <option value="Norway">Norway</option>
                      <option value="Oman">Oman</option>
                      <option value="Pakistan">Pakistan</option>
                      <option value="Palestine">Palestine</option>
                      <option value="Philippines">Philippines</option>
                      <option value="Poland">Poland</option>
                      <option value="Portugal">Portugal</option>
                      <option value="Qatar">Qatar</option>
                      <option value="Romania">Romania</option>
                      <option value="Russia">Russia</option>
                      <option value="Saudi Arabia">Saudi Arabia</option>
                      <option value="Singapore">Singapore</option>
                      <option value="South Africa">South Africa</option>
                      <option value="South Korea">South Korea</option>
                      <option value="Spain">Spain</option>
                      <option value="Sudan">Sudan</option>
                      <option value="Sweden">Sweden</option>
                      <option value="Switzerland">Switzerland</option>
                      <option value="Syria">Syria</option>
                      <option value="Taiwan">Taiwan</option>
                      <option value="Thailand">Thailand</option>
                      <option value="Tunisia">Tunisia</option>
                      <option value="Turkey">Turkey</option>
                      <option value="Ukraine">Ukraine</option>
                      <option value="United Arab Emirates">United Arab Emirates</option>
                      <option value="United Kingdom">United Kingdom</option>
                      <option value="United States">United States</option>
                      <option value="Vietnam">Vietnam</option>
                      <option value="Yemen">Yemen</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* Connection Settings */}
            <div className="card p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Connection Settings</h3>
              <div className="space-y-4">
                <div>
                  <label className="label">MAC Address {!isNew && <span className="text-xs text-gray-400 ml-1">(locked)</span>}</label>
                  <input
                    type="text"
                    name="mac_address"
                    value={formData.mac_address}
                    onChange={(e) => {
                      const val = e.target.value.toUpperCase()
                      if (val === '' || /^[0-9A-F:-]*$/.test(val)) {
                        setFormData(prev => ({ ...prev, mac_address: val }))
                      }
                    }}
                    className={`input ${!isNew ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                    placeholder="Leave empty - auto-saves on first connect"
                    disabled={!isNew}
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500 mt-1">Leave empty to auto-capture MAC on first connection</p>
                </div>
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    name="save_mac"
                    checked={formData.save_mac}
                    onChange={handleChange}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <div>
                    <span className="font-medium">Save MAC</span>
                    <p className="text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">Lock to current MAC address (reject other devices)</p>
                  </div>
                </label>
                <div>
                  <label className="label">Static IP</label>
                  <input
                    type="text"
                    name="static_ip"
                    value={formData.static_ip}
                    onChange={handleChange}
                    className="input"
                    placeholder="Leave blank for dynamic"
                  />
                </div>
                <div>
                  <label className="label">Simultaneous Sessions</label>
                  <input
                    type="number"
                    name="simultaneous_sessions"
                    value={formData.simultaneous_sessions}
                    onChange={handleChange}
                    className="input"
                    min={1}
                    max={10}
                  />
                </div>
                <div>
                  <label className="label">Expiry Date</label>
                  <input
                    type="date"
                    name="expiry_date"
                    value={formData.expiry_date}
                    onChange={handleChange}
                    className="input"
                  />
                </div>
              </div>
            </div>

            {/* Bandwidth Rules - Only show for existing subscribers with permission */}
            {!isNew && hasPermission('subscribers.bandwidth_rules') && (
              <div className="card p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Bandwidth Rules</h3>
                  <button
                    type="button"
                    onClick={() => openBandwidthRuleModal()}
                    className="btn btn-primary btn-sm"
                  >
                    Add Rule
                  </button>
                </div>
                <p className="text-sm text-gray-500 mb-4">
                  Custom speed overrides for this subscriber. Set duration for temporary speed changes.
                </p>

                {bandwidthRules.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">No bandwidth rules configured</p>
                ) : (
                  <div className="space-y-3">
                    {bandwidthRules.map((rule) => {
                      const timeRemaining = formatTimeRemaining(rule)
                      const isExpired = timeRemaining === 'Expired'
                      return (
                        <div
                          key={rule.id}
                          className={clsx(
                            'border rounded-lg p-4',
                            !rule.enabled || isExpired ? 'border-gray-100 bg-gray-50 opacity-60' : 'border-gray-200 bg-white'
                          )}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <span className={clsx(
                                'px-2 py-1 text-xs font-medium rounded',
                                rule.rule_type === 'internet'
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-purple-100 dark:bg-purple-900/50 text-purple-800 dark:text-purple-300'
                              )}>
                                {rule.rule_type === 'internet' ? 'Internet' : (rule.cdn_name || 'CDN')}
                              </span>
                              <div>
                                <p className="font-medium">
                                  {rule.rule_type === 'cdn' ? `${Math.round(rule.download_speed / 1000)}M` : `${rule.download_speed}k / ${rule.upload_speed}k`}
                                </p>
                                <p className={clsx(
                                  'text-sm',
                                  isExpired ? 'text-red-500' : 'text-gray-500'
                                )}>
                                  {timeRemaining}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => openBandwidthRuleModal(rule)}
                                className="text-primary-600 hover:text-primary-800 text-sm"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteBandwidthRule(rule.id)}
                                className="text-red-600 hover:text-red-800 text-sm"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Status & Options */}
            <div className="card p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Status & Options</h3>
              <div className="space-y-4">
                <div>
                  <label className="label">Status</label>
                  <select
                    name="status"
                    value={formData.status}
                    onChange={handleChange}
                    className="input"
                  >
                    <option value={1}>Active</option>
                    <option value={0}>Inactive</option>
                    <option value={2}>Suspended</option>
                  </select>
                </div>
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    name="auto_renew"
                    checked={formData.auto_renew}
                    onChange={handleChange}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span>Auto Renew</span>
                </label>
                <div>
                  <label className="label">Notes</label>
                  <textarea
                    name="note"
                    value={formData.note}
                    onChange={handleChange}
                    className="input"
                    rows={4}
                    placeholder="Internal notes about this subscriber..."
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-4">
            <Link to="/subscribers" className="btn-secondary">
              Cancel
            </Link>
            {hasPermission(isNew ? 'subscribers.create' : 'subscribers.edit') && (
              <button
                type="submit"
                disabled={saveMutation.isLoading}
                className="btn-primary"
              >
                {saveMutation.isLoading ? 'Saving...' : isNew ? 'Create Subscriber' : 'Save Changes'}
              </button>
            )}
          </div>
        </form>
      )}

      {/* Usage Tab */}
      {!isNew && activeTab === 'usage' && (
        <div className="space-y-6">
          {/* Monthly Summary */}
          <div className="card p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">Monthly</h3>
            <div className="flex items-end gap-8 h-48">
              {/* Download Bar */}
              <div className="flex flex-col items-center flex-1">
                <div className="w-full max-w-[120px] bg-gray-100 rounded-t relative h-40 flex items-end">
                  <div
                    className="w-full rounded-t transition-all duration-500"
                    style={{
                      height: (() => {
                        const used = monthlyQuota?.download_used || 0
                        const limit = monthlyQuota?.download_limit || 0
                        if (limit > 0) {
                          return `${Math.min(used / limit * 100, 100)}%`
                        }
                        // For unlimited: scale based on 100GB reference
                        if (used > 0) {
                          return `${Math.min(used / 107374182400 * 100, 100)}%`
                        }
                        return '0%'
                      })(),
                      backgroundColor: '#14B8A6',
                      minHeight: (monthlyQuota?.download_used || 0) > 0 ? '8px' : '0'
                    }}
                  />
                </div>
                <div className="mt-3 text-center">
                  <div className="text-2xl font-bold text-teal-500">
                    {((monthlyQuota?.download_used || 0) / 1073741824).toFixed(2)} GB
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">
                    {monthlyQuota?.download_limit > 0 ? `/ ${(monthlyQuota.download_limit / 1073741824).toFixed(0)} GB` : 'Unlimited'}
                  </div>
                  <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">Download</div>
                </div>
              </div>

              {/* Upload Bar */}
              <div className="flex flex-col items-center flex-1">
                <div className="w-full max-w-[120px] bg-gray-100 rounded-t relative h-40 flex items-end">
                  <div
                    className="w-full rounded-t transition-all duration-500"
                    style={{
                      height: (() => {
                        const used = monthlyQuota?.upload_used || 0
                        const limit = monthlyQuota?.upload_limit || 0
                        if (limit > 0) {
                          return `${Math.min(used / limit * 100, 100)}%`
                        }
                        // For unlimited: scale based on 100GB reference
                        if (used > 0) {
                          return `${Math.min(used / 107374182400 * 100, 100)}%`
                        }
                        return '0%'
                      })(),
                      backgroundColor: '#F97316',
                      minHeight: (monthlyQuota?.upload_used || 0) > 0 ? '8px' : '0'
                    }}
                  />
                </div>
                <div className="mt-3 text-center">
                  <div className="text-2xl font-bold text-orange-500">
                    {((monthlyQuota?.upload_used || 0) / 1073741824).toFixed(2)} GB
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">
                    {monthlyQuota?.upload_limit > 0 ? `/ ${(monthlyQuota.upload_limit / 1073741824).toFixed(0)} GB` : 'Unlimited'}
                  </div>
                  <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">Upload</div>
                </div>
              </div>
            </div>
          </div>

          {/* Daily Usage Chart */}
          <div className="card p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Daily</h3>
            <ReactECharts
              option={{
                tooltip: {
                  trigger: 'axis',
                  axisPointer: { type: 'shadow' },
                  formatter: (params) => {
                    let result = `Day ${params[0].name}<br/>`
                    params.forEach((param) => {
                      const val = (param.value / 1073741824).toFixed(2)
                      result += `${param.marker} ${param.seriesName}: ${val} GB<br/>`
                    })
                    return result
                  }
                },
                legend: {
                  data: ['Download', 'Upload'],
                  top: 0,
                },
                grid: {
                  left: '3%',
                  right: '4%',
                  bottom: '3%',
                  top: '40px',
                  containLabel: true,
                },
                xAxis: {
                  type: 'category',
                  data: Array.from({ length: dailyQuota?.daily_download?.length || new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate() }, (_, i) => i + 1),
                  axisLine: { lineStyle: { color: '#ccc' } },
                  axisLabel: { color: '#666' },
                },
                yAxis: {
                  type: 'value',
                  axisLabel: {
                    formatter: (val) => (val / 1073741824).toFixed(1) + ' GB',
                    color: '#666',
                  },
                  axisLine: { lineStyle: { color: '#ccc' } },
                  splitLine: { lineStyle: { color: '#eee' } },
                },
                series: [
                  {
                    name: 'Download',
                    type: 'bar',
                    data: dailyQuota?.daily_download || [],
                    itemStyle: { color: '#14B8A6' },
                    barWidth: '35%',
                  },
                  {
                    name: 'Upload',
                    type: 'bar',
                    data: dailyQuota?.daily_upload || [],
                    itemStyle: { color: '#F97316' },
                    barWidth: '35%',
                  },
                ],
              }}
              style={{ height: '300px' }}
            />
          </div>

          {/* Daily Quota Summary */}
          <div className="card p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Today's Usage</h3>
            <div className="grid grid-cols-2 gap-6">
              <div className="text-center p-4 bg-teal-50 rounded-lg">
                <div className="text-3xl font-bold text-teal-600">
                  {((dailyQuota?.download_used || 0) / 1073741824).toFixed(2)} GB
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500 mt-1">
                  Download {dailyQuota?.download_limit > 0 && `/ ${(dailyQuota.download_limit / 1073741824).toFixed(0)} GB`}
                </div>
              </div>
              <div className="text-center p-4 bg-orange-50 rounded-lg">
                <div className="text-3xl font-bold text-orange-600">
                  {((dailyQuota?.upload_used || 0) / 1073741824).toFixed(2)} GB
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500 mt-1">
                  Upload {dailyQuota?.upload_limit > 0 && `/ ${(dailyQuota.upload_limit / 1073741824).toFixed(0)} GB`}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Live Graph Tab */}
      {!isNew && activeTab === 'graph' && (
        <div className="space-y-6">
          {/* Current Stats */}
          {subscriber?.is_online && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                <div className="card p-4 text-center">
                  <div className="text-3xl font-bold text-green-500">{currentBandwidth.download}</div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">Download (Mbps)</div>
                </div>
                <div className="card p-4 text-center">
                  <div className="text-3xl font-bold text-blue-500">{currentBandwidth.upload}</div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">Upload (Mbps)</div>
                </div>
                <div className="card p-4 text-center" style={{ borderTop: '3px solid #F59E0B' }}>
                  <div className={`text-3xl font-bold ${
                    !livePing.ok             ? 'text-gray-400 dark:text-gray-500' :
                    livePing.ms < 20         ? 'text-green-500' :
                    livePing.ms < 80         ? 'text-yellow-500' :
                                               'text-red-500'
                  }`}>
                    {livePing.ok ? `${livePing.ms.toFixed(1)}` : '—'}
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">Latency (ms)</div>
                </div>
                <div className="card p-4 text-center">
                  <div className="text-xl font-semibold text-gray-700 dark:text-gray-300">{currentBandwidth.ipAddress || '-'}</div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">IP Address</div>
                </div>
                <div className="card p-4 text-center">
                  <div className="text-xl font-semibold text-gray-700 dark:text-gray-300">{currentBandwidth.uptime || '-'}</div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">Uptime</div>
                </div>
              </div>

              {/* CDN Traffic Stats - Show live rate in Mbps */}
              {cdnList.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                  {cdnList.map(cdn => {
                    const cdnRateData = cdnDataRefs.current[cdn.id] || []
                    const currentRate = cdnRateData.length > 0 ? cdnRateData[cdnRateData.length - 1] : 0
                    return (
                      <div key={cdn.id} className="card p-3 text-center" style={{ borderTop: `3px solid ${cdn.color}` }}>
                        <div className="text-xl font-bold" style={{ color: cdn.color }}>{currentRate.toFixed(2)} Mbps</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">{cdn.name}</div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Port Rule Traffic Stats - Show live rate in Mbps */}
              {portRuleList.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                  {portRuleList.map(pr => {
                    const prRateData = portRuleDataRefs.current[pr.id] || []
                    const currentRate = prRateData.length > 0 ? prRateData[prRateData.length - 1] : 0
                    return (
                      <div key={pr.id} className="card p-3 text-center" style={{ borderTop: `3px dashed ${pr.color}` }}>
                        <div className="text-xl font-bold" style={{ color: pr.color }}>{currentRate.toFixed(2)} Mbps</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">Port: {pr.name}</div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Chart */}
          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Live Bandwidth Graph</h3>
              {subscriber?.is_online && (
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 text-sm text-green-600">
                    <span className="relative flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                    </span>
                    Live (updating every 2s)
                  </div>
                  {livePing.ok ? (
                    <div className={`flex items-center gap-1 text-xs font-mono px-2 py-0.5 rounded-full ${
                      livePing.ms < 20  ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400' :
                      livePing.ms < 80  ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400' :
                                          'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400'
                    }`}>
                      <SignalIcon className="h-3.5 w-3.5" />
                      {livePing.ms.toFixed(1)} ms
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 text-xs font-mono px-2 py-0.5 rounded-full bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500">
                      <SignalIcon className="h-3.5 w-3.5" />
                      — ms
                    </div>
                  )}
                </div>
              )}
            </div>
            {subscriber?.is_online ? (
              <ReactECharts
                ref={chartRef}
                option={bandwidthChartOption}
                notMerge={false}
                lazyUpdate={true}
                style={{ height: '400px' }}
              />
            ) : (
              <div className="flex items-center justify-center h-64 text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">
                Subscriber is offline. Live graph is only available when connected.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Invoices Tab */}
      {!isNew && activeTab === 'invoices' && (
        <div className="card p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Invoices & Payments</h3>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Invoice #</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                <tr>
                  <td colSpan={5} className="text-center text-gray-500 py-8">
                    No invoices found
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Logs Tab */}
      {!isNew && activeTab === 'logs' && (
        <div className="card p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Session & Activity Logs</h3>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Session ID</th>
                  <th>Start Time</th>
                  <th>End Time</th>
                  <th>Duration</th>
                  <th>IP Address</th>
                  <th>MAC Address</th>
                  <th>Download</th>
                  <th>Upload</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {sessions.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center text-gray-500 py-8">
                      No session logs found
                    </td>
                  </tr>
                ) : (
                  sessions.map((session, idx) => {
                    const startTime = session.acctstarttime ? new Date(session.acctstarttime) : null
                    const endTime = session.acctstoptime ? new Date(session.acctstoptime) : null
                    const isActive = !session.acctstoptime

                    // Calculate duration
                    let duration = '-'
                    if (session.acctsessiontime > 0) {
                      const hours = Math.floor(session.acctsessiontime / 3600)
                      const mins = Math.floor((session.acctsessiontime % 3600) / 60)
                      duration = `${hours}h ${mins}m`
                    } else if (startTime && !endTime) {
                      const now = new Date()
                      const diffMs = now - startTime
                      const hours = Math.floor(diffMs / 3600000)
                      const mins = Math.floor((diffMs % 3600000) / 60000)
                      duration = `${hours}h ${mins}m`
                    }

                    // Format bytes
                    const formatBytes = (bytes) => {
                      if (!bytes || bytes === 0) return '0 B'
                      const units = ['B', 'KB', 'MB', 'GB']
                      const i = Math.floor(Math.log(bytes) / Math.log(1024))
                      return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`
                    }

                    return (
                      <tr key={session.acctsessionid || idx} className={isActive ? 'bg-green-50' : ''}>
                        <td className="font-mono text-sm">
                          {session.acctsessionid}
                          {isActive && (
                            <span className="ml-2 px-2 py-0.5 text-xs bg-green-100 text-green-800 rounded-full">
                              Active
                            </span>
                          )}
                        </td>
                        <td className="text-sm">
                          {formatDateTime(session.acctstarttime)}
                        </td>
                        <td className="text-sm">
                          {formatDateTime(session.acctstoptime)}
                        </td>
                        <td className="text-sm">{duration}</td>
                        <td className="font-mono text-sm">{session.framedipaddress || '-'}</td>
                        <td className="font-mono text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">{session.callingstationid || '-'}</td>
                        <td className="text-sm text-green-600">{formatBytes(session.acctoutputoctets)}</td>
                        <td className="text-sm text-blue-600">{formatBytes(session.acctinputoctets)}</td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Bandwidth Rule Modal */}
      {showBandwidthRuleModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold mb-4">
              {editingBandwidthRule ? 'Edit Bandwidth Rule' : 'Add Bandwidth Rule'}
            </h3>

            <div className="space-y-4">
              <div>
                <label className="label">Rule Type</label>
                <select
                  value={bandwidthRuleForm.rule_type}
                  onChange={(e) => setBandwidthRuleForm({ ...bandwidthRuleForm, rule_type: e.target.value })}
                  className="input"
                >
                  <option value="internet">Internet Speed</option>
                  <option value="cdn">CDN Speed</option>
                </select>
              </div>

              {bandwidthRuleForm.rule_type === 'cdn' ? (
                <div className="space-y-4">
                  <div>
                    <label className="label">Select CDN</label>
                    {filteredCDNsForNAS.length > 0 ? (
                      <select
                        value={bandwidthRuleForm.cdn_id || ''}
                        onChange={(e) => setBandwidthRuleForm({ ...bandwidthRuleForm, cdn_id: e.target.value, download_speed: '', upload_speed: '' })}
                        className="input"
                      >
                        <option value="">Select CDN...</option>
                        {filteredCDNsForNAS.map((cdn) => (
                          <option key={cdn.cdn_id} value={cdn.cdn_id}>
                            {cdn.cdn_name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <p className="text-sm text-gray-500 italic">No CDNs available for this NAS</p>
                    )}
                  </div>
                  {bandwidthRuleForm.cdn_id && (
                    <div>
                      <label className="label">Select Speed</label>
                      {getSpeedsForCDN(bandwidthRuleForm.cdn_id).length > 0 ? (
                        <select
                          value={bandwidthRuleForm.download_speed || ''}
                          onChange={(e) => setBandwidthRuleForm({ ...bandwidthRuleForm, download_speed: e.target.value, upload_speed: e.target.value })}
                          className="input"
                        >
                          <option value="">Select speed...</option>
                          {getSpeedsForCDN(bandwidthRuleForm.cdn_id).map((speed, idx) => (
                            <option key={idx} value={speed.speed_limit}>
                              {speed.speed_limit}M ({speed.service_name})
                            </option>
                          ))}
                        </select>
                      ) : (
                        <p className="text-sm text-gray-500 italic">No speeds configured for this CDN</p>
                      )}
                    </div>
                  )}
                  {currentCDNs.length > 0 && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">
                      Current service CDNs: {currentCDNs.map(c => `${c.cdn_name} ${c.speed_limit}M`).join(', ')}
                    </p>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label">Download (kbps)</label>
                    <input
                      type="number"
                      value={bandwidthRuleForm.download_speed}
                      onChange={(e) => setBandwidthRuleForm({ ...bandwidthRuleForm, download_speed: e.target.value })}
                      className="input"
                      placeholder="e.g., 50000"
                    />
                  </div>
                  <div>
                    <label className="label">Upload (kbps)</label>
                    <input
                      type="number"
                      value={bandwidthRuleForm.upload_speed}
                      onChange={(e) => setBandwidthRuleForm({ ...bandwidthRuleForm, upload_speed: e.target.value })}
                      className="input"
                      placeholder="e.g., 10000"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="label">Duration</label>
                <select
                  value={bandwidthRuleForm.duration}
                  onChange={(e) => setBandwidthRuleForm({ ...bandwidthRuleForm, duration: e.target.value })}
                  className="input"
                >
                  <option value="permanent">Permanent</option>
                  <option value="1h">1 Hour</option>
                  <option value="2h">2 Hours</option>
                  <option value="6h">6 Hours</option>
                  <option value="12h">12 Hours</option>
                  <option value="1d">1 Day</option>
                  <option value="2d">2 Days</option>
                  <option value="7d">7 Days</option>
                  <option value="14d">14 Days</option>
                  <option value="30d">30 Days</option>
                </select>
                <p className="text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500 mt-1">
                  {bandwidthRuleForm.duration === 'permanent'
                    ? 'Rule will apply until manually disabled or deleted'
                    : 'After duration expires, subscriber returns to normal service speed'}
                </p>
              </div>

              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={bandwidthRuleForm.enabled}
                  onChange={(e) => setBandwidthRuleForm({ ...bandwidthRuleForm, enabled: e.target.checked })}
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <span>Enabled</span>
              </label>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={() => {
                  setShowBandwidthRuleModal(false)
                  resetBandwidthRuleForm()
                }}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveBandwidthRule}
                disabled={saveBandwidthRuleMutation.isPending}
                className="btn btn-primary"
              >
                {saveBandwidthRuleMutation.isPending ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
