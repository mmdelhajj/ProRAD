import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { nasApi, diagnosticApi } from '../services/api'
import { useAuthStore } from '../store/authStore'
import {
  WrenchScrewdriverIcon,
  SignalIcon,
  MapPinIcon,
  GlobeAltIcon,
  MagnifyingGlassIcon,
  PlayIcon,
  ArrowPathIcon,
  StopIcon,
} from '@heroicons/react/24/outline'
import clsx from 'clsx'

const TABS = [
  { id: 'ping', name: 'Ping', icon: SignalIcon },
  { id: 'traceroute', name: 'Traceroute', icon: MapPinIcon },
  { id: 'nslookup', name: 'NSLookup', icon: GlobeAltIcon },
]

const PACKET_SIZES = [64, 500, 1000, 1400, 1500, 8000, 16000, 32000, 64000]

export default function DiagnosticTools() {
  const [activeTab, setActiveTab] = useState('ping')
  const [selectedNasId, setSelectedNasId] = useState('')

  // Ping state
  const [pingTarget, setPingTarget] = useState('')
  const [pingSize, setPingSize] = useState(64)
  const [pingCount, setPingCount] = useState(50)
  const [pingLines, setPingLines] = useState([])
  const [pingStreaming, setPingStreaming] = useState(false)
  const abortRef = useRef(null)
  const scrollRef = useRef(null)

  // Subscriber search state
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [searchLoading, setSearchLoading] = useState(false)
  const searchTimeout = useRef(null)
  const dropdownRef = useRef(null)

  // Traceroute state
  const [traceTarget, setTraceTarget] = useState('')
  const [traceResult, setTraceResult] = useState(null)
  const [traceLoading, setTraceLoading] = useState(false)

  // NSLookup state
  const [nslookupDomain, setNslookupDomain] = useState('')
  const [nslookupResult, setNslookupResult] = useState(null)
  const [nslookupLoading, setNslookupLoading] = useState(false)

  // Fetch NAS list
  const { data: nasData } = useQuery({
    queryKey: ['nas-list'],
    queryFn: () => nasApi.list(),
    select: (res) => res.data?.data || [],
  })

  const nasList = nasData || []

  // Auto-select NAS if only one
  useEffect(() => {
    if (nasList.length === 1 && !selectedNasId) {
      setSelectedNasId(String(nasList[0].id))
    }
  }, [nasList, selectedNasId])

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Auto-scroll ping terminal
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [pingLines])

  // Subscriber search with debounce
  const handleSearchChange = useCallback((value) => {
    setSearchQuery(value)
    setPingTarget(value)

    if (searchTimeout.current) clearTimeout(searchTimeout.current)

    if (value.length < 2) {
      setSearchResults([])
      setShowDropdown(false)
      return
    }

    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(value)) {
      setShowDropdown(false)
      return
    }

    setSearchLoading(true)
    searchTimeout.current = setTimeout(async () => {
      try {
        const res = await diagnosticApi.searchSubscribers(selectedNasId || 0, value)
        const data = res.data?.data || []
        setSearchResults(data)
        setShowDropdown(data.length > 0)
      } catch {
        setSearchResults([])
        setShowDropdown(false)
      } finally {
        setSearchLoading(false)
      }
    }, 300)
  }, [selectedNasId])

  const selectSubscriber = (sub) => {
    const ip = sub.static_ip || sub.ip_address || ''
    setPingTarget(ip)
    setSearchQuery(ip)
    setShowDropdown(false)
  }

  // Live streaming ping handler
  const handlePing = async () => {
    if (!selectedNasId || !pingTarget) return
    if (pingStreaming) {
      // Stop current ping
      if (abortRef.current) abortRef.current.abort()
      return
    }

    setPingLines([])
    setPingStreaming(true)
    const controller = new AbortController()
    abortRef.current = controller

    try {
      const token = useAuthStore.getState().token
      const response = await fetch('/api/diagnostic/ping-stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          nas_id: Number(selectedNasId),
          target: pingTarget,
          size: pingSize,
          count: pingCount,
        }),
        signal: controller.signal,
      })

      if (!response.ok) {
        const text = await response.text()
        let msg = 'Ping failed'
        try { msg = JSON.parse(text).message || msg } catch {}
        setPingLines([{ text: `Error: ${msg}`, color: 'red' }])
        setPingStreaming(false)
        return
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop()
        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const data = JSON.parse(line)
            handlePingEvent(data)
          } catch {}
        }
      }
      // Process remaining buffer
      if (buffer.trim()) {
        try {
          handlePingEvent(JSON.parse(buffer))
        } catch {}
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        setPingLines(prev => [...prev, { text: `Error: ${err.message}`, color: 'red' }])
      }
    } finally {
      setPingStreaming(false)
      abortRef.current = null
    }
  }

  const handlePingEvent = (data) => {
    switch (data.type) {
      case 'start':
        setPingLines(prev => [...prev,
          { text: `Pinging ${data.target} via ${data.nas} (size=${data.size}, count=${data.count}):`, color: 'white' },
          { text: '', color: 'white' },
        ])
        break
      case 'reply':
        setPingLines(prev => [...prev,
          { text: `  seq=${data.seq}  Reply from ${data.host}: bytes=${data.size} time=${data.time.toFixed(2)}ms TTL=${data.ttl}`, color: 'green' },
        ])
        break
      case 'timeout':
        setPingLines(prev => [...prev,
          { text: `  seq=${data.seq}  Request timed out.`, color: 'red' },
        ])
        break
      case 'error':
        setPingLines(prev => [...prev,
          { text: `Error: ${data.message}`, color: 'red' },
        ])
        break
      case 'stats':
        setPingLines(prev => [...prev,
          { text: '', color: 'white' },
          { text: `Ping statistics for ${data.target}:`, color: 'cyan' },
          { text: `    Packets: Sent = ${data.sent}, Received = ${data.received}, Lost = ${data.lost} (${data.loss}% loss)`, color: data.lost > 0 ? 'yellow' : 'white' },
          ...(data.received > 0 ? [
            { text: `Approximate round trip times in milli-seconds:`, color: 'cyan' },
            { text: `    Minimum = ${data.min.toFixed(2)}ms, Maximum = ${data.max.toFixed(2)}ms, Average = ${data.avg.toFixed(2)}ms`, color: 'white' },
          ] : []),
        ])
        break
    }
  }

  // Traceroute handler
  const handleTraceroute = async () => {
    if (!traceTarget) return
    setTraceLoading(true)
    setTraceResult(null)
    try {
      const res = await diagnosticApi.traceroute({
        target: traceTarget,
      })
      setTraceResult(res.data?.data)
    } catch (err) {
      setTraceResult({ error: err.response?.data?.message || err.message, hops: [] })
    } finally {
      setTraceLoading(false)
    }
  }

  // NSLookup handler
  const handleNslookup = async () => {
    if (!nslookupDomain) return
    setNslookupLoading(true)
    setNslookupResult(null)
    try {
      const res = await diagnosticApi.nslookup({ domain: nslookupDomain })
      setNslookupResult(res.data?.data)
    } catch (err) {
      setNslookupResult({ error: err.response?.data?.message || err.message })
    } finally {
      setNslookupLoading(false)
    }
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <WrenchScrewdriverIcon className="h-7 w-7 sm:h-8 sm:w-8 text-primary-600 dark:text-primary-400 flex-shrink-0" />
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Diagnostic Tools</h1>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 hidden sm:block">Network diagnostic tools via MikroTik routers</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="-mb-px flex space-x-4 sm:space-x-8 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={clsx(
                'group inline-flex items-center gap-1.5 sm:gap-2 py-3 sm:py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap',
                activeTab === tab.id
                  ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
              )}
            >
              <tab.icon className="h-5 w-5" />
              {tab.name}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'ping' && (
        <PingTab
          nasList={nasList}
          selectedNasId={selectedNasId}
          setSelectedNasId={setSelectedNasId}
          pingTarget={pingTarget}
          searchQuery={searchQuery}
          handleSearchChange={handleSearchChange}
          searchResults={searchResults}
          showDropdown={showDropdown}
          setShowDropdown={setShowDropdown}
          searchLoading={searchLoading}
          selectSubscriber={selectSubscriber}
          dropdownRef={dropdownRef}
          pingSize={pingSize}
          setPingSize={setPingSize}
          pingCount={pingCount}
          setPingCount={setPingCount}
          pingLines={pingLines}
          pingStreaming={pingStreaming}
          handlePing={handlePing}
          scrollRef={scrollRef}
        />
      )}

      {activeTab === 'traceroute' && (
        <TracerouteTab
          traceTarget={traceTarget}
          setTraceTarget={setTraceTarget}
          traceResult={traceResult}
          traceLoading={traceLoading}
          handleTraceroute={handleTraceroute}
        />
      )}

      {activeTab === 'nslookup' && (
        <NslookupTab
          nslookupDomain={nslookupDomain}
          setNslookupDomain={setNslookupDomain}
          nslookupResult={nslookupResult}
          nslookupLoading={nslookupLoading}
          handleNslookup={handleNslookup}
        />
      )}
    </div>
  )
}

