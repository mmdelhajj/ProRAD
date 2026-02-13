import { useState, useEffect } from 'react'
import { networkApi } from '../services/api'
import toast from 'react-hot-toast'
import { ExclamationTriangleIcon, CheckCircleIcon, ClockIcon } from '@heroicons/react/24/outline'

export default function NetworkConfiguration() {
  const [loading, setLoading] = useState(true)
  const [currentConfig, setCurrentConfig] = useState(null)
  const [isDHCP, setIsDHCP] = useState(false)
  const [formData, setFormData] = useState({
    interface: 'eth0',
    ip_address: '',
    gateway: '',
    dns1: '8.8.8.8',
    dns2: '8.8.4.4',
    dns_method: 'netplan', // 'netplan' or 'resolv'
  })
  const [availableInterfaces, setAvailableInterfaces] = useState([])
  const [testMode, setTestMode] = useState(false)
  const [countdown, setCountdown] = useState(60)
  const [testUntil, setTestUntil] = useState(null)

  // Fetch current network configuration and detect DNS method
  useEffect(() => {
    fetchCurrentConfig()
    detectDNSMethod()
  }, [])

  const detectDNSMethod = async () => {
    try {
      const response = await networkApi.detectDNSMethod()
      if (response.data.success) {
        const data = response.data.data

        // Auto-select detected method
        setFormData(prev => ({ ...prev, dns_method: data.detected_method }))

        // Load DNS from detected method
        if (data.detected_method === 'netplan' && data.netplan_dns.length > 0) {
          setFormData(prev => ({
            ...prev,
            dns1: data.netplan_dns[0] || '8.8.8.8',
            dns2: data.netplan_dns[1] || '8.8.4.4'
          }))
        } else if (data.detected_method === 'resolv' && data.resolv_dns.length > 0) {
          setFormData(prev => ({
            ...prev,
            dns1: data.resolv_dns[0] || '8.8.8.8',
            dns2: data.resolv_dns[1] || '8.8.4.4'
          }))
        }
      }
    } catch (error) {
      console.error('Failed to detect DNS method:', error)
    }
  }

  const handleInterfaceChange = (e) => {
    const selectedName = e.target.value;
    const selectedInterface = availableInterfaces.find(iface => iface.name === selectedName);
    
    if (selectedInterface) {
      setFormData(prev => ({
        ...prev,
        interface: selectedInterface.name,
        ip_address: selectedInterface.ip
      }));
      toast.success(`Switched to ${selectedInterface.name} (${selectedInterface.ip})`);
    }
  }

  const fetchCurrentConfig = async () => {
    try {
      setLoading(true)
      const response = await networkApi.getCurrentConfig()
      if (response.data.success) {
        const data = response.data.data
        setCurrentConfig(data)

        // Parse current config and pre-fill form
        if (data.current_ip_info) {
          // Extract ALL physical interfaces (even without IPv4)
          const lines = data.current_ip_info.split('\n');
          const interfaceMap = new Map();
          let currentInterface = null;

          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // Match interface line (e.g., 2: eth0:)
            const interfaceMatch = line.match(/\d+:\s+([^:@\s]+)/);
            if (interfaceMatch) {
              currentInterface = interfaceMatch[1];
              
              // Skip Docker/virtual interfaces
              const isDockerInterface = 
                currentInterface.startsWith('docker') || 
                currentInterface.startsWith('br-') || 
                currentInterface.startsWith('veth');
              
              // Add physical interfaces (even without IP)
              if (currentInterface !== 'lo' && !isDockerInterface) {
                if (!interfaceMap.has(currentInterface)) {
                  interfaceMap.set(currentInterface, {
                    name: currentInterface,
                    ip: 'No IPv4'
                  });
                }
              }
            }

            // Match IP address line (e.g.,  inet 139.162.169.197/24)
            const ipMatch = line.match(/inet\s+(\d+\.\d+\.\d+\.\d+\/\d+)/);
            
            if (ipMatch && currentInterface && interfaceMap.has(currentInterface) && 
                !ipMatch[1].startsWith('127.')) {
              // Update with IPv4 address
              interfaceMap.set(currentInterface, {
                name: currentInterface,
                ip: ipMatch[1]
              });
            }
          }

          // Convert map to array
          const interfaces = Array.from(interfaceMap.values());

          // Store all available interfaces
          setAvailableInterfaces(interfaces);

          // Auto-select first interface with IPv4
          const firstWithIP = interfaces.find(iface => iface.ip !== 'No IPv4');
          const selected = firstWithIP || interfaces[0];
          
          if (selected) {
            setFormData(prev => ({
              ...prev,
              interface: selected.name,
              ip_address: selected.ip !== 'No IPv4' ? selected.ip : ''
            }))
          }
        }
        // Extract gateway from routes (e.g., "default via 139.162.169.1")
        if (data.current_routes) {
          const gatewayMatch = data.current_routes.match(/default via\s+(\d+\.\d+\.\d+\.\d+)/);
          if (gatewayMatch) {
            setFormData(prev => ({ ...prev, gateway: gatewayMatch[1] }))
          }
        }

        // Extract DNS servers from netplan config
        if (data.netplan_config) {
          const lines = data.netplan_config.split('\n');
          const dnsServers = [];
          let inNameservers = false;

          // Detect DHCP configuration
          const hasDHCP = data.netplan_config.includes('dhcp4: true') ||
                          data.netplan_config.includes('dhcp4:true') ||
                          data.netplan_config.includes('dhcp6: true') ||
                          data.netplan_config.includes('dhcp6:true');
          setIsDHCP(hasDHCP);

          if (hasDHCP) {
            toast.warning('⚠️ DHCP Detected: Server is using automatic IP. Consider converting to static IP for stability.', {
              duration: 6000,
            });
          }

          for (const line of lines) {
            if (line.includes('nameservers:')) {
              inNameservers = true;
              continue;
            }
            if (inNameservers && line.includes('addresses:')) {
              continue;
            }
            if (inNameservers && line.trim().startsWith('- ')) {
              const dns = line.trim().replace(/^-\s*/, '');
              dnsServers.push(dns);
            }
            if (inNameservers && !line.trim().startsWith('-') && line.trim() !== '' && !line.includes('addresses:')) {
              inNameservers = false;
            }
          }

          // Update form with parsed DNS
          if (dnsServers.length > 0) {
            setFormData(prev => ({
              ...prev,
              dns1: dnsServers[0] || '8.8.8.8',
              dns2: dnsServers[1] || '8.8.4.4'
            }))
          }
        }
      }
    } catch (error) {
      console.error('Failed to fetch network config:', error)
      toast.error('Failed to load current network configuration')
    } finally {
      setLoading(false)
    }
  }

  // Countdown timer for test mode
  useEffect(() => {
    let timer
    if (testMode && countdown > 0) {
      timer = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            setTestMode(false)
            setTestUntil(null)
            toast.info('Test mode ended - settings reverted')
            return 60
          }
          return prev - 1
        })
      }, 1000)
    }
    return () => clearInterval(timer)
  }, [testMode, countdown])

  const handleChange = async (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }))

    // When DNS method changes, reload DNS from that method
    if (field === 'dns_method') {
      try {
        const response = await networkApi.detectDNSMethod()
        if (response.data.success) {
          const data = response.data.data

          if (value === 'netplan' && data.netplan_dns.length > 0) {
            setFormData(prev => ({
              ...prev,
              dns1: data.netplan_dns[0] || '8.8.8.8',
              dns2: data.netplan_dns[1] || '8.8.4.4',
              dns_method: value
            }))
            toast.success(`Loaded DNS from netplan: ${data.netplan_dns.join(', ')}`, { duration: 3000 })
          } else if (value === 'resolv' && data.resolv_dns.length > 0) {
            setFormData(prev => ({
              ...prev,
              dns1: data.resolv_dns[0] || '8.8.8.8',
              dns2: data.resolv_dns[1] || '8.8.4.4',
              dns_method: value
            }))
            toast.success(`Loaded DNS from resolv.conf: ${data.resolv_dns.join(', ')}`, { duration: 3000 })
          } else {
            toast.info(`No DNS found in ${value}, keeping current values`, { duration: 3000 })
          }
        }
      } catch (error) {
        console.error('Failed to load DNS:', error)
      }
    }
  }

  const handleTest = async () => {
    // Validate required fields
    if (!formData.interface || !formData.ip_address || !formData.gateway) {
      toast.error('Interface, IP address, and gateway are required')
      return
    }

    try {
      setLoading(true)
      const response = await networkApi.testConfig(formData)

      if (response.data.success) {
        if (response.data.test_mode) {
          setTestMode(true)
          setCountdown(response.data.revert_seconds || 60)
          toast.success('TEST MODE: You have 60 seconds to access the new IP and click "Save Changes"', { duration: 8000 })
        } else {
          const message = response.data.message || 'Network configuration saved'
          toast.success(message, { duration: 5000 })
        }
      }
    } catch (error) {
      console.error('Failed to test network config:', error)
      const message = error.response?.data?.message || 'Failed to apply network configuration'
      const details = error.response?.data?.error
      toast.error(details ? `${message}: ${details}` : message, { duration: 8000 })
    } finally {
      setLoading(false)
    }
  }

  const handleApply = async () => {
    try {
      setLoading(true)
      const response = await networkApi.applyConfig(formData)

      if (response.data.success) {
        setTestMode(false)
        setCountdown(60)
        setTestUntil(null)
        toast.success('Network settings applied permanently')
        fetchCurrentConfig() // Refresh current config
      }
    } catch (error) {
      console.error('Failed to apply network config:', error)
      toast.error(error.response?.data?.message || 'Failed to apply network configuration permanently')
    } finally {
      setLoading(false)
    }
  }

  if (loading && !currentConfig) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h4 className="text-lg font-medium text-gray-900 dark:text-white">Network Configuration</h4>
          <p className="text-sm text-gray-500 dark:text-gray-400">Configure server network settings (IP, Gateway, DNS)</p>
        </div>
        <button
          onClick={fetchCurrentConfig}
          disabled={loading}
          className="text-sm text-primary-600 hover:text-primary-700 disabled:opacity-50"
        >
          Refresh
        </button>
      </div>

      {/* DHCP Warning Banner */}
      {isDHCP && (
        <div className="mb-4 bg-orange-50 dark:bg-orange-900/20 border-l-4 border-orange-400 dark:border-orange-600 p-4">
          <div className="flex gap-3">
            <ExclamationTriangleIcon className="w-6 h-6 text-orange-600 dark:text-orange-500 flex-shrink-0" />
            <div className="flex-1">
              <h5 className="text-sm font-semibold text-orange-800 dark:text-orange-400 mb-1">
                ⚠️ DHCP Detected - Automatic IP Configuration
              </h5>
              <p className="text-sm text-orange-700 dark:text-orange-300 mb-2">
                Your server is currently using <strong>DHCP (automatic IP assignment)</strong>. This means your IP address may change unexpectedly,
                causing service interruptions.
              </p>
              <div className="text-sm text-orange-700 dark:text-orange-300 space-y-1">
                <p><strong>Current DHCP-assigned values:</strong></p>
                <ul className="list-disc list-inside ml-2 space-y-1">
                  <li>IP Address: {formData.ip_address || 'Loading...'}</li>
                  <li>Gateway: {formData.gateway || 'Loading...'}</li>
                  <li>DNS: {formData.dns1}, {formData.dns2}</li>
                </ul>
              </div>
              <div className="mt-3 p-3 bg-orange-100 dark:bg-orange-900/40 rounded border border-orange-200 dark:border-orange-700">
                <p className="text-sm font-medium text-orange-900 dark:text-orange-200">
                  💡 <strong>Recommendation:</strong> Click "Test Configuration" below to convert DHCP to a permanent static IP.
                  This will ensure your server maintains the same IP address and prevents connectivity issues.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Warning Banner */}
      <div className="mb-6 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
        <div className="flex gap-3">
          <ExclamationTriangleIcon className="w-5 h-5 text-yellow-600 dark:text-yellow-500 flex-shrink-0 mt-0.5" />
          <div>
            <h5 className="text-sm font-medium text-yellow-800 dark:text-yellow-500">Caution: Network Configuration</h5>
            <p className="text-sm text-yellow-700 dark:text-yellow-400 mt-1">
              Changing network settings incorrectly may cause loss of connectivity. Always test first before applying permanently.
              Test mode will automatically revert after 60 seconds if not confirmed.
            </p>
          </div>
        </div>
      </div>

      {/* Test Mode Active Banner */}
      {testMode && (
        <div className="mb-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex gap-3">
              <ClockIcon className="w-5 h-5 text-blue-600 dark:text-blue-500 flex-shrink-0" />
              <div>
                <h5 className="text-sm font-medium text-blue-800 dark:text-blue-500">Test Mode Active</h5>
                <p className="text-sm text-blue-700 dark:text-blue-400 mt-1">
                  Settings will auto-revert in <strong>{countdown}</strong> seconds. Click "Apply Permanently" to keep these settings.
                </p>
              </div>
            </div>
            <button
              onClick={handleApply}
              disabled={loading}
              className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-md disabled:opacity-50"
            >
              <CheckCircleIcon className="w-4 h-4 mr-2" />
              {isDHCP ? 'Confirm: Convert to Static IP' : 'Apply Permanently'}
            </button>
          </div>
        </div>
      )}

      {/* Network Configuration Form */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Network Interface */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Network Interface
          </label>
          {availableInterfaces.length >= 1 ? (
            <select
              value={formData.interface}
              onChange={handleInterfaceChange}
              className="block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
            >
              {availableInterfaces.map((iface) => (
                <option key={iface.name} value={iface.name}>
                  {iface.name} ({iface.ip})
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={formData.interface}
              onChange={(e) => handleChange('interface', e.target.value)}
              placeholder="eth0, ens3, enp0s3"
              className="block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
            />
          )}
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {availableInterfaces.length >= 1
              ? `${availableInterfaces.length} interface${availableInterfaces.length > 1 ? 's' : ''} detected`
              : 'Common: eth0, ens3, enp0s3'}
          </p>
        </div>

        {/* IP Address / CIDR */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            IP Address / CIDR
          </label>
          <input
            type="text"
            value={formData.ip_address}
            onChange={(e) => handleChange('ip_address', e.target.value)}
            placeholder="192.168.1.100/24"
            className="block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Example: 192.168.1.100/24
          </p>
        </div>

        {/* Gateway */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Gateway
          </label>
          <input
            type="text"
            value={formData.gateway}
            onChange={(e) => handleChange('gateway', e.target.value)}
            placeholder="192.168.1.1"
            className="block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Example: 192.168.1.1
          </p>
        </div>

        {/* Primary DNS */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Primary DNS
          </label>
          <input
            type="text"
            value={formData.dns1}
            onChange={(e) => handleChange('dns1', e.target.value)}
            placeholder="8.8.8.8"
            className="block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Default: 8.8.8.8 (Google DNS)
          </p>
        </div>

        {/* Secondary DNS */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Secondary DNS
          </label>
          <input
            type="text"
            value={formData.dns2}
            onChange={(e) => handleChange('dns2', e.target.value)}
            placeholder="8.8.4.4"
            className="block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Default: 8.8.4.4 (Google DNS)
          </p>
        </div>

        {/* DNS Configuration Method */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            DNS Configuration Method
          </label>
          <select
            value={formData.dns_method}
            onChange={(e) => handleChange('dns_method', e.target.value)}
            className="block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
          >
            <option value="netplan">Netplan + systemd-resolved (Ubuntu/Debian)</option>
            <option value="resolv">Direct /etc/resolv.conf (Traditional)</option>
          </select>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Netplan: Modern Ubuntu/Debian | resolv.conf: Traditional/Other distros
          </p>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="mt-6 flex gap-4">
        <button
          onClick={handleTest}
          disabled={loading || testMode}
          className="inline-flex items-center px-6 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-md disabled:opacity-50"
        >
          {loading ? 'Applying...' : isDHCP ? 'Convert DHCP → Static (Test 60s)' : 'Test (60s)'}
        </button>

        {testMode && (
          <button
            onClick={() => {
              setTestMode(false)
              setCountdown(60)
              setTestUntil(null)
              toast.info('Test mode cancelled')
            }}
            className="inline-flex items-center px-6 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600"
          >
            Cancel Test
          </button>
        )}
      </div>

      {/* Current Configuration - Removed (too much technical info) */}
    </div>
  )
}
