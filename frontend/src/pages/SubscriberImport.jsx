import { useState, useRef } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { subscriberApi, serviceApi, nasApi } from '../services/api'
import * as XLSX from 'xlsx'
import {
  ArrowDownTrayIcon,
  ArrowUpTrayIcon,
  DocumentArrowUpIcon,
  CheckCircleIcon,
  XCircleIcon,
  ArrowLeftIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'

export default function SubscriberImport() {
  const navigate = useNavigate()
  const fileInputRef = useRef(null)
  const [parsedData, setParsedData] = useState([])
  const [fileName, setFileName] = useState('')
  const [selectedNasId, setSelectedNasId] = useState('')
  const [importResults, setImportResults] = useState(null)
  const [isImporting, setIsImporting] = useState(false)

  // Fetch services for validation
  const { data: servicesData } = useQuery({
    queryKey: ['services'],
    queryFn: () => serviceApi.list(),
  })

  // Fetch NAS devices
  const { data: nasData } = useQuery({
    queryKey: ['nas'],
    queryFn: () => nasApi.list(),
  })

  const services = servicesData?.data?.data || []
  const nasDevices = nasData?.data?.data || []

  // Import mutation
  const importMutation = useMutation({
    mutationFn: (data) => subscriberApi.importExcel(data),
    onSuccess: (response) => {
      setIsImporting(false)
      setImportResults(response.data.data)
      toast.success(response.data.message)
    },
    onError: (error) => {
      setIsImporting(false)
      toast.error(error.response?.data?.message || 'Import failed')
    },
  })

  const handleFileChange = (e) => {
    const file = e.target.files[0]
    if (!file) return

    setFileName(file.name)
    setImportResults(null)

    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const bstr = evt.target.result
        const wb = XLSX.read(bstr, { type: 'binary' })
        const wsname = wb.SheetNames[0]
        const ws = wb.Sheets[wsname]
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 })

        // Skip header row (row 0), auto-detect if row 1 is description or data
        const headers = data[0] || []

        // Check if row 1 looks like a description row (contains words like "required", "optional", etc.)
        const row1 = data[1] || []
        const row1Text = row1.join(' ').toLowerCase()
        const isDescriptionRow = row1Text.includes('required') || row1Text.includes('optional') ||
                                  row1Text.includes('format') || row1Text.includes('example')

        const dataStartRow = isDescriptionRow ? 2 : 1
        const rows = data.slice(dataStartRow).filter(row => row.some(cell => cell !== undefined && cell !== ''))

        // Map column names to indices (case-insensitive)
        const colMap = {}
        headers.forEach((h, i) => {
          if (h) colMap[h.toLowerCase().replace(/[*\s]/g, '')] = i
        })

        // Parse rows into objects
        const parsed = rows.map((row, idx) => {
          const getCell = (names) => {
            for (const name of names) {
              const cleanName = name.toLowerCase().replace(/[*\s]/g, '')
              if (colMap[cleanName] !== undefined && row[colMap[cleanName]] !== undefined) {
                return String(row[colMap[cleanName]]).trim()
              }
            }
            return ''
          }

          return {
            row: idx + dataStartRow + 1, // Excel row number (1-indexed)
            username: getCell(['username', 'user']),
            full_name: getCell(['fullname', 'name', 'full_name']),
            password: getCell(['password', 'pass']),
            service: getCell(['service', 'plan', 'package']),
            expiry: getCell(['expiry', 'expiry_date', 'expires', 'exp']),
            phone: getCell(['phone', 'mobile', 'tel']),
            address: getCell(['address', 'addr']),
            region: getCell(['region', 'area']),
            building: getCell(['building', 'bldg']),
            nationality: getCell(['nationality', 'nation']),
            country: getCell(['country']),
            mac_address: getCell(['macaddress', 'mac', 'mac_address']),
            note: getCell(['note', 'notes', 'comment']),
            reseller: getCell(['reseller']),
            blocked: getCell(['blocked', 'block', 'status']),
          }
        })

        setParsedData(parsed)
        toast.success(`Parsed ${parsed.length} rows from Excel file`)
      } catch (err) {
        console.error('Error parsing Excel:', err)
        toast.error('Failed to parse Excel file')
        setParsedData([])
      }
    }
    reader.readAsBinaryString(file)
  }

  const handleImport = () => {
    if (parsedData.length === 0) {
      toast.error('No data to import')
      return
    }

    // Validate required fields
    const invalidRows = parsedData.filter(row => !row.username || !row.password || !row.service)
    if (invalidRows.length > 0) {
      toast.error(`${invalidRows.length} rows are missing required fields (Username, Password, Service)`)
      return
    }

    setIsImporting(true)
    importMutation.mutate({
      data: parsedData,
      nas_id: selectedNasId ? parseInt(selectedNasId) : 0,
    })
  }

  const downloadSample = () => {
    window.open('/import_subscribers_sample.xlsx', '_blank')
  }

  const getServiceValidation = (serviceName) => {
    if (!serviceName) return { valid: false, message: 'Required' }
    const found = services.find(s => s.name.toLowerCase() === serviceName.toLowerCase())
    return found ? { valid: true, message: found.name } : { valid: false, message: 'Not found' }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="sm:flex sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/subscribers')}
            className="text-gray-400 hover:text-gray-600 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400"
          >
            <ArrowLeftIcon className="h-6 w-6" />
          </button>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Import Subscribers</h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">
              Import subscribers from Excel file
            </p>
          </div>
        </div>
      </div>

      {/* Instructions */}
      <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 rounded-lg p-4">
        <h3 className="text-sm font-medium text-blue-800 mb-2">Instructions</h3>
        <ol className="list-decimal list-inside text-sm text-blue-700 space-y-1">
          <li>Download the sample Excel file to see the required format</li>
          <li>Fill in subscriber data starting from row 3 (row 1 is headers, row 2 is description)</li>
          <li>Required fields: Username, Password, Service (must match existing service name)</li>
          <li>Upload your Excel file and review the preview</li>
          <li>Click Import to add all subscribers</li>
        </ol>
      </div>

      {/* Step 1: Download Sample */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Step 1: Download Sample File</h2>
        <button
          onClick={downloadSample}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700"
        >
          <ArrowDownTrayIcon className="h-5 w-5 mr-2" />
          Download Sample Excel
        </button>
      </div>

      {/* Step 2: Upload File */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Step 2: Upload Excel File</h2>

        <div className="flex items-center gap-4">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".xlsx,.xls"
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 dark:text-gray-200 bg-white hover:bg-gray-50 dark:bg-gray-700"
          >
            <ArrowUpTrayIcon className="h-5 w-5 mr-2" />
            Choose File
          </button>
          {fileName && (
            <span className="text-sm text-gray-600 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">
              <DocumentArrowUpIcon className="h-5 w-5 inline mr-1" />
              {fileName}
            </span>
          )}
        </div>

        {/* NAS Selection */}
        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Default NAS (optional)
          </label>
          <select
            value={selectedNasId}
            onChange={(e) => setSelectedNasId(e.target.value)}
            className="block w-full max-w-xs rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
          >
            <option value="">No default NAS</option>
            {nasDevices.map((nas) => (
              <option key={nas.id} value={nas.id}>
                {nas.name} ({nas.ip_address})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Step 3: Preview & Import */}
      {parsedData.length > 0 && (
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-medium text-gray-900 dark:text-white">
              Step 3: Review & Import ({parsedData.length} subscribers)
            </h2>
            <button
              onClick={handleImport}
              disabled={isImporting}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 disabled:opacity-50"
            >
              {isImporting ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Importing...
                </>
              ) : (
                <>
                  <CheckCircleIcon className="h-5 w-5 mr-2" />
                  Import All
                </>
              )}
            </button>
          </div>

          {/* Preview Table */}
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Row</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Username</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Name</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Password</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Service</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Expiry</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Phone</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">MAC</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {parsedData.slice(0, 100).map((row, idx) => {
                  const serviceValidation = getServiceValidation(row.service)
                  return (
                    <tr key={idx} className={!row.username || !row.password || !serviceValidation.valid ? 'bg-red-50' : ''}>
                      <td className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">{row.row}</td>
                      <td className="px-3 py-2 text-sm text-gray-900 dark:text-white">
                        {row.username || <span className="text-red-500">Missing</span>}
                      </td>
                      <td className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">{row.full_name}</td>
                      <td className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">
                        {row.password ? '****' : <span className="text-red-500">Missing</span>}
                      </td>
                      <td className="px-3 py-2 text-sm">
                        {serviceValidation.valid ? (
                          <span className="text-green-600">{serviceValidation.message}</span>
                        ) : (
                          <span className="text-red-500">{row.service || 'Missing'} ({serviceValidation.message})</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">{row.expiry}</td>
                      <td className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">{row.phone}</td>
                      <td className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">{row.mac_address}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {parsedData.length > 100 && (
              <p className="text-sm text-gray-500 mt-2 text-center">
                Showing first 100 of {parsedData.length} rows
              </p>
            )}
          </div>
        </div>
      )}

      {/* Import Results */}
      {importResults && (
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
            Import Results: {importResults.success} success, {importResults.failed} failed
          </h2>

          {/* Results Table */}
          <div className="overflow-x-auto max-h-96">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Row</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Username</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Status</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Message</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {importResults.results?.map((result, idx) => (
                  <tr key={idx} className={result.status === 'failed' ? 'bg-red-50' : 'bg-green-50'}>
                    <td className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">{result.row}</td>
                    <td className="px-3 py-2 text-sm text-gray-900 dark:text-white">{result.username}</td>
                    <td className="px-3 py-2 text-sm">
                      {result.status === 'success' ? (
                        <span className="inline-flex items-center text-green-600">
                          <CheckCircleIcon className="h-4 w-4 mr-1" />
                          Success
                        </span>
                      ) : (
                        <span className="inline-flex items-center text-red-600">
                          <XCircleIcon className="h-4 w-4 mr-1" />
                          Failed
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500 dark:text-gray-400">{result.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex gap-4">
            <button
              onClick={() => {
                setParsedData([])
                setFileName('')
                setImportResults(null)
                if (fileInputRef.current) fileInputRef.current.value = ''
              }}
              className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 dark:text-gray-200 bg-white hover:bg-gray-50 dark:bg-gray-700"
            >
              Import More
            </button>
            <button
              onClick={() => navigate('/subscribers')}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700"
            >
              Go to Subscribers
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
