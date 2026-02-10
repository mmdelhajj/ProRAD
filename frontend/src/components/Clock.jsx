import { useState, useEffect } from 'react'
import { ClockIcon } from '@heroicons/react/24/outline'
import { fetchTimezone, getTimezone, onTimezoneChange } from '../utils/timezone'

export default function Clock() {
  const [time, setTime] = useState('')
  const [date, setDate] = useState('')
  const [timezone, setTimezone] = useState(getTimezone() || '')

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
    </div>
  )
}
