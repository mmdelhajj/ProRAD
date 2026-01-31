import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { publicApi } from '../services/api'
import api from '../services/api'

export default function Impersonate() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = searchParams.get('token')

    if (!token) {
      setError('No impersonation token provided')
      setLoading(false)
      return
    }

    // Exchange the temporary token for a real session
    const exchangeToken = async () => {
      try {
        const response = await publicApi.exchangeImpersonateToken(token)

        if (response.data.success) {
          const { token: jwtToken, user } = response.data.data

          // Store session in Zustand's localStorage format
          const authState = {
            state: {
              user: user,
              token: jwtToken,
              isAuthenticated: true,
              isCustomer: false,
              customerData: null,
            },
            version: 0
          }
          localStorage.setItem('proisp-auth', JSON.stringify(authState))

          // Set the API header
          api.defaults.headers.common['Authorization'] = `Bearer ${jwtToken}`

          // Redirect to dashboard
          window.location.href = '/'
        } else {
          setError(response.data.message || 'Failed to exchange token')
          setLoading(false)
        }
      } catch (err) {
        console.error('Impersonate error:', err)
        setError(err.response?.data?.message || 'Failed to authenticate. Token may have expired.')
        setLoading(false)
      }
    }

    exchangeToken()
  }, [searchParams, navigate])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Authenticating as reseller...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 max-w-md w-full mx-4">
          <div className="text-center">
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 dark:bg-red-900/30 mb-4">
              <svg className="h-6 w-6 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Authentication Failed</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6">{error}</p>
            <button
              onClick={() => window.close()}
              className="bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 transition-colors"
            >
              Close This Tab
            </button>
          </div>
        </div>
      </div>
    )
  }

  return null
}
