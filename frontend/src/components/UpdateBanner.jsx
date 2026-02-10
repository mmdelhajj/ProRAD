import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../services/api'
import { XMarkIcon, ArrowDownTrayIcon, ArrowPathIcon, CheckCircleIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import { useState, useEffect } from 'react'

export default function UpdateBanner() {
  const [dismissed, setDismissed] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [updating, setUpdating] = useState(false)
  const queryClient = useQueryClient()

  // Check for updates
  const { data: updateData } = useQuery({
    queryKey: ['update-check'],
    queryFn: () => api.get('/system/update/check').then(res => res.data),
    staleTime: 30 * 60 * 1000,
    refetchInterval: 30 * 60 * 1000,
    retry: false,
  })

  // Get update status (poll when updating)
  const { data: statusData, refetch: refetchStatus } = useQuery({
    queryKey: ['update-status'],
    queryFn: () => api.get('/system/update/status').then(res => res.data.data),
    enabled: updating,
    refetchInterval: updating ? 2000 : false,
  })

  // Start update mutation
  const startUpdateMutation = useMutation({
    mutationFn: (version) => api.post('/system/update/start', { version }),
    onSuccess: () => {
      setUpdating(true)
    },
    onError: (err) => {
      alert(err.response?.data?.message || 'Failed to start update')
    }
  })

  // Handle update completion
  useEffect(() => {
    if (statusData?.step === 'complete' && statusData?.needs_restart) {
      // Update complete, will reload shortly
      setTimeout(() => {
        window.location.reload()
      }, 3000)
    }
  }, [statusData])

  // Don't show banner if dismissed or no update available
  if (dismissed || (!updateData?.update_available && !updating)) return null

  const isCritical = updateData?.is_critical
  const currentVersion = updateData?.current_version || '1.0.0'
  const newVersion = updateData?.new_version || updateData?.version

  const handleStartUpdate = () => {
    if (confirm(`Are you sure you want to update from v${currentVersion} to v${newVersion}?\n\nThe system will restart after the update.`)) {
      startUpdateMutation.mutate(newVersion)
    }
  }

  return (
    <>
      <div className={`${isCritical ? 'bg-orange-500' : 'bg-blue-500'} text-white px-4 py-2`}>
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            {updating ? (
              <ArrowPathIcon className="w-5 h-5 flex-shrink-0 animate-spin" />
            ) : (
              <ArrowDownTrayIcon className="w-5 h-5 flex-shrink-0" />
            )}
            <div>
              {updating ? (
                <span className="font-medium">
                  Updating to v{newVersion}... {statusData?.message || 'Please wait'}
                </span>
              ) : (
                <>
                  <span className="font-medium">
                    {isCritical ? 'Critical Update Available: ' : 'Update Available: '}
                    v{newVersion}
                  </span>
                  <span className="ml-2 text-sm opacity-90">
                    (Current: v{currentVersion})
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {!updating && (
              <>
                <button
                  onClick={() => setShowModal(true)}
                  className="text-sm underline hover:no-underline opacity-90"
                >
                  View details
                </button>
                <button
                  onClick={handleStartUpdate}
                  disabled={startUpdateMutation.isPending}
                  className="text-sm font-medium bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 hover:bg-blue-50 px-3 py-1 rounded disabled:opacity-50"
                >
                  {startUpdateMutation.isPending ? 'Starting...' : 'Update Now'}
                </button>
                {!isCritical && (
                  <button
                    onClick={() => setDismissed(true)}
                    className="p-1 rounded hover:bg-white/20"
                  >
                    <XMarkIcon className="w-4 h-4" />
                  </button>
                )}
              </>
            )}
            {updating && statusData?.progress > 0 && (
              <span className="text-sm font-medium">
                {statusData.progress}%
              </span>
            )}
          </div>
        </div>
        {/* Progress bar when updating */}
        {updating && (
          <div className="max-w-7xl mx-auto mt-2">
            <div className="w-full bg-white/30 rounded-full h-1.5">
              <div
                className="bg-white h-1.5 rounded-full transition-all duration-300"
                style={{ width: `${statusData?.progress || 0}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Update Details Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-[80vh] overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Update to v{newVersion}
                {isCritical && (
                  <span className="ml-2 px-2 py-0.5 text-xs bg-orange-100 text-orange-800 rounded-full">
                    Critical
                  </span>
                )}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-4 overflow-y-auto max-h-[40vh]">
              <div className="flex items-center gap-2 mb-4 text-sm text-gray-500">
                <span className="font-mono bg-gray-100 px-2 py-1 rounded">v{currentVersion}</span>
                <span>→</span>
                <span className="font-mono bg-green-100 text-green-700 px-2 py-1 rounded">v{newVersion}</span>
              </div>

              {updateData?.release_notes && (
                <>
                  <h4 className="text-sm font-medium text-gray-700 mb-2">What's New</h4>
                  <div className="text-sm text-gray-600 whitespace-pre-wrap bg-gray-50 p-3 rounded">
                    {updateData.release_notes}
                  </div>
                </>
              )}

              {updateData?.released_at && (
                <p className="mt-4 text-xs text-gray-400">
                  Released: {new Date(updateData.released_at).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}
                </p>
              )}
            </div>

            <div className="px-6 py-4 border-t border-gray-200 bg-amber-50">
              <div className="flex items-start gap-3">
                <ExclamationTriangleIcon className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-amber-800">
                  <p className="font-medium">Before updating:</p>
                  <ul className="mt-1 list-disc list-inside text-amber-700">
                    <li>A backup will be created automatically</li>
                    <li>The system will restart after update</li>
                    <li>Users may experience brief disconnection</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-200 flex justify-between items-center">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowModal(false)
                  handleStartUpdate()
                }}
                disabled={startUpdateMutation.isPending}
                className="px-6 py-2 bg-blue-600 text-white font-medium rounded hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
              >
                <ArrowDownTrayIcon className="w-4 h-4" />
                Update Now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Update Complete Modal */}
      {statusData?.step === 'complete' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 p-6 text-center">
            <CheckCircleIcon className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">Update Complete!</h3>
            <p className="text-gray-600 mb-4">
              ProxPanel has been updated to v{newVersion}
            </p>
            <p className="text-sm text-gray-500">
              The page will reload automatically...
            </p>
            <div className="mt-4">
              <ArrowPathIcon className="w-6 h-6 text-gray-400 mx-auto animate-spin" />
            </div>
          </div>
        </div>
      )}

      {/* Update Error Modal */}
      {statusData?.error && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <div className="flex items-center gap-3 mb-4">
              <ExclamationTriangleIcon className="w-8 h-8 text-red-500" />
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Update Failed</h3>
            </div>
            <p className="text-gray-600 mb-4">{statusData.error}</p>
            <p className="text-sm text-gray-500 mb-4">
              The system has been restored from backup. Please try again or contact support.
            </p>
            <button
              onClick={() => {
                setUpdating(false)
                queryClient.invalidateQueries(['update-status'])
              }}
              className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  )
}
