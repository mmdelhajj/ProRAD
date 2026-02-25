import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { backupApi } from '../services/api'
import { formatDate, formatDateTime } from '../utils/timezone'
import {
  ArrowPathIcon,
  ArrowDownTrayIcon,
  ArrowUpTrayIcon,
  TrashIcon,
  CloudArrowUpIcon,
  CloudIcon,
  DocumentArrowUpIcon,
  ExclamationTriangleIcon,
  CalendarDaysIcon,
  ClockIcon,
  PlayIcon,
  PencilIcon,
  ServerIcon,
  CheckCircleIcon,
  XCircleIcon,
  PlusIcon,
} from '@heroicons/react/24/outline'
import clsx from 'clsx'
import toast from 'react-hot-toast'

function formatBytes(bytes) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export default function Backups() {
  const queryClient = useQueryClient()
  const fileInputRef = useRef(null)
  const uploadRestoreInputRef = useRef(null)
  const [activeTab, setActiveTab] = useState('manual')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(null)
  const [sourceLicenseKey, setSourceLicenseKey] = useState('')
  const [backupType, setBackupType] = useState('full')
  const [uploadRestoreFile, setUploadRestoreFile] = useState(null)

  // Schedule modal state
  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const [editingSchedule, setEditingSchedule] = useState(null)
  const [scheduleForm, setScheduleForm] = useState({
    name: '',
    backup_type: 'full',
    frequency: 'daily',
    day_of_week: 0,
    day_of_month: 1,
    time_of_day: '02:00',
    retention: 7,
    storage_type: 'local',
    ftp_enabled: false,
    ftp_host: '',
    ftp_port: 21,
    ftp_username: '',
    ftp_password: '',
    ftp_path: '/backups',
    is_enabled: true,
    upload_to_cloud: false,
  })
  const [testingFTP, setTestingFTP] = useState(false)

  // Cloud backup state
  const [cloudDeleteConfirm, setCloudDeleteConfirm] = useState(null)
  const [cloudUploadConfirm, setCloudUploadConfirm] = useState(null)

  // Manual backups query
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['backups'],
    queryFn: () => backupApi.list().then((r) => r.data),
  })

  // Schedules query
  const { data: schedulesData, isLoading: schedulesLoading, refetch: refetchSchedules } = useQuery({
    queryKey: ['backup-schedules'],
    queryFn: () => backupApi.listSchedules().then((r) => r.data),
  })

  // Backup logs query
  const { data: logsData, isLoading: logsLoading } = useQuery({
    queryKey: ['backup-logs'],
    queryFn: () => backupApi.listLogs({ limit: 50 }).then((r) => r.data),
    enabled: activeTab === 'logs',
  })

  // Cloud backup queries
  const { data: cloudBackupsData, isLoading: cloudLoading, refetch: refetchCloud } = useQuery({
    queryKey: ['cloud-backups'],
    queryFn: () => backupApi.cloudList().then((r) => r.data),
    enabled: activeTab === 'cloud',
  })

  const { data: cloudUsageData } = useQuery({
    queryKey: ['cloud-usage'],
    queryFn: () => backupApi.cloudUsage().then((r) => r.data),
    enabled: activeTab === 'cloud',
  })

  const createMutation = useMutation({
    mutationFn: (type) => backupApi.create({ type }),
    onSuccess: (res) => {
      toast.success(res.data.message)
      setShowCreateModal(false)
      queryClient.invalidateQueries(['backups'])
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to create backup'),
  })

  const deleteMutation = useMutation({
    mutationFn: (filename) => backupApi.delete(filename),
    onSuccess: () => {
      toast.success('Backup deleted')
      queryClient.invalidateQueries(['backups'])
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to delete'),
  })

  const restoreMutation = useMutation({
    mutationFn: ({ filename, sourceLicenseKey }) => backupApi.restore(filename, sourceLicenseKey),
    onSuccess: () => {
      toast.success('Backup restored successfully')
      setShowRestoreConfirm(null)
      setSourceLicenseKey('')
      queryClient.invalidateQueries(['backups'])
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to restore'),
  })

  const uploadMutation = useMutation({
    mutationFn: ({ file, restoreAfter }) => {
      const formData = new FormData()
      formData.append('file', file)
      return backupApi.upload(formData).then(res => ({ ...res, restoreAfter, filename: res.data?.data?.filename }))
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries(['backups'])
      if (res.restoreAfter && res.filename) {
        toast.success('Backup uploaded — opening restore…')
        setShowRestoreConfirm(res.filename)
        setSourceLicenseKey('')
      } else {
        toast.success(res.data?.message || 'Backup uploaded')
      }
      setUploadRestoreFile(null)
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Failed to upload')
      setUploadRestoreFile(null)
    },
  })

  // Schedule mutations
  const createScheduleMutation = useMutation({
    mutationFn: (data) => backupApi.createSchedule(data),
    onSuccess: () => {
      toast.success('Schedule created successfully')
      setShowScheduleModal(false)
      resetScheduleForm()
      queryClient.invalidateQueries(['backup-schedules'])
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to create schedule'),
  })

  const updateScheduleMutation = useMutation({
    mutationFn: ({ id, data }) => backupApi.updateSchedule(id, data),
    onSuccess: () => {
      toast.success('Schedule updated successfully')
      setShowScheduleModal(false)
      setEditingSchedule(null)
      resetScheduleForm()
      queryClient.invalidateQueries(['backup-schedules'])
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to update schedule'),
  })

  const deleteScheduleMutation = useMutation({
    mutationFn: (id) => backupApi.deleteSchedule(id),
    onSuccess: () => {
      toast.success('Schedule deleted')
      queryClient.invalidateQueries(['backup-schedules'])
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to delete schedule'),
  })

  const toggleScheduleMutation = useMutation({
    mutationFn: (id) => backupApi.toggleSchedule(id),
    onSuccess: (res) => {
      toast.success(res.data.message)
      queryClient.invalidateQueries(['backup-schedules'])
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to toggle schedule'),
  })

  const runNowMutation = useMutation({
    mutationFn: (id) => backupApi.runScheduleNow(id),
    onSuccess: () => {
      toast.success('Backup started')
      queryClient.invalidateQueries(['backup-logs'])
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to run backup'),
  })

  // Cloud backup mutations
  const cloudUploadMutation = useMutation({
    mutationFn: (filename) => backupApi.cloudUpload(filename),
    onSuccess: (res) => {
      toast.success(res.data?.message || 'Backup uploaded to cloud')
      setCloudUploadConfirm(null)
      queryClient.invalidateQueries(['cloud-backups'])
      queryClient.invalidateQueries(['cloud-usage'])
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to upload to cloud'),
  })

  const cloudDeleteMutation = useMutation({
    mutationFn: (backupId) => backupApi.cloudDelete(backupId),
    onSuccess: () => {
      toast.success('Cloud backup deleted')
      setCloudDeleteConfirm(null)
      queryClient.invalidateQueries(['cloud-backups'])
      queryClient.invalidateQueries(['cloud-usage'])
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to delete cloud backup'),
  })

  const handleCloudDownload = async (backupId) => {
    try {
      const { data } = await backupApi.cloudDownloadToken(backupId)
      if (data.success && data.url) {
        window.open(data.url, '_blank')
      } else {
        toast.error('Failed to get download token')
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to download cloud backup')
    }
  }

  const handleDownload = async (filename) => {
    try {
      const { data } = await backupApi.getDownloadToken(filename)
      if (data.success && data.url) {
        window.open(data.url, '_blank')
      } else {
        toast.error('Failed to get download token')
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to download backup')
    }
  }

  const handleUpload = (e) => {
    const file = e.target.files?.[0]
    if (file) {
      uploadMutation.mutate({ file, restoreAfter: false })
    }
    e.target.value = ''
  }

  const handleUploadAndRestore = (e) => {
    const file = e.target.files?.[0]
    if (file) {
      setUploadRestoreFile(file.name)
      uploadMutation.mutate({ file, restoreAfter: true })
    }
    e.target.value = ''
  }

  const resetScheduleForm = () => {
    setScheduleForm({
      name: '',
      backup_type: 'full',
      frequency: 'daily',
      day_of_week: 0,
      day_of_month: 1,
      time_of_day: '02:00',
      retention: 7,
      storage_type: 'local',
      ftp_enabled: false,
      ftp_host: '',
      ftp_port: 21,
      ftp_username: '',
      ftp_password: '',
      ftp_path: '/backups',
      is_enabled: true,
      upload_to_cloud: false,
    })
  }

  const openScheduleModal = (schedule = null) => {
    if (schedule) {
      setEditingSchedule(schedule)
      setScheduleForm({
        name: schedule.name || '',
        backup_type: schedule.backup_type || 'full',
        frequency: schedule.frequency || 'daily',
        day_of_week: schedule.day_of_week || 0,
        day_of_month: schedule.day_of_month || 1,
        time_of_day: schedule.time_of_day || '02:00',
        retention: schedule.retention || 7,
        storage_type: schedule.storage_type || 'local',
        ftp_enabled: schedule.ftp_enabled || false,
        ftp_host: schedule.ftp_host || '',
        ftp_port: schedule.ftp_port || 21,
        ftp_username: schedule.ftp_username || '',
        ftp_password: schedule.ftp_password || '',
        ftp_path: schedule.ftp_path || '/backups',
        is_enabled: schedule.is_enabled !== false,
        upload_to_cloud: schedule.upload_to_cloud || false,
      })
    } else {
      setEditingSchedule(null)
      resetScheduleForm()
    }
    setShowScheduleModal(true)
  }

  const handleScheduleSubmit = (e) => {
    e.preventDefault()
    if (!scheduleForm.name) {
      toast.error('Schedule name is required')
      return
    }
    if (editingSchedule) {
      updateScheduleMutation.mutate({ id: editingSchedule.id, data: scheduleForm })
    } else {
      createScheduleMutation.mutate(scheduleForm)
    }
  }

  const handleTestFTP = async () => {
    if (!scheduleForm.ftp_host || !scheduleForm.ftp_username) {
      toast.error('FTP host and username are required')
      return
    }
    setTestingFTP(true)
    try {
      const res = await backupApi.testFTP({
        host: scheduleForm.ftp_host,
        port: scheduleForm.ftp_port,
        username: scheduleForm.ftp_username,
        password: scheduleForm.ftp_password,
        path: scheduleForm.ftp_path,
      })
      if (res.data.success) {
        toast.success('FTP connection successful')
      } else {
        toast.error(res.data.message || 'FTP connection failed')
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'FTP connection failed')
    } finally {
      setTestingFTP(false)
    }
  }

  const backups = data?.data || []
  const schedules = schedulesData?.data || []
  const logs = logsData?.data || []
  const cloudBackups = cloudBackupsData?.data || []
  const cloudUsage = cloudUsageData?.data || null
  const usagePercent = cloudUsage ? Math.round((cloudUsage.used_bytes / cloudUsage.quota_bytes) * 100) : 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Backup Management</h1>
          <p className="text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">Create, restore, and manage database backups</p>
        </div>
        <div className="flex items-center gap-3">
          {activeTab === 'manual' && (
            <>
              <button
                onClick={() => uploadRestoreInputRef.current?.click()}
                disabled={uploadMutation.isPending}
                className="btn-primary flex items-center gap-2"
                title="Upload a backup file and immediately restore it"
              >
                <DocumentArrowUpIcon className="w-4 h-4" />
                {uploadMutation.isPending && uploadRestoreFile ? 'Uploading…' : 'Upload & Restore'}
              </button>
              <input
                ref={uploadRestoreInputRef}
                type="file"
                accept=".proisp.bak,.sql"
                onChange={handleUploadAndRestore}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadMutation.isPending}
                className="btn-secondary flex items-center gap-2"
                title="Upload a backup file to the server list"
              >
                <ArrowUpTrayIcon className="w-4 h-4" />
                Upload Only
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".proisp.bak,.sql"
                onChange={handleUpload}
                className="hidden"
              />
              <button
                onClick={() => refetch()}
                className="btn-secondary flex items-center gap-2"
              >
                <ArrowPathIcon className="w-4 h-4" />
                Refresh
              </button>
              <button
                onClick={() => setShowCreateModal(true)}
                className="btn-primary flex items-center gap-2"
              >
                <CloudArrowUpIcon className="w-4 h-4" />
                Create Backup
              </button>
            </>
          )}
          {activeTab === 'scheduled' && (
            <>
              <button
                onClick={() => refetchSchedules()}
                className="btn-secondary flex items-center gap-2"
              >
                <ArrowPathIcon className="w-4 h-4" />
                Refresh
              </button>
              <button
                onClick={() => openScheduleModal()}
                className="btn-primary flex items-center gap-2"
              >
                <PlusIcon className="w-4 h-4" />
                Add Schedule
              </button>
            </>
          )}
          {activeTab === 'cloud' && (
            <button
              onClick={() => { refetchCloud(); queryClient.invalidateQueries(['cloud-usage']) }}
              className="btn-secondary flex items-center gap-2"
            >
              <ArrowPathIcon className="w-4 h-4" />
              Refresh
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="flex -mb-px">
          {[
            { id: 'manual', label: 'Manual Backups', icon: CloudArrowUpIcon },
            { id: 'scheduled', label: 'Scheduled Backups', icon: CalendarDaysIcon },
            { id: 'logs', label: 'Backup Logs', icon: ClockIcon },
            { id: 'cloud', label: 'Cloud Backup', icon: CloudIcon },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={clsx(
                'flex items-center gap-2 px-6 py-4 text-sm font-medium border-b-2',
                activeTab === tab.id
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 hover:border-gray-300'
              )}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Manual Backups Tab */}
      {activeTab === 'manual' && (
        <>
          {/* Info Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="card p-4">
              <div className="text-sm font-medium text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">Total Backups</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">{backups.length}</div>
            </div>
            <div className="card p-4">
              <div className="text-sm font-medium text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">Total Size</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {formatBytes(backups.reduce((acc, b) => acc + (b.size || 0), 0))}
              </div>
            </div>
            <div className="card p-4">
              <div className="text-sm font-medium text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">Latest Backup</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {backups[0] ? formatDate(backups[0].created_at) : 'None'}
              </div>
            </div>
          </div>

          {/* Backups Table */}
          <div className="card">
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Filename</th>
                    <th>Type</th>
                    <th>Size</th>
                    <th>Created At</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {isLoading ? (
                    <tr>
                      <td colSpan={5} className="text-center py-8">
                        <div className="flex items-center justify-center">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
                        </div>
                      </td>
                    </tr>
                  ) : backups.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center py-8 text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">
                        <CloudArrowUpIcon className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                        No backups found. Create your first backup to get started.
                      </td>
                    </tr>
                  ) : (
                    backups.map((backup) => (
                      <tr key={backup.filename} className="hover:bg-gray-50 dark:bg-gray-700">
                        <td>
                          <div className="flex items-center">
                            <DocumentArrowUpIcon className="w-5 h-5 text-gray-400 mr-2" />
                            <span className="font-medium">{backup.filename}</span>
                          </div>
                        </td>
                        <td>
                          <span
                            className={clsx(
                              'badge',
                              backup.type === 'full'
                                ? 'badge-success'
                                : backup.type === 'data'
                                ? 'badge-info'
                                : 'badge-warning'
                            )}
                          >
                            {backup.type || 'full'}
                          </span>
                        </td>
                        <td>{formatBytes(backup.size)}</td>
                        <td>{formatDateTime(backup.created_at)}</td>
                        <td>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleDownload(backup.filename)}
                              className="p-1.5 text-gray-500 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/30 rounded"
                              title="Download"
                            >
                              <ArrowDownTrayIcon className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setShowRestoreConfirm(backup.filename)}
                              className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 rounded"
                              title="Restore"
                            >
                              <ArrowPathIcon className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setCloudUploadConfirm(backup.filename)}
                              className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded"
                              title="Upload to Cloud"
                            >
                              <CloudArrowUpIcon className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => {
                                if (confirm('Are you sure you want to delete this backup?')) {
                                  deleteMutation.mutate(backup.filename)
                                }
                              }}
                              className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded"
                              title="Delete"
                            >
                              <TrashIcon className="w-4 h-4" />
                            </button>
                          </div>
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

      {/* Scheduled Backups Tab */}
      {activeTab === 'scheduled' && (
        <div className="space-y-4">
          {schedulesLoading ? (
            <div className="card p-8">
              <div className="flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
              </div>
            </div>
          ) : schedules.length === 0 ? (
            <div className="card p-8 text-center">
              <CalendarDaysIcon className="w-12 h-12 text-gray-300 mx-auto mb-2" />
              <p className="text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">No backup schedules configured.</p>
              <p className="text-gray-400 text-sm mt-1">Create a schedule to automate your backups.</p>
              <button
                onClick={() => openScheduleModal()}
                className="btn-primary mt-4 inline-flex items-center gap-2"
              >
                <PlusIcon className="w-4 h-4" />
                Create Schedule
              </button>
            </div>
          ) : (
            <div className="grid gap-4">
              {schedules.map((schedule) => (
                <div key={schedule.id} className="card p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <h3 className="font-semibold text-gray-900 dark:text-white">{schedule.name}</h3>
                        <span
                          className={clsx(
                            'badge',
                            schedule.is_enabled ? 'badge-success' : 'badge-secondary'
                          )}
                        >
                          {schedule.is_enabled ? 'Active' : 'Disabled'}
                        </span>
                        <span
                          className={clsx(
                            'badge',
                            schedule.backup_type === 'full'
                              ? 'badge-info'
                              : schedule.backup_type === 'data'
                              ? 'badge-warning'
                              : 'badge-secondary'
                          )}
                        >
                          {schedule.backup_type}
                        </span>
                      </div>
                      <div className="mt-2 text-sm text-gray-500 dark:text-gray-400 space-y-1">
                        <p>
                          <span className="font-medium">Frequency:</span>{' '}
                          {schedule.frequency === 'daily'
                            ? 'Daily'
                            : schedule.frequency === 'weekly'
                            ? `Weekly on ${DAYS_OF_WEEK[schedule.day_of_week]}`
                            : `Monthly on day ${schedule.day_of_month}`}
                          {' at '}
                          {schedule.time_of_day || '02:00'}
                        </p>
                        <p>
                          <span className="font-medium">Retention:</span> {schedule.retention} days
                        </p>
                        <p>
                          <span className="font-medium">Storage:</span>{' '}
                          {schedule.storage_type === 'both'
                            ? 'Local + FTP'
                            : schedule.storage_type === 'ftp'
                            ? 'FTP Only'
                            : schedule.storage_type === 'cloud'
                            ? 'ProxPanel Cloud'
                            : schedule.storage_type === 'local+cloud'
                            ? 'Local + Cloud'
                            : 'Local Only'}
                          {schedule.ftp_enabled && schedule.ftp_host && (
                            <span className="ml-2 text-gray-400 dark:text-gray-500 dark:text-gray-400">({schedule.ftp_host})</span>
                          )}
                        </p>
                        {schedule.last_run_at && (
                          <p>
                            <span className="font-medium">Last run:</span>{' '}
                            {formatDateTime(schedule.last_run_at)}
                            {schedule.last_status && (
                              <span
                                className={clsx(
                                  'ml-2',
                                  schedule.last_status === 'success'
                                    ? 'text-green-600'
                                    : schedule.last_status === 'running'
                                    ? 'text-blue-600'
                                    : 'text-red-600'
                                )}
                              >
                                ({schedule.last_status})
                              </span>
                            )}
                          </p>
                        )}
                        {schedule.next_run_at && (
                          <p>
                            <span className="font-medium">Next run:</span>{' '}
                            {formatDateTime(schedule.next_run_at)}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => runNowMutation.mutate(schedule.id)}
                        disabled={runNowMutation.isLoading}
                        className="p-2 text-gray-500 dark:text-gray-400 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 rounded"
                        title="Run Now"
                      >
                        <PlayIcon className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => openScheduleModal(schedule)}
                        className="p-2 text-gray-500 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/30 rounded"
                        title="Edit"
                      >
                        <PencilIcon className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => toggleScheduleMutation.mutate(schedule.id)}
                        disabled={toggleScheduleMutation.isLoading}
                        className={clsx(
                          'p-2 rounded',
                          schedule.is_enabled
                            ? 'text-green-600 hover:bg-green-50'
                            : 'text-gray-400 hover:bg-gray-100'
                        )}
                        title={schedule.is_enabled ? 'Disable' : 'Enable'}
                      >
                        {schedule.is_enabled ? (
                          <CheckCircleIcon className="w-5 h-5" />
                        ) : (
                          <XCircleIcon className="w-5 h-5" />
                        )}
                      </button>
                      <button
                        onClick={() => {
                          if (confirm('Are you sure you want to delete this schedule?')) {
                            deleteScheduleMutation.mutate(schedule.id)
                          }
                        }}
                        className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded"
                        title="Delete"
                      >
                        <TrashIcon className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Backup Logs Tab */}
      {activeTab === 'logs' && (
        <div className="card">
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Schedule</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>File</th>
                  <th>Size</th>
                  <th>Duration</th>
                  <th>Started At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {logsLoading ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8">
                      <div className="flex items-center justify-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
                      </div>
                    </td>
                  </tr>
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">
                      <ClockIcon className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                      No backup logs found.
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log.id} className="hover:bg-gray-50 dark:bg-gray-700">
                      <td>{log.schedule_name || 'Manual'}</td>
                      <td>
                        <span className="badge badge-info">{log.backup_type}</span>
                      </td>
                      <td>
                        <span
                          className={clsx(
                            'badge',
                            log.status === 'success'
                              ? 'badge-success'
                              : log.status === 'running'
                              ? 'badge-info'
                              : 'badge-danger'
                          )}
                        >
                          {log.status}
                        </span>
                      </td>
                      <td className="text-sm">{log.filename || '-'}</td>
                      <td>{log.file_size ? formatBytes(log.file_size) : '-'}</td>
                      <td>{log.duration ? `${log.duration}s` : '-'}</td>
                      <td>{formatDateTime(log.started_at)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Cloud Backup Tab */}
      {activeTab === 'cloud' && (
        <div className="space-y-6">
          {/* Storage Usage Bar */}
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <CloudIcon className="w-5 h-5 text-blue-500" />
                <span className="font-medium text-gray-900 dark:text-white">ProxPanel Cloud Storage</span>
                <span className="badge badge-info text-xs">{cloudUsage?.tier?.toUpperCase() || 'FREE'}</span>
              </div>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {formatBytes(cloudUsage?.used_bytes || 0)} / {formatBytes(cloudUsage?.quota_bytes || 524288000)}
              </span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div
                className={clsx(
                  'h-2 rounded-full transition-all',
                  usagePercent > 90 ? 'bg-red-500' : usagePercent > 70 ? 'bg-yellow-500' : 'bg-blue-500'
                )}
                style={{ width: `${Math.min(usagePercent, 100)}%` }}
              />
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {cloudUsage?.backup_count || cloudBackups.length} backups stored &bull; Free tier: 500 MB &bull;{' '}
              <button className="text-blue-500 hover:underline">Upgrade</button>
            </p>
          </div>

          {/* Cloud Backups Table */}
          <div className="card">
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Filename</th>
                    <th>Type</th>
                    <th>Size</th>
                    <th>Uploaded</th>
                    <th>Expires</th>
                    <th>Downloads</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {cloudLoading ? (
                    <tr>
                      <td colSpan={7} className="text-center py-8">
                        <div className="flex items-center justify-center">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
                        </div>
                      </td>
                    </tr>
                  ) : cloudBackups.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-12 text-gray-500 dark:text-gray-400">
                        <CloudIcon className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                        <p className="font-medium mb-1">No cloud backups yet</p>
                        <p className="text-sm text-gray-400 dark:text-gray-500">
                          Upload a local backup to get started. Click the{' '}
                          <CloudArrowUpIcon className="w-4 h-4 inline" /> icon on any local backup.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    cloudBackups.map((backup) => (
                      <tr key={backup.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <td>
                          <div className="flex items-center gap-2">
                            <CloudIcon className="w-4 h-4 text-blue-400 flex-shrink-0" />
                            <span className="font-medium text-sm">{backup.filename}</span>
                          </div>
                        </td>
                        <td>
                          <span
                            className={clsx(
                              'badge',
                              backup.type === 'full'
                                ? 'badge-success'
                                : backup.type === 'data'
                                ? 'badge-info'
                                : 'badge-warning'
                            )}
                          >
                            {backup.type || 'full'}
                          </span>
                        </td>
                        <td className="text-sm">{formatBytes(backup.size || 0)}</td>
                        <td className="text-sm">{backup.uploaded_at ? formatDateTime(backup.uploaded_at) : formatDateTime(backup.created_at)}</td>
                        <td className="text-sm">
                          {backup.expires_at ? (
                            <span className={clsx(
                              new Date(backup.expires_at) < new Date() ? 'text-red-500' : 'text-gray-500 dark:text-gray-400'
                            )}>
                              {formatDate(backup.expires_at)}
                            </span>
                          ) : (
                            <span className="text-gray-400 dark:text-gray-500">Never</span>
                          )}
                        </td>
                        <td className="text-sm text-gray-500 dark:text-gray-400">
                          {backup.download_count || 0}
                        </td>
                        <td>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleCloudDownload(backup.backup_id)}
                              className="p-1.5 text-gray-500 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/30 rounded"
                              title="Download from Cloud"
                            >
                              <ArrowDownTrayIcon className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setCloudDeleteConfirm(backup)}
                              className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded"
                              title="Delete from Cloud"
                            >
                              <TrashIcon className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Upload from Local Section */}
          {backups.length > 0 && (
            <div className="card p-4">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                <CloudArrowUpIcon className="w-5 h-5 text-blue-500" />
                Upload Local Backup to Cloud
              </h3>
              <div className="space-y-2">
                {backups.map((backup) => (
                  <div key={backup.filename} className="flex items-center justify-between py-2 px-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                    <div className="flex items-center gap-2 min-w-0">
                      <DocumentArrowUpIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">{backup.filename}</span>
                      <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">{formatBytes(backup.size || 0)}</span>
                    </div>
                    <button
                      onClick={() => setCloudUploadConfirm(backup.filename)}
                      className="btn-secondary text-xs py-1 px-3 flex items-center gap-1 flex-shrink-0 ml-3"
                    >
                      <CloudArrowUpIcon className="w-3.5 h-3.5" />
                      Upload
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Cloud Upload Confirmation Modal */}
      {cloudUploadConfirm && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/50" onClick={() => setCloudUploadConfirm(null)} />
            <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-full">
                  <CloudArrowUpIcon className="w-6 h-6 text-blue-600" />
                </div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Upload to Cloud</h2>
              </div>
              <p className="text-gray-600 dark:text-gray-300 mb-2">
                Upload this backup to ProxPanel Cloud Storage?
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 font-mono bg-gray-50 dark:bg-gray-700 px-3 py-2 rounded">
                {cloudUploadConfirm}
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setCloudUploadConfirm(null)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={() => cloudUploadMutation.mutate(cloudUploadConfirm)}
                  disabled={cloudUploadMutation.isLoading}
                  className="btn-primary flex items-center gap-2"
                >
                  {cloudUploadMutation.isLoading ? (
                    <ArrowPathIcon className="w-4 h-4 animate-spin" />
                  ) : (
                    <CloudArrowUpIcon className="w-4 h-4" />
                  )}
                  Upload to Cloud
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cloud Delete Confirmation Modal */}
      {cloudDeleteConfirm && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/50" onClick={() => setCloudDeleteConfirm(null)} />
            <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-red-100 dark:bg-red-900/30 rounded-full">
                  <ExclamationTriangleIcon className="w-6 h-6 text-red-600" />
                </div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Delete Cloud Backup</h2>
              </div>
              <p className="text-gray-600 dark:text-gray-300 mb-2">
                Are you sure you want to permanently delete this cloud backup?
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 font-mono bg-gray-50 dark:bg-gray-700 px-3 py-2 rounded">
                {cloudDeleteConfirm.filename}
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setCloudDeleteConfirm(null)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={() => cloudDeleteMutation.mutate(cloudDeleteConfirm.backup_id)}
                  disabled={cloudDeleteMutation.isLoading}
                  className="btn-danger flex items-center gap-2"
                >
                  {cloudDeleteMutation.isLoading ? (
                    <ArrowPathIcon className="w-4 h-4 animate-spin" />
                  ) : (
                    <TrashIcon className="w-4 h-4" />
                  )}
                  Delete from Cloud
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Backup Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/50" onClick={() => setShowCreateModal(false)} />
            <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full p-6">
              <h2 className="text-xl font-bold mb-4">Create Backup</h2>

              <div className="space-y-3">
                <p className="text-sm text-gray-600 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">Select backup type:</p>

                {[
                  { value: 'full', label: 'Full Backup', desc: 'Complete database backup (all tables)' },
                  { value: 'data', label: 'Data Only', desc: 'Subscribers, services, transactions, sessions' },
                  { value: 'config', label: 'Config Only', desc: 'Users, settings, templates, rules' },
                ].map((type) => (
                  <label
                    key={type.value}
                    className={clsx(
                      'flex items-start p-3 border rounded-lg cursor-pointer transition-colors',
                      backupType === type.value
                        ? 'border-primary-500 bg-primary-50'
                        : 'hover:bg-gray-50'
                    )}
                  >
                    <input
                      type="radio"
                      name="backupType"
                      value={type.value}
                      checked={backupType === type.value}
                      onChange={(e) => setBackupType(e.target.value)}
                      className="mt-1 mr-3"
                    />
                    <div>
                      <p className="font-medium">{type.label}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">{type.desc}</p>
                    </div>
                  </label>
                ))}
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={() => createMutation.mutate(backupType)}
                  disabled={createMutation.isLoading}
                  className="btn-primary flex items-center gap-2"
                >
                  {createMutation.isLoading ? (
                    <ArrowPathIcon className="w-4 h-4 animate-spin" />
                  ) : (
                    <CloudArrowUpIcon className="w-4 h-4" />
                  )}
                  Create Backup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Restore Confirmation Modal */}
      {showRestoreConfirm && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/50" onClick={() => setShowRestoreConfirm(null)} />
            <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-yellow-100 rounded-full">
                  <ExclamationTriangleIcon className="w-6 h-6 text-yellow-600" />
                </div>
                <h2 className="text-xl font-bold">Confirm Restore</h2>
              </div>

              <p className="text-gray-600 dark:text-gray-300 mb-4">
                Are you sure you want to restore from this backup? This will overwrite existing data.
              </p>

              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                File: <span className="font-mono text-gray-700 dark:text-gray-300">{showRestoreConfirm}</span>
              </p>

              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Source License Key (optional - auto-detected)
                </label>
                <input
                  type="text"
                  value={sourceLicenseKey}
                  onChange={(e) => setSourceLicenseKey(e.target.value)}
                  placeholder="Auto-detected from backup file (leave empty)"
                  className="input w-full"
                />
                <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                  ✓ System automatically reads the license key from the backup file - no manual input needed!
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Only fill this if you want to override the auto-detected license key.
                </p>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => {
                    setShowRestoreConfirm(null)
                    setSourceLicenseKey('')
                  }}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={() => restoreMutation.mutate({
                    filename: showRestoreConfirm,
                    sourceLicenseKey: sourceLicenseKey.trim()
                  })}
                  disabled={restoreMutation.isLoading}
                  className="btn-danger flex items-center gap-2"
                >
                  {restoreMutation.isLoading ? (
                    <ArrowPathIcon className="w-4 h-4 animate-spin" />
                  ) : (
                    <ArrowPathIcon className="w-4 h-4" />
                  )}
                  Restore Backup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Schedule Modal */}
      {showScheduleModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/50" onClick={() => setShowScheduleModal(false)} />
            <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
              <h2 className="text-xl font-bold mb-4">
                {editingSchedule ? 'Edit Schedule' : 'Create Backup Schedule'}
              </h2>

              <form onSubmit={handleScheduleSubmit} className="space-y-6">
                {/* Basic Settings */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Schedule Name *
                    </label>
                    <input
                      type="text"
                      value={scheduleForm.name}
                      onChange={(e) => setScheduleForm({ ...scheduleForm, name: e.target.value })}
                      placeholder="e.g., Daily Full Backup"
                      className="input w-full"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Backup Type
                      </label>
                      <select
                        value={scheduleForm.backup_type}
                        onChange={(e) => setScheduleForm({ ...scheduleForm, backup_type: e.target.value })}
                        className="input w-full"
                      >
                        <option value="full">Full Backup</option>
                        <option value="data">Data Only</option>
                        <option value="config">Config Only</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Frequency
                      </label>
                      <select
                        value={scheduleForm.frequency}
                        onChange={(e) => setScheduleForm({ ...scheduleForm, frequency: e.target.value })}
                        className="input w-full"
                      >
                        <option value="daily">Daily</option>
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                      </select>
                    </div>
                  </div>

                  {scheduleForm.frequency === 'weekly' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Day of Week
                      </label>
                      <select
                        value={scheduleForm.day_of_week}
                        onChange={(e) => setScheduleForm({ ...scheduleForm, day_of_week: parseInt(e.target.value) })}
                        className="input w-full"
                      >
                        {DAYS_OF_WEEK.map((day, idx) => (
                          <option key={idx} value={idx}>{day}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {scheduleForm.frequency === 'monthly' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Day of Month
                      </label>
                      <select
                        value={scheduleForm.day_of_month}
                        onChange={(e) => setScheduleForm({ ...scheduleForm, day_of_month: parseInt(e.target.value) })}
                        className="input w-full"
                      >
                        {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
                          <option key={day} value={day}>{day}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Time of Day
                      </label>
                      <input
                        type="time"
                        value={scheduleForm.time_of_day}
                        onChange={(e) => setScheduleForm({ ...scheduleForm, time_of_day: e.target.value })}
                        className="input w-full"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Retention (days)
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="365"
                        value={scheduleForm.retention}
                        onChange={(e) => setScheduleForm({ ...scheduleForm, retention: parseInt(e.target.value) })}
                        className="input w-full"
                      />
                    </div>
                  </div>
                </div>

                {/* Storage Settings */}
                <div className="border-t pt-4">
                  <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-3">Storage Settings</h3>

                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Storage Type
                    </label>
                    <select
                      value={scheduleForm.storage_type}
                      onChange={(e) => {
                        const val = e.target.value
                        setScheduleForm({
                          ...scheduleForm,
                          storage_type: val,
                          ftp_enabled: val === 'ftp' || val === 'both'
                        })
                      }}
                      className="input w-full"
                    >
                      <option value="local">Local Only</option>
                      <option value="ftp">FTP Only</option>
                      <option value="both">Local + FTP</option>
                      <option value="cloud">ProxPanel Cloud</option>
                      <option value="local+cloud">Local + Cloud</option>
                    </select>
                  </div>

                  {/* FTP Settings */}
                  {(scheduleForm.storage_type === 'ftp' || scheduleForm.storage_type === 'both') && (
                    <div className="bg-gray-50 rounded-lg p-4 space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-medium text-gray-700 flex items-center gap-2">
                          <ServerIcon className="w-4 h-4" />
                          FTP Settings
                        </h4>
                        <button
                          type="button"
                          onClick={handleTestFTP}
                          disabled={testingFTP}
                          className="btn-secondary text-sm py-1 px-3"
                        >
                          {testingFTP ? 'Testing...' : 'Test Connection'}
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            FTP Host *
                          </label>
                          <input
                            type="text"
                            value={scheduleForm.ftp_host}
                            onChange={(e) => setScheduleForm({ ...scheduleForm, ftp_host: e.target.value })}
                            placeholder="ftp.example.com"
                            className="input w-full text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            FTP Port
                          </label>
                          <input
                            type="number"
                            value={scheduleForm.ftp_port}
                            onChange={(e) => setScheduleForm({ ...scheduleForm, ftp_port: parseInt(e.target.value) })}
                            className="input w-full text-sm"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Username *
                          </label>
                          <input
                            type="text"
                            value={scheduleForm.ftp_username}
                            onChange={(e) => setScheduleForm({ ...scheduleForm, ftp_username: e.target.value })}
                            className="input w-full text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Password
                          </label>
                          <input
                            type="password"
                            value={scheduleForm.ftp_password}
                            onChange={(e) => setScheduleForm({ ...scheduleForm, ftp_password: e.target.value })}
                            placeholder={editingSchedule ? '(unchanged)' : ''}
                            className="input w-full text-sm"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Remote Path
                        </label>
                        <input
                          type="text"
                          value={scheduleForm.ftp_path}
                          onChange={(e) => setScheduleForm({ ...scheduleForm, ftp_path: e.target.value })}
                          placeholder="/backups"
                          className="input w-full text-sm"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Enable/Disable */}
                <div className="flex items-center justify-between border-t pt-4">
                  <div>
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 dark:text-gray-500 dark:text-gray-400">Enable Schedule</label>
                    <p className="text-xs text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">Backups will run automatically when enabled</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setScheduleForm({ ...scheduleForm, is_enabled: !scheduleForm.is_enabled })}
                    className={clsx(
                      'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out',
                      scheduleForm.is_enabled ? 'bg-primary-600' : 'bg-gray-200'
                    )}
                  >
                    <span
                      className={clsx(
                        'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white dark:bg-gray-800 shadow ring-0 transition duration-200 ease-in-out',
                        scheduleForm.is_enabled ? 'translate-x-5' : 'translate-x-0'
                      )}
                    />
                  </button>
                </div>

                {/* Upload to Cloud Toggle */}
                <div className="flex items-center justify-between border-t pt-4">
                  <div>
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                      <CloudArrowUpIcon className="w-4 h-4 text-blue-500" />
                      Upload to ProxPanel Cloud
                    </label>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Auto-upload backup to cloud storage after each scheduled run
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setScheduleForm({ ...scheduleForm, upload_to_cloud: !scheduleForm.upload_to_cloud })}
                    className={clsx(
                      'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out',
                      scheduleForm.upload_to_cloud ? 'bg-blue-500' : 'bg-gray-200 dark:bg-gray-600'
                    )}
                  >
                    <span
                      className={clsx(
                        'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white dark:bg-gray-800 shadow ring-0 transition duration-200 ease-in-out',
                        scheduleForm.upload_to_cloud ? 'translate-x-5' : 'translate-x-0'
                      )}
                    />
                  </button>
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-3 border-t pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowScheduleModal(false)
                      setEditingSchedule(null)
                      resetScheduleForm()
                    }}
                    className="btn-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={createScheduleMutation.isLoading || updateScheduleMutation.isLoading}
                    className="btn-primary flex items-center gap-2"
                  >
                    {(createScheduleMutation.isLoading || updateScheduleMutation.isLoading) ? (
                      <ArrowPathIcon className="w-4 h-4 animate-spin" />
                    ) : editingSchedule ? (
                      <PencilIcon className="w-4 h-4" />
                    ) : (
                      <PlusIcon className="w-4 h-4" />
                    )}
                    {editingSchedule ? 'Update Schedule' : 'Create Schedule'}
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
