import { colors } from '../theme/colors';

/**
 * Convert bytes to human-readable string.
 * @param {number} bytes - Number of bytes
 * @param {number} [decimals=2] - Decimal places
 * @returns {string} Formatted string e.g. "1.5 GB"
 */
export function formatBytes(bytes, decimals = 2) {
  if (bytes === null || bytes === undefined) return '0 B';
  if (bytes === 0) return '0 B';

  const isNegative = bytes < 0;
  const absBytes = Math.abs(bytes);
  const k = 1024;
  const dm = Math.max(0, decimals);
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(absBytes) / Math.log(k));
  const index = Math.min(i, sizes.length - 1);
  const value = absBytes / Math.pow(k, index);

  return `${isNegative ? '-' : ''}${value.toFixed(dm)} ${sizes[index]}`;
}

/**
 * Convert kbps to human-readable speed string.
 * @param {number} kbps - Speed in kilobits per second
 * @returns {string} Formatted string e.g. "15.2 Mbps"
 */
export function formatSpeed(kbps) {
  if (kbps === null || kbps === undefined || kbps === 0) return '0 Kbps';

  const absKbps = Math.abs(kbps);

  if (absKbps >= 1000000) {
    return `${(kbps / 1000000).toFixed(2)} Gbps`;
  }
  if (absKbps >= 1000) {
    return `${(kbps / 1000).toFixed(1)} Mbps`;
  }
  return `${Math.round(kbps)} Kbps`;
}

/**
 * Format a date string or Date object to a localized display string.
 * @param {string|Date} date - Date to format
 * @param {object} [options] - Intl.DateTimeFormat options override
 * @returns {string} Formatted date string e.g. "Feb 26, 2026 14:30"
 */
export function formatDate(date, options) {
  if (!date) return '-';

  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '-';

  const defaultOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  };

  return d.toLocaleDateString('en-US', options || defaultOptions);
}

/**
 * Format seconds into a human-readable duration.
 * @param {number} seconds - Duration in seconds
 * @returns {string} Formatted duration e.g. "2h 30m", "5d 12h", "45s"
 */
export function formatDuration(seconds) {
  if (seconds === null || seconds === undefined || seconds <= 0) return '0s';

  const totalSeconds = Math.floor(seconds);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  if (days > 0) {
    if (hours > 0) return `${days}d ${hours}h`;
    return `${days}d`;
  }
  if (hours > 0) {
    if (minutes > 0) return `${hours}h ${minutes}m`;
    return `${hours}h`;
  }
  if (minutes > 0) {
    return `${minutes}m`;
  }
  return `${secs}s`;
}

/**
 * Format a monetary amount with currency symbol.
 * @param {number} amount - The amount to format
 * @param {string} [currency='USD'] - ISO 4217 currency code
 * @returns {string} Formatted currency string e.g. "$1,234.56"
 */
export function formatCurrency(amount, currency = 'USD') {
  if (amount === null || amount === undefined) return '-';

  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    // Fallback if currency code is invalid
    return `${amount.toFixed(2)} ${currency}`;
  }
}

/**
 * Calculate and format a percentage from a value and total.
 * @param {number} value - The current value
 * @param {number} total - The total/maximum value
 * @param {number} [decimals=1] - Decimal places
 * @returns {string} Formatted percentage e.g. "75.0%"
 */
export function formatPercentage(value, total, decimals = 1) {
  if (!total || total === 0) return '0%';
  if (value === null || value === undefined) return '0%';

  const percentage = (value / total) * 100;
  const clamped = Math.min(percentage, 100);
  return `${clamped.toFixed(decimals)}%`;
}

/**
 * Return the theme color for a subscriber status.
 * @param {string} status - Status string: 'online', 'offline', 'expired', 'inactive', 'suspended'
 * @returns {string} Hex color code
 */
export function getStatusColor(status) {
  if (!status) return colors.inactive;

  switch (status.toLowerCase()) {
    case 'online':
    case 'active':
      return colors.online;
    case 'offline':
    case 'disconnected':
      return colors.offline;
    case 'expired':
    case 'suspended':
      return colors.expired;
    case 'inactive':
    case 'disabled':
      return colors.inactive;
    default:
      return colors.inactive;
  }
}

/**
 * Return the theme color for a FUP (Fair Usage Policy) level.
 * @param {number} level - FUP level (0-3)
 * @returns {string} Hex color code
 */
export function getFUPColor(level) {
  switch (level) {
    case 0:
      return colors.fup0;
    case 1:
      return colors.fup1;
    case 2:
      return colors.fup2;
    case 3:
      return colors.fup3;
    default:
      return colors.fup0;
  }
}

/**
 * Get a human-readable relative time string from a date.
 * @param {string|Date} date - The date to compare against now
 * @returns {string} Relative time string e.g. "5 min ago", "2h ago", "3d ago"
 */
export function getTimeAgo(date) {
  if (!date) return '-';

  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '-';

  const now = new Date();
  const diffMs = now.getTime() - d.getTime();

  // Handle future dates
  if (diffMs < 0) return 'just now';

  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);
  const diffYears = Math.floor(diffDays / 365);

  if (diffSeconds < 10) return 'just now';
  if (diffSeconds < 60) return `${diffSeconds}s ago`;
  if (diffMinutes < 60) return `${diffMinutes} min ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffWeeks < 5) return `${diffWeeks}w ago`;
  if (diffMonths < 12) return `${diffMonths}mo ago`;
  return `${diffYears}y ago`;
}

/**
 * Validate whether a string is a valid server URL.
 * Accepts http:// and https:// URLs with a hostname or IP.
 * @param {string} url - URL string to validate
 * @returns {boolean} True if the URL is valid
 */
export function isValidURL(url) {
  if (!url || typeof url !== 'string') return false;

  // Trim whitespace
  const trimmed = url.trim();
  if (trimmed.length === 0) return false;

  // Must start with http:// or https://
  if (!/^https?:\/\//i.test(trimmed)) return false;

  try {
    const parsed = new URL(trimmed);
    // Must have a valid hostname (not empty)
    if (!parsed.hostname || parsed.hostname.length === 0) return false;
    // Protocol must be http or https
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    return true;
  } catch {
    return false;
  }
}
