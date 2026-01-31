import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import { clusterApi } from '../services/api'

const ClusterTab = () => {
  const queryClient = useQueryClient()
  const [setupMode, setSetupMode] = useState(null) // null, 'main', 'secondary', 'recover'
  const [mainServerIP, setMainServerIP] = useState('')
  const [clusterSecret, setClusterSecret] = useState('')
  const [serverName, setServerName] = useState('')
  const [serverIP, setServerIP] = useState('')
  const [serverRole, setServerRole] = useState('secondary')
  const [testResult, setTestResult] = useState(null)
  const [testing, setTesting] = useState(false)
  const [promoting, setPromoting] = useState(false)
  const [recovering, setRecovering] = useState(false)
  const [sourceServerIP, setSourceServerIP] = useState('')
  const [sourcePassword, setSourcePassword] = useState('')
  const [sourceTestResult, setSourceTestResult] = useState(null)
  const [testingSource, setTestingSource] = useState(false)

  // Fetch cluster config
  const { data: configData, isLoading: configLoading } = useQuery({
    queryKey: ['cluster-config'],
    queryFn: async () => {
      const res = await clusterApi.getConfig()
      return res.data.data
    },
  })

  // Fetch cluster status
  const { data: statusData, isLoading: statusLoading, refetch: refetchStatus } = useQuery({
    queryKey: ['cluster-status'],
    queryFn: async () => {
      const res = await clusterApi.getStatus()
      return res.data.data
    },
    refetchInterval: 10000, // Refresh every 10 seconds
    enabled: configData?.is_active,
  })

  // Check main server status (for secondary servers)
  const { data: mainStatus, refetch: refetchMainStatus } = useQuery({
    queryKey: ['cluster-main-status'],
    queryFn: async () => {
      const res = await clusterApi.checkMainStatus()
      return res.data.data
    },
    refetchInterval: 30000, // Check every 30 seconds
    enabled: configData?.is_active && configData?.server_role !== 'main',
  })

  // Setup main mutation
  const setupMainMutation = useMutation({
    mutationFn: (data) => clusterApi.setupMain(data),
    onSuccess: (res) => {
      toast.success('Main server configured successfully')
      setSetupMode(null)
      queryClient.invalidateQueries(['cluster-config'])
      queryClient.invalidateQueries(['cluster-status'])
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Failed to configure main server')
    },
  })

  // Setup secondary mutation
  const setupSecondaryMutation = useMutation({
    mutationFn: (data) => clusterApi.setupSecondary(data),
    onSuccess: (res) => {
      toast.success('Successfully joined cluster')
      setSetupMode(null)
      queryClient.invalidateQueries(['cluster-config'])
      queryClient.invalidateQueries(['cluster-status'])
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Failed to join cluster')
    },
  })

  // Leave cluster mutation
  const leaveClusterMutation = useMutation({
    mutationFn: () => clusterApi.leaveCluster(),
    onSuccess: () => {
      toast.success('Left cluster successfully')
      queryClient.invalidateQueries(['cluster-config'])
      queryClient.invalidateQueries(['cluster-status'])
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Failed to leave cluster')
    },
  })

  // Remove node mutation
  const removeNodeMutation = useMutation({
    mutationFn: (id) => clusterApi.removeNode(id),
    onSuccess: () => {
      toast.success('Node removed from cluster')
      queryClient.invalidateQueries(['cluster-status'])
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Failed to remove node')
    },
  })

  // Test connection
  const handleTestConnection = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await clusterApi.testConnection({
        main_server_ip: mainServerIP,
        cluster_secret: clusterSecret,
      })
      setTestResult(res.data)
    } catch (err) {
      setTestResult({
        success: false,
        message: err.response?.data?.message || 'Connection failed',
      })
    } finally {
      setTesting(false)
    }
  }

  // Handle setup main
  const handleSetupMain = () => {
    setupMainMutation.mutate({
      server_name: serverName || 'Main Server',
      server_ip: serverIP || configData?.server_ip,
    })
  }

  // Handle setup secondary
  const handleSetupSecondary = () => {
    if (!mainServerIP || !clusterSecret) {
      toast.error('Main server IP and cluster secret are required')
      return
    }
    setupSecondaryMutation.mutate({
      main_server_ip: mainServerIP,
      cluster_secret: clusterSecret,
      server_name: serverName || 'Secondary Server',
      server_ip: serverIP || configData?.server_ip,
      server_role: serverRole,
    })
  }

  // Handle promote to main (one-click failover)
  const handlePromoteToMain = async () => {
    if (!confirm('Are you sure you want to promote this server to MAIN?\n\nThis will:\n• Make this server the primary database\n• Allow all write operations\n• Stop replication from old main\n\nOnly do this if the main server is offline!')) {
      return
    }

    setPromoting(true)
    try {
      const res = await clusterApi.promoteToMain()
      if (res.data.success) {
        toast.success('Successfully promoted to main server!')
        queryClient.invalidateQueries(['cluster-config'])
        queryClient.invalidateQueries(['cluster-status'])
        queryClient.invalidateQueries(['cluster-main-status'])
      } else {
        toast.error(res.data.message || 'Failed to promote')
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to promote to main')
    } finally {
      setPromoting(false)
    }
  }

  // Test source server connection (for recovery)
  const handleTestSourceConnection = async () => {
    setTestingSource(true)
    setSourceTestResult(null)
    try {
      const res = await clusterApi.testSourceConnection({
        source_server_ip: sourceServerIP,
        root_password: sourcePassword,
      })
      setSourceTestResult(res.data)
    } catch (err) {
      setSourceTestResult({
        success: false,
        message: err.response?.data?.message || 'Connection failed',
      })
    } finally {
      setTestingSource(false)
    }
  }

  // Handle recover from server
  const handleRecoverFromServer = async () => {
    if (!sourceTestResult?.success) {
      toast.error('Please test the connection first')
      return
    }

    if (!confirm(`Are you sure you want to recover data from ${sourceServerIP}?\n\nThis will:\n• Download the full database from the source server\n• Replace all data on this server\n• Configure this server as the new main\n\nThis process may take a few minutes.`)) {
      return
    }

    setRecovering(true)
    try {
      const res = await clusterApi.recoverFromServer({
        source_server_ip: sourceServerIP,
        root_password: sourcePassword,
        become_main: true,
      })
      if (res.data.success) {
        toast.success('Recovery complete! Refreshing page...')
        setTimeout(() => {
          window.location.reload()
        }, 2000)
      } else {
        toast.error(res.data.message || 'Recovery failed')
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Recovery failed')
    } finally {
      setRecovering(false)
    }
  }

  // Get status color
  const getStatusColor = (status) => {
    switch (status) {
      case 'online': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
      case 'syncing': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
      case 'offline': return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-400'
      case 'error': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-400'
    }
  }

  // Get status icon
  const getStatusIcon = (status) => {
    switch (status) {
      case 'online': return '🟢'
      case 'syncing': return '🟡'
      case 'offline': return '⚫'
      case 'error': return '🔴'
      default: return '⚪'
    }
  }

  if (configLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  // Not configured - show setup options
  if (!configData?.is_active || configData?.server_role === 'standalone') {
    return (
      <div className="space-y-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
            HA Cluster Configuration
          </h3>

          <p className="text-gray-600 dark:text-gray-400 mb-6">
            Set up High Availability clustering to improve performance, redundancy, and backup capabilities.
          </p>

          {!setupMode ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Main Server Option */}
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-6 hover:border-blue-500 dark:hover:border-blue-500 cursor-pointer transition-colors"
                     onClick={() => setSetupMode('main')}>
                  <div className="flex items-center mb-4">
                    <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                      <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
                      </svg>
                    </div>
                    <div className="ml-4">
                      <h4 className="text-lg font-medium text-gray-900 dark:text-white">Main Server</h4>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Primary node</p>
                    </div>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Configure this server as the main (primary) server. Other servers will replicate from this server.
                  </p>
                  <ul className="mt-4 text-sm text-gray-600 dark:text-gray-400 space-y-1">
                    <li>• Database primary (all writes)</li>
                    <li>• Redis primary</li>
                    <li>• RADIUS primary</li>
                    <li>• API active</li>
                  </ul>
                </div>

                {/* Secondary Server Option */}
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-6 hover:border-green-500 dark:hover:border-green-500 cursor-pointer transition-colors"
                     onClick={() => setSetupMode('secondary')}>
                  <div className="flex items-center mb-4">
                    <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
                      <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                      </svg>
                    </div>
                    <div className="ml-4">
                      <h4 className="text-lg font-medium text-gray-900 dark:text-white">Secondary Server</h4>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Replica node</p>
                    </div>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Join an existing cluster as a secondary server. Data will be replicated from the main server.
                  </p>
                  <ul className="mt-4 text-sm text-gray-600 dark:text-gray-400 space-y-1">
                    <li>• Database replica (real-time sync)</li>
                    <li>• Redis replica</li>
                    <li>• RADIUS backup</li>
                    <li>• API standby (auto-failover)</li>
                  </ul>
                </div>
              </div>

              {/* Recovery Option */}
              <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
                <div className="border border-orange-200 dark:border-orange-700 rounded-lg p-6 hover:border-orange-500 dark:hover:border-orange-500 cursor-pointer transition-colors bg-orange-50 dark:bg-orange-900/20"
                     onClick={() => setSetupMode('recover')}>
                  <div className="flex items-center mb-4">
                    <div className="w-12 h-12 bg-orange-100 dark:bg-orange-900/30 rounded-lg flex items-center justify-center">
                      <svg className="w-6 h-6 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                      </svg>
                    </div>
                    <div className="ml-4">
                      <h4 className="text-lg font-medium text-gray-900 dark:text-white">Recover from Existing Server</h4>
                      <p className="text-sm text-orange-600 dark:text-orange-400">Disaster Recovery</p>
                    </div>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Restore data from an existing server. Use this if you're replacing a failed main server or migrating to new hardware.
                  </p>
                  <ul className="mt-4 text-sm text-gray-600 dark:text-gray-400 space-y-1">
                    <li>• Download full database backup</li>
                    <li>• Restore all subscribers and settings</li>
                    <li>• Sync uploads (logo, favicon)</li>
                    <li>• Become the new main server</li>
                  </ul>
                </div>
              </div>
            </div>
          ) : setupMode === 'recover' ? (
            /* Recovery Form */
            <div className="max-w-lg">
              <h4 className="text-md font-medium text-gray-900 dark:text-white mb-4">
                Recover Data from Existing Server
              </h4>

              <div className="bg-orange-50 dark:bg-orange-900/30 border border-orange-200 dark:border-orange-800 rounded-lg p-4 mb-4">
                <h5 className="font-medium text-orange-900 dark:text-orange-300 mb-2">⚠️ Important</h5>
                <p className="text-sm text-orange-700 dark:text-orange-400">
                  This will download all data from the source server and replace any existing data on this server.
                  Make sure the source server is running and accessible.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Source Server IP Address *
                  </label>
                  <input
                    type="text"
                    value={sourceServerIP}
                    onChange={(e) => setSourceServerIP(e.target.value)}
                    placeholder="10.0.0.219"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                  <p className="text-xs text-gray-500 mt-1">The IP of your existing ProISP server with the data</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Root Password *
                  </label>
                  <input
                    type="password"
                    value={sourcePassword}
                    onChange={(e) => setSourcePassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                  <p className="text-xs text-gray-500 mt-1">SSH root password for the source server</p>
                </div>

                {/* Test Connection */}
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                  <button
                    onClick={handleTestSourceConnection}
                    disabled={testingSource || !sourceServerIP || !sourcePassword}
                    className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                  >
                    {testingSource ? 'Testing...' : '🔍 Test Connection'}
                  </button>

                  {sourceTestResult && (
                    <div className={`mt-3 p-3 rounded-lg ${sourceTestResult.success ? 'bg-green-50 dark:bg-green-900/30' : 'bg-red-50 dark:bg-red-900/30'}`}>
                      <p className={`font-medium ${sourceTestResult.success ? 'text-green-800 dark:text-green-400' : 'text-red-800 dark:text-red-400'}`}>
                        {sourceTestResult.success ? '✓ Connection successful' : '✗ Connection failed'}
                      </p>
                      {sourceTestResult.success && sourceTestResult.data && (
                        <div className="mt-2 text-sm text-green-700 dark:text-green-400">
                          <p>SSH: {sourceTestResult.data.ssh_ok ? '✓' : '✗'}</p>
                          <p>Database: {sourceTestResult.data.database_ok ? '✓' : '✗'}</p>
                          <p>Subscribers: {sourceTestResult.data.subscribers?.toLocaleString() || 0}</p>
                        </div>
                      )}
                      {sourceTestResult.message && !sourceTestResult.success && (
                        <p className="mt-1 text-sm text-red-700 dark:text-red-400">{sourceTestResult.message}</p>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={handleRecoverFromServer}
                    disabled={recovering || !sourceTestResult?.success}
                    className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50"
                  >
                    {recovering ? 'Recovering... Please wait' : '📥 Recover Data'}
                  </button>
                  <button
                    onClick={() => {
                      setSetupMode(null)
                      setSourceTestResult(null)
                    }}
                    className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          ) : setupMode === 'main' ? (
            /* Main Server Setup Form */
            <div className="max-w-lg">
              <h4 className="text-md font-medium text-gray-900 dark:text-white mb-4">
                Configure as Main Server
              </h4>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Server Name
                  </label>
                  <input
                    type="text"
                    value={serverName}
                    onChange={(e) => setServerName(e.target.value)}
                    placeholder="Main Server"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Server IP Address
                  </label>
                  <input
                    type="text"
                    value={serverIP || configData?.server_ip || ''}
                    onChange={(e) => setServerIP(e.target.value)}
                    placeholder={configData?.server_ip || 'Auto-detect'}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                  <p className="text-xs text-gray-500 mt-1">Leave empty to auto-detect</p>
                </div>

                <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                  <h5 className="font-medium text-blue-900 dark:text-blue-300 mb-2">What happens next?</h5>
                  <ul className="text-sm text-blue-700 dark:text-blue-400 space-y-1">
                    <li>• A unique Cluster ID and Secret will be generated</li>
                    <li>• PostgreSQL will be configured for replication</li>
                    <li>• Redis will be configured as primary</li>
                    <li>• You'll receive the cluster secret to share with secondary servers</li>
                  </ul>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={handleSetupMain}
                    disabled={setupMainMutation.isPending}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    {setupMainMutation.isPending ? 'Configuring...' : 'Configure as Main'}
                  </button>
                  <button
                    onClick={() => setSetupMode(null)}
                    className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Secondary Server Setup Form */
            <div className="max-w-lg">
              <h4 className="text-md font-medium text-gray-900 dark:text-white mb-4">
                Join Cluster as Secondary
              </h4>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Main Server IP Address *
                  </label>
                  <input
                    type="text"
                    value={mainServerIP}
                    onChange={(e) => setMainServerIP(e.target.value)}
                    placeholder="192.168.1.10"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Cluster Secret Key *
                  </label>
                  <input
                    type="text"
                    value={clusterSecret}
                    onChange={(e) => setClusterSecret(e.target.value)}
                    placeholder="xxxx-xxxx-xxxx-xxxx"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono"
                  />
                  <p className="text-xs text-gray-500 mt-1">Get this from the main server's cluster settings</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Server Role
                  </label>
                  <select
                    value={serverRole}
                    onChange={(e) => setServerRole(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    <option value="secondary">Secondary (Failover + RADIUS backup)</option>
                    <option value="server3">Server 3 (Read-only + Reports)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Server Name
                  </label>
                  <input
                    type="text"
                    value={serverName}
                    onChange={(e) => setServerName(e.target.value)}
                    placeholder="Secondary Server"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>

                {/* Test Connection */}
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                  <button
                    onClick={handleTestConnection}
                    disabled={testing || !mainServerIP}
                    className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                  >
                    {testing ? 'Testing...' : '🔍 Test Connection'}
                  </button>

                  {testResult && (
                    <div className={`mt-3 p-3 rounded-lg ${testResult.success ? 'bg-green-50 dark:bg-green-900/30' : 'bg-red-50 dark:bg-red-900/30'}`}>
                      <p className={`font-medium ${testResult.success ? 'text-green-800 dark:text-green-400' : 'text-red-800 dark:text-red-400'}`}>
                        {testResult.success ? '✓ Connection successful' : '✗ Connection failed'}
                      </p>
                      {testResult.success && (
                        <div className="mt-2 text-sm text-green-700 dark:text-green-400">
                          <p>API: {testResult.api_ok ? '✓' : '✗'}</p>
                          <p>Database: {testResult.db_ok ? '✓' : '✗'}</p>
                          <p>Redis: {testResult.redis_ok ? '✓' : '✗'}</p>
                        </div>
                      )}
                      {testResult.message && !testResult.success && (
                        <p className="mt-1 text-sm text-red-700 dark:text-red-400">{testResult.message}</p>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={handleSetupSecondary}
                    disabled={setupSecondaryMutation.isPending || !mainServerIP || !clusterSecret}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                  >
                    {setupSecondaryMutation.isPending ? 'Joining...' : 'Join Cluster'}
                  </button>
                  <button
                    onClick={() => setSetupMode(null)}
                    className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Current Server Info */}
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <h4 className="font-medium text-gray-900 dark:text-white mb-3">Current Server Information</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-gray-500 dark:text-gray-400">Server IP:</span>
              <p className="font-mono text-gray-900 dark:text-white">{configData?.server_ip || 'Unknown'}</p>
            </div>
            <div>
              <span className="text-gray-500 dark:text-gray-400">Hardware ID:</span>
              <p className="font-mono text-gray-900 dark:text-white truncate">{configData?.hardware_id || 'Unknown'}</p>
            </div>
            <div>
              <span className="text-gray-500 dark:text-gray-400">Database ID:</span>
              <p className="font-mono text-gray-900 dark:text-white truncate">{configData?.database_id || 'Unknown'}</p>
            </div>
            <div>
              <span className="text-gray-500 dark:text-gray-400">Status:</span>
              <p className="text-gray-900 dark:text-white">Standalone</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Cluster is active - show status dashboard
  return (
    <div className="space-y-6">
      {/* Failover Alert - Show when secondary and main is offline */}
      {configData?.server_role !== 'main' && mainStatus?.can_promote && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg p-6">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <svg className="h-8 w-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div className="ml-4 flex-1">
              <h3 className="text-lg font-medium text-red-900 dark:text-red-300">
                Main Server Offline
              </h3>
              <p className="mt-1 text-sm text-red-700 dark:text-red-400">
                Main server ({mainStatus?.main_server_ip}) has been offline for {mainStatus?.offline_minutes} minutes.
                {mainStatus?.main_last_seen && (
                  <span className="block mt-1">Last seen: {mainStatus.main_last_seen}</span>
                )}
              </p>
              <p className="mt-2 text-sm text-red-700 dark:text-red-400">
                Your data is safe on this server. You can promote this server to become the new main server.
              </p>
              <div className="mt-4">
                <button
                  onClick={handlePromoteToMain}
                  disabled={promoting}
                  className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 font-medium text-lg"
                >
                  {promoting ? (
                    <span className="flex items-center">
                      <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Promoting...
                    </span>
                  ) : (
                    '🔄 Promote to Main Server'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Secondary Server Notice - Read Only Mode */}
      {configData?.server_role !== 'main' && mainStatus?.is_main_online && (
        <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <div className="flex items-center">
            <svg className="h-5 w-5 text-blue-600 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-sm text-blue-700 dark:text-blue-400">
              This is a <strong>secondary server</strong> (read-only). To create or edit data, use the main server ({mainStatus?.main_server_ip}).
            </span>
          </div>
        </div>
      )}

      {/* Cluster Overview */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">
              HA Cluster Status
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Cluster ID: <span className="font-mono">{configData?.cluster_id}</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor('online')}`}>
              {getStatusIcon('online')} Active
            </span>
            <button
              onClick={() => refetchStatus()}
              className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              🔄
            </button>
          </div>
        </div>

        {/* Role and Secret (for main only) */}
        {configData?.server_role === 'main' && (
          <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/30 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-medium text-blue-900 dark:text-blue-300">Cluster Secret Key</h4>
                <p className="text-sm text-blue-700 dark:text-blue-400 mt-1">
                  Share this key with secondary servers to join the cluster
                </p>
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(configData?.cluster_secret || '')
                  toast.success('Copied to clipboard')
                }}
                className="px-3 py-1 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
              >
                📋 Copy
              </button>
            </div>
            <div className="mt-3 p-3 bg-white dark:bg-gray-800 rounded font-mono text-sm">
              {configData?.cluster_secret}
            </div>
          </div>
        )}

        {/* Nodes Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">Server</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">Role</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">IP Address</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">Version</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">Status</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">DB Sync</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">Resources</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">Last Seen</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-500 dark:text-gray-400">Actions</th>
              </tr>
            </thead>
            <tbody>
              {statusData?.nodes?.map((node) => (
                <tr key={node.id} className="border-b border-gray-100 dark:border-gray-700">
                  <td className="py-3 px-4">
                    <span className="font-medium text-gray-900 dark:text-white">{node.server_name}</span>
                  </td>
                  <td className="py-3 px-4">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      node.server_role === 'main'
                        ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
                        : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-400'
                    }`}>
                      {node.server_role}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-mono text-sm text-gray-600 dark:text-gray-400">
                    {node.server_ip}
                  </td>
                  <td className="py-3 px-4">
                    <span className="px-2 py-1 rounded text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400">
                      {node.version || 'Unknown'}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(node.status)}`}>
                      {getStatusIcon(node.status)} {node.status}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(node.db_sync_status)}`}>
                      {node.db_sync_status}
                      {node.db_replication_lag > 0 && (
                        <span className="ml-1">({node.db_replication_lag}s lag)</span>
                      )}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">
                    <div className="flex items-center gap-2">
                      <span title="CPU">💻 {node.cpu_usage?.toFixed(0)}%</span>
                      <span title="Memory">🧠 {node.memory_usage?.toFixed(0)}%</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">
                    {node.last_heartbeat
                      ? new Date(node.last_heartbeat).toLocaleTimeString()
                      : 'Never'
                    }
                  </td>
                  <td className="py-3 px-4">
                    {node.server_role !== 'main' && configData?.server_role === 'main' && (
                      <button
                        onClick={() => {
                          if (confirm(`Remove ${node.server_name} from cluster?`)) {
                            removeNodeMutation.mutate(node.id)
                          }
                        }}
                        className="text-red-600 hover:text-red-800 text-sm"
                      >
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Cluster Stats */}
        <div className="mt-6 grid grid-cols-3 gap-4">
          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {statusData?.online_nodes || 0}/{statusData?.total_nodes || 0}
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400">Nodes Online</div>
          </div>
          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {statusData?.db_replication_ok ? '✓' : '✗'}
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400">DB Replication</div>
          </div>
          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
            <div className="text-2xl font-bold text-gray-900 dark:text-white capitalize">
              {configData?.server_role}
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400">This Server Role</div>
          </div>
        </div>
      </div>

      {/* Recent Events */}
      {statusData?.events?.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
            Recent Cluster Events
          </h3>
          <div className="space-y-2">
            {statusData.events.map((event) => (
              <div key={event.id} className={`p-3 rounded-lg ${
                event.severity === 'error' ? 'bg-red-50 dark:bg-red-900/30' :
                event.severity === 'warning' ? 'bg-yellow-50 dark:bg-yellow-900/30' :
                'bg-gray-50 dark:bg-gray-700'
              }`}>
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-900 dark:text-white">{event.event_type}</span>
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    {new Date(event.created_at).toLocaleString()}
                  </span>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{event.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
          Cluster Actions
        </h3>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => refetchStatus()}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            🔄 Force Sync
          </button>
          {configData?.server_role !== 'main' && (
            <button
              onClick={() => {
                if (confirm('Are you sure you want to leave the cluster?')) {
                  leaveClusterMutation.mutate()
                }
              }}
              disabled={leaveClusterMutation.isPending}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
            >
              {leaveClusterMutation.isPending ? 'Leaving...' : '❌ Leave Cluster'}
            </button>
          )}
          {configData?.server_role === 'main' && statusData?.total_nodes === 1 && (
            <button
              onClick={() => {
                if (confirm('Dissolve the cluster and return to standalone mode?')) {
                  leaveClusterMutation.mutate()
                }
              }}
              disabled={leaveClusterMutation.isPending}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
            >
              {leaveClusterMutation.isPending ? 'Dissolving...' : '❌ Dissolve Cluster'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default ClusterTab
