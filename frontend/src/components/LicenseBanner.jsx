import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import api from '../services/api'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { useState } from 'react'

export default function LicenseBanner() {
  const [dismissed, setDismissed] = useState(false)

  const { data: licenseData } = useQuery({
    queryKey: ['license-status'],
    queryFn: () => api.get('/license').then(res => res.data.data),
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    refetchInterval: 5 * 60 * 1000, // Refetch every 5 minutes
    retry: false,
  })

  // Don't show banner if dismissed or no data
  if (dismissed || !licenseData) return null

  // Determine what type of warning to show
  let bannerType = null
  let message = ''
  let submessage = ''
  let canDismiss = true

  if (!licenseData.valid) {
    // License is invalid - suspended, expired, or revoked
    bannerType = 'error'
    canDismiss = false

    if (licenseData.message?.toLowerCase().includes('suspended')) {
      message = 'Your license has been suspended'
      submessage = 'Please contact support to reactivate your license. Some features may be restricted.'
    } else if (licenseData.message?.toLowerCase().includes('expired')) {
      message = 'Your license has expired'
      submessage = 'Please renew your license to continue using all features.'
    } else if (licenseData.message?.toLowerCase().includes('revoked')) {
      message = 'Your license has been revoked'
      submessage = 'Please contact support for assistance.'
    } else {
      message = 'License validation failed'
      submessage = licenseData.message || 'Please contact support.'
    }
  } else if (licenseData.grace_period) {
    // License is in grace period
    bannerType = 'warning'
    canDismiss = false
    message = 'Your license is in grace period'
    submessage = `Please renew immediately to avoid service interruption. ${licenseData.days_remaining || 0} days remaining.`
  } else if (licenseData.days_remaining !== undefined && licenseData.days_remaining <= 7 && !licenseData.is_lifetime) {
    // License expiring soon (7 days or less)
    bannerType = 'warning'
    message = `Your license expires in ${licenseData.days_remaining} day${licenseData.days_remaining !== 1 ? 's' : ''}`
    submessage = 'Please renew soon to avoid service interruption.'
  }

  // No warning needed
  if (!bannerType) return null

  const bgColor = bannerType === 'error'
    ? 'bg-red-600'
    : 'bg-yellow-500'

  const textColor = bannerType === 'error'
    ? 'text-white'
    : 'text-yellow-900'

  return (
    <div className={`${bgColor} ${textColor} px-4 py-2`}>
      <div className="flex items-center justify-between max-w-7xl mx-auto">
        <div className="flex items-center gap-3">
          <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {bannerType === 'error' ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            )}
          </svg>
          <div>
            <span className="font-medium">{message}</span>
            {submessage && (
              <span className="ml-2 text-sm opacity-90">
                {submessage}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/settings"
            onClick={() => {
              // Switch to license tab when navigating
              sessionStorage.setItem('settings-tab', 'license')
            }}
            className={`text-sm font-medium underline hover:no-underline ${textColor}`}
          >
            View License
          </Link>
          {canDismiss && (
            <button
              onClick={() => setDismissed(true)}
              className={`p-1 rounded hover:bg-black/10 ${textColor}`}
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
