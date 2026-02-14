import { useState, useEffect } from 'react'
import { ClockIcon, ArrowPathIcon } from '@heroicons/react/24/outline'
import { fetchTimezone, getTimezone, onTimezoneChange } from '../utils/timezone'
import api from '../services/api'

export default function Clock() {
  const [time, setTime] = useState('')
  const [date, setDate] = useState('')
  const [timezone, setTimezone] = useState(getTimezone() || '')
  const [uptime, setUptime] = useState(null)

  // Fetch uptime every 60 seconds
  useEffect(() => {
    const fetchUptime = () => {
      api.get('/dashboard/system-info').then(res => {
        if (res.data?.data?.uptime_seconds) {
          setUptime(res.data.data.uptime_seconds)
        }
      }).catch(() => {})
    }
    fetchUptime()
    const uptimeInterval = setInterval(fetchUptime, 60000)
    return () => clearInterval(uptimeInterval)
  }, [])

  // Increment uptime locally every second
  useEffect(() => {
    if (uptime === null) return
    const interval = setInterval(() => {
      setUptime(prev => prev + 1)
    }, 1000)
    return () => clearInterval(interval)
  }, [uptime !== null])

  const formatUptime = (seconds) => {
    if (!seconds) return ''
    const days = Math.floor(seconds / 86400)
    const hours = Math.floor((seconds % 86400) / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    if (days > 0) return `${days}d ${hours}h ${minutes}m`
    if (hours > 0) return `${hours}h ${minutes}m`
    return `${minutes}m`
  }

  // Subscribe to timezone changes
  useEffect(() => {
    // Fetch timezone if not already loaded
    if (!timezone) {
      fetchTimezone().then(tz => {
        if (tz) setTimezone(tz)
      })
    }

    // Listen for timezone changes
    const unsubscribe = onTimezoneChange((tz) => {
      setTimezone(tz)
    })

    return () => unsubscribe()
  }, [])

  // Update clock every second using server timezone
  useEffect(() => {
    const updateClock = () => {
      const now = new Date()
      const tzOptions = timezone ? { timeZone: timezone } : {}
      setTime(now.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
        ...tzOptions
      }))
      setDate(now.toLocaleDateString('en-US', {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        ...tzOptions
      }))
    }

    updateClock() // Initial update
    const interval = setInterval(updateClock, 1000)
    return () => clearInterval(interval)
  }, [timezone])

  return (
    <div className="flex items-center gap-3 text-sm">
      <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
        <ClockIcon className="w-4 h-4" />
        <span className="font-mono font-medium text-gray-700 dark:text-gray-200">{time || '--:--:--'}</span>
      </div>
      <div className="hidden sm:block text-gray-400 dark:text-gray-500">|</div>
      <div className="hidden sm:block text-gray-500 dark:text-gray-400">{date || '---'}</div>
      {timezone && (
        <>
          <div className="hidden md:block text-gray-400 dark:text-gray-500">|</div>
          <div className="hidden md:block text-xs text-gray-400 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded">
            {timezone}
          </div>
        </>
      )}
      {uptime !== null && (
        <>
          <div className="hidden lg:block text-gray-400 dark:text-gray-500">|</div>
          <div className="hidden lg:flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
            <ArrowPathIcon className="w-3.5 h-3.5" />
            <span>Uptime: {formatUptime(uptime)}</span>
          </div>
        </>
      )}
    </div>
  )
}