function PingTab({
  nasList, selectedNasId, setSelectedNasId,
  pingTarget, searchQuery, handleSearchChange,
  searchResults, showDropdown, setShowDropdown, searchLoading, selectSubscriber, dropdownRef,
  pingSize, setPingSize, pingCount, setPingCount,
  pingLines, pingStreaming, handlePing, scrollRef,
}) {
  const lineColors = {
    green: 'text-green-400',
    red: 'text-red-400',
    yellow: 'text-yellow-400',
    cyan: 'text-cyan-400',
    white: 'text-gray-300',
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6">
        <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white mb-3 sm:mb-4">Ping Configuration</h3>

        {/* Row 1: NAS + Target */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-3 sm:mb-4">
          {/* NAS Dropdown */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">NAS / Router</label>
            <select
              value={selectedNasId}
              onChange={(e) => setSelectedNasId(e.target.value)}
              className="input w-full dark:bg-gray-700 dark:text-white dark:border-gray-600"
            >
              <option value="">-- Select NAS --</option>
              {nasList.map((nas) => (
                <option key={nas.id} value={nas.id}>{nas.name} ({nas.ip_address})</option>
              ))}
            </select>
          </div>

          {/* Target IP / User Search */}
          <div className="relative" ref={dropdownRef}>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Target (IP or Username)</label>
            <div className="relative">
              <input
                type="text"
                value={searchQuery || pingTarget}
                onChange={(e) => handleSearchChange(e.target.value)}
                onFocus={() => searchResults.length > 0 && setShowDropdown(true)}
                placeholder="IP or search user..."
                className="input w-full pr-8 dark:bg-gray-700 dark:text-white dark:border-gray-600"
                onKeyDown={(e) => e.key === 'Enter' && handlePing()}
              />
              {searchLoading && (
                <ArrowPathIcon className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 animate-spin" />
              )}
            </div>
            {/* Autocomplete Dropdown */}
            {showDropdown && searchResults.length > 0 && (
              <div className="absolute z-50 mt-1 w-full bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                {searchResults.map((sub) => (
                  <button
                    key={sub.id}
                    onClick={() => selectSubscriber(sub)}
                    className="w-full text-left px-3 sm:px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-600 flex items-center justify-between border-b border-gray-100 dark:border-gray-600 last:border-0 gap-2"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="font-medium text-gray-900 dark:text-white text-sm truncate">{sub.username}</span>
                      <span className={clsx('ml-1.5 inline-flex items-center text-xs px-1.5 py-0.5 rounded-full',
                        sub.is_online
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-gray-100 text-gray-500 dark:bg-gray-600 dark:text-gray-400'
                      )}>
                        {sub.is_online ? 'Online' : 'Offline'}
                      </span>
                    </div>
                    <span className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 font-mono flex-shrink-0">
                      {sub.static_ip || sub.ip_address || 'No IP'}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Row 2: Size + Count + Button */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
          {/* Packet Size */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Packet Size</label>
            <select
              value={pingSize}
              onChange={(e) => setPingSize(Number(e.target.value))}
              className="input w-full dark:bg-gray-700 dark:text-white dark:border-gray-600"
            >
              {PACKET_SIZES.map((size) => (
                <option key={size} value={size}>{size} bytes</option>
              ))}
            </select>
          </div>

          {/* Count */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Count</label>
            <input
              type="number"
              value={pingCount}
              onChange={(e) => setPingCount(Math.min(100, Math.max(1, Number(e.target.value))))}
              min="1"
              max="100"
              className="input w-full dark:bg-gray-700 dark:text-white dark:border-gray-600"
            />
          </div>

          {/* Run/Stop Ping Button */}
          <div className="col-span-2 sm:col-span-1 flex items-end">
            <button
              onClick={handlePing}
              disabled={!pingStreaming && (!selectedNasId || !pingTarget)}
              className={clsx(
                'flex items-center justify-center gap-2 w-full font-medium py-2 px-4 rounded-lg transition-colors',
                pingStreaming
                  ? 'bg-red-600 hover:bg-red-700 text-white'
                  : 'btn btn-primary'
              )}
            >
              {pingStreaming ? (
                <>
                  <StopIcon className="h-4 w-4" />
                  Stop
                </>
              ) : (
                <>
                  <PlayIcon className="h-4 w-4" />
                  Run Ping
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Live Terminal Output */}
      {(pingLines.length > 0 || pingStreaming) && (
        <div className="bg-gray-900 rounded-lg shadow overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
            <div className="flex items-center gap-2">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                <div className="w-3 h-3 rounded-full bg-green-500"></div>
              </div>
              <span className="text-xs text-gray-400 ml-2">Ping</span>
            </div>
            {pingStreaming && (
              <div className="flex items-center gap-1.5 text-xs text-green-400">
                <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></div>
                Live
              </div>
            )}
          </div>
          <div
            ref={scrollRef}
            className="p-3 sm:p-4 font-mono text-xs sm:text-sm max-h-[500px] overflow-y-auto"
          >
            {pingLines.map((line, i) => (
              <div key={i} className={lineColors[line.color] || 'text-gray-300'}>
                {line.text || '\u00A0'}
              </div>
            ))}
            {pingStreaming && (
              <div className="text-green-400 animate-pulse inline-block">_</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function TracerouteTab({
  traceTarget, setTraceTarget,
  traceResult, traceLoading, handleTraceroute,
}) {
  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6">
        <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white mb-3 sm:mb-4">Traceroute Configuration</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Runs from server. Public IPs and hostnames only.</p>
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mb-3 sm:mb-4">
          {/* Target */}
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Target (Public IP or Hostname)</label>
            <input
              type="text"
              value={traceTarget}
              onChange={(e) => setTraceTarget(e.target.value)}
              placeholder="e.g., 8.8.8.8 or google.com"
              className="input w-full dark:bg-gray-700 dark:text-white dark:border-gray-600"
              onKeyDown={(e) => e.key === 'Enter' && handleTraceroute()}
            />
          </div>

          <div className="flex items-end">
            <button
              onClick={handleTraceroute}
              disabled={traceLoading || !traceTarget}
              className="btn btn-primary flex items-center justify-center gap-2 w-full sm:w-auto"
            >
              {traceLoading ? (
                <ArrowPathIcon className="h-4 w-4 animate-spin" />
              ) : (
                <PlayIcon className="h-4 w-4" />
              )}
              Run Traceroute
            </button>
          </div>
        </div>
      </div>

      {/* Loading */}
      {traceLoading && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 text-center">
          <ArrowPathIcon className="h-8 w-8 animate-spin mx-auto text-primary-500 mb-2" />
          <p className="text-gray-500 dark:text-gray-400">Running traceroute... this may take up to 30 seconds</p>
        </div>
      )}

      {/* Results */}
      {traceResult && !traceLoading && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6">
          <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white mb-3">
            Traceroute to {traceResult.target} from {traceResult.source || 'Server'}
          </h3>

          {traceResult.error && (
            <p className="text-red-600 dark:text-red-400 mb-3">{traceResult.error}</p>
          )}

          {traceResult.hops && traceResult.hops.length > 0 ? (
            <>
              {/* Desktop table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                      {['Hop', 'Address', 'Loss', 'Last', 'Avg', 'Best', 'Worst'].map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {traceResult.hops.map((hop) => (
                      <tr key={hop.hop} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <td className="px-4 py-2 text-sm font-medium text-gray-900 dark:text-white">{hop.hop}</td>
                        <td className="px-4 py-2 text-sm font-mono text-gray-700 dark:text-gray-300">{hop.address || '*'}</td>
                        <td className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">{hop.loss || '0%'}</td>
                        <td className="px-4 py-2 text-sm font-mono text-gray-700 dark:text-gray-300">{hop.last ? `${hop.last.toFixed(1)} ms` : '-'}</td>
                        <td className="px-4 py-2 text-sm font-mono text-gray-700 dark:text-gray-300">{hop.avg ? `${hop.avg.toFixed(1)} ms` : '-'}</td>
                        <td className="px-4 py-2 text-sm font-mono text-gray-700 dark:text-gray-300">{hop.best ? `${hop.best.toFixed(1)} ms` : '-'}</td>
                        <td className="px-4 py-2 text-sm font-mono text-gray-700 dark:text-gray-300">{hop.worst ? `${hop.worst.toFixed(1)} ms` : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="sm:hidden space-y-2">
                {traceResult.hops.map((hop) => (
                  <div key={hop.hop} className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-bold text-gray-900 dark:text-white">Hop {hop.hop}</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">Loss: {hop.loss || '0%'}</span>
                    </div>
                    <div className="font-mono text-sm text-primary-600 dark:text-primary-400 mb-1.5">{hop.address || '* * *'}</div>
                    <div className="grid grid-cols-4 gap-1 text-xs">
                      <div className="text-center">
                        <div className="text-gray-500 dark:text-gray-400">Last</div>
                        <div className="font-mono text-gray-800 dark:text-gray-200">{hop.last ? `${hop.last.toFixed(1)}` : '-'}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-gray-500 dark:text-gray-400">Avg</div>
                        <div className="font-mono text-gray-800 dark:text-gray-200">{hop.avg ? `${hop.avg.toFixed(1)}` : '-'}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-gray-500 dark:text-gray-400">Best</div>
                        <div className="font-mono text-green-600 dark:text-green-400">{hop.best ? `${hop.best.toFixed(1)}` : '-'}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-gray-500 dark:text-gray-400">Worst</div>
                        <div className="font-mono text-red-600 dark:text-red-400">{hop.worst ? `${hop.worst.toFixed(1)}` : '-'}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            !traceResult.error && <p className="text-gray-500 dark:text-gray-400">No hops returned</p>
          )}
        </div>
      )}
    </div>
  )
}

function NslookupTab({
  nslookupDomain, setNslookupDomain,
  nslookupResult, nslookupLoading, handleNslookup,
}) {
  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6">
        <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white mb-3 sm:mb-4">DNS Lookup</h3>
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Domain Name</label>
            <input
              type="text"
              value={nslookupDomain}
              onChange={(e) => setNslookupDomain(e.target.value)}
              placeholder="e.g., google.com"
              className="input w-full dark:bg-gray-700 dark:text-white dark:border-gray-600"
              onKeyDown={(e) => e.key === 'Enter' && handleNslookup()}
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={handleNslookup}
              disabled={nslookupLoading || !nslookupDomain}
              className="btn btn-primary flex items-center justify-center gap-2 w-full sm:w-auto"
            >
              {nslookupLoading ? (
                <ArrowPathIcon className="h-4 w-4 animate-spin" />
              ) : (
                <MagnifyingGlassIcon className="h-4 w-4" />
              )}
              Lookup
            </button>
          </div>
        </div>
      </div>

      {nslookupResult && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6">
          <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white mb-3 sm:mb-4">
            DNS Records for {nslookupResult.domain}
          </h3>

          {nslookupResult.error && (
            <p className="text-red-600 dark:text-red-400 mb-3">{nslookupResult.error}</p>
          )}

          {nslookupResult.records && (
            <div className="space-y-4">
              {nslookupResult.records.a && nslookupResult.records.a.length > 0 && (
                <RecordSection title="A Records (IPv4)" items={nslookupResult.records.a} />
              )}
              {nslookupResult.records.aaaa && nslookupResult.records.aaaa.length > 0 && (
                <RecordSection title="AAAA Records (IPv6)" items={nslookupResult.records.aaaa} />
              )}
              {nslookupResult.records.cname && (
                <RecordSection title="CNAME" items={[nslookupResult.records.cname]} />
              )}
              {nslookupResult.records.mx && nslookupResult.records.mx.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">MX Records (Mail)</h4>
                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 space-y-1">
                    {nslookupResult.records.mx.map((mx, i) => (
                      <div key={i} className="font-mono text-xs sm:text-sm text-gray-800 dark:text-gray-200 break-all">
                        Priority: {mx.priority} &mdash; {mx.host}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {nslookupResult.records.ns && nslookupResult.records.ns.length > 0 && (
                <RecordSection title="NS Records (Nameservers)" items={nslookupResult.records.ns} />
              )}
              {nslookupResult.records.txt && nslookupResult.records.txt.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">TXT Records</h4>
                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 space-y-1">
                    {nslookupResult.records.txt.map((txt, i) => (
                      <div key={i} className="font-mono text-xs text-gray-800 dark:text-gray-200 break-all">{txt}</div>
                    ))}
                  </div>
                </div>
              )}
              {!nslookupResult.records.a?.length && !nslookupResult.records.aaaa?.length && !nslookupResult.records.cname && !nslookupResult.records.mx?.length && !nslookupResult.records.ns?.length && !nslookupResult.records.txt?.length && (
                <p className="text-gray-500 dark:text-gray-400">No DNS records found for this domain.</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function RecordSection({ title, items }) {
  return (
    <div>
      <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">{title}</h4>
      <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 space-y-1">
        {items.map((item, i) => (
          <div key={i} className="font-mono text-xs sm:text-sm text-gray-800 dark:text-gray-200 break-all">{item}</div>
        ))}
      </div>
    </div>
  )
}
