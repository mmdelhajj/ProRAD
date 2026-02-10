import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../services/api'
import { ArrowDownTrayIcon, XMarkIcon } from '@heroicons/react/24/outline'

export default function UpdateNotification() {
  const [showPopup, setShowPopup] = useState(false)

  // Check for updates
  const { data: updateData } = useQuery({
    queryKey: ['update-check'],
    queryFn: () => api.get('/system/update/check').then(res => res.data),
    staleTime: 30 * 60 * 1000,
    refetchInterval: 30 * 60 * 1000,
    retry: false,
  })

  // Don't show if no update available
  if (!updateData?.update_available) return null

  const isCritical = updateData?.is_critical
  const newVersion = updateData?.new_version || updateData?.version

  const scrollToUpdateBanner = () => {
    setShowPopup(false)
    // Scroll to top where the banner is
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="relative">
      {/* Notification Icon */}
      <button
        onClick={() => setShowPopup(!showPopup)}
        className={`relative p-1.5 rounded-lg transition-colors ${
          isCritical
            ? 'text-orange-600 hover:bg-orange-50'
            : 'text-blue-600 hover:bg-blue-50'
        }`}
        title={`Update available: v${newVersion}`}
      >
        <ArrowDownTrayIcon className="w-5 h-5" />
        {/* Badge */}
        <span className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ${
          isCritical ? 'bg-orange-500' : 'bg-blue-500'
        } animate-pulse`} />
      </button>

      {/* Popup */}
      {showPopup && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShowPopup(false)}
          />

          {/* Popup content */}
          <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-gray-800 rounded-lg shadow-lg border z-50">
            <div className="p-3">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <ArrowDownTrayIcon className={`w-5 h-5 ${isCritical ? 'text-orange-500' : 'text-blue-500'}`} />
                  <span className="font-medium text-sm text-gray-900 dark:text-white">
                    {isCritical ? 'Critical Update' : 'Update Available'}
                  </span>
                </div>
                <button
                  onClick={() => setShowPopup(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <XMarkIcon className="w-4 h-4" />
                </button>
              </div>

              <p className="text-xs text-gray-600 mb-3">
                Version {newVersion} is available.
                {isCritical && (
                  <span className="block mt-1 text-orange-600 font-medium">
                    This is a critical security update.
                  </span>
                )}
              </p>

              <button
                onClick={scrollToUpdateBanner}
                className={`w-full text-xs font-medium py-2 px-3 rounded ${
                  isCritical
                    ? 'bg-orange-500 text-white hover:bg-orange-600'
                    : 'bg-blue-500 text-white hover:bg-blue-600'
                }`}
              >
                View Update Details
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
