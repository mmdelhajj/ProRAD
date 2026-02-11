import { useState, useEffect } from 'react';
import { XMarkIcon, BellIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import api from '../services/api';

const NotificationBanner = () => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dismissed, setDismissed] = useState(new Set());

  // Poll for notifications every 5 minutes
  useEffect(() => {
    const fetchNotifications = async () => {
      try {
        const response = await api.get('/notifications/updates/pending');
        if (response.data.success) {
          setNotifications(response.data.notifications || []);
        }
      } catch (error) {
        console.error('Failed to fetch notifications:', error);
      }
    };

    fetchNotifications();
    const interval = setInterval(fetchNotifications, 5 * 60 * 1000); // 5 minutes

    return () => clearInterval(interval);
  }, []);

  // Mark notification as read
  const handleDismiss = async (notificationId) => {
    setDismissed(new Set([...dismissed, notificationId]));

    try {
      await api.post(`/notifications/updates/${notificationId}/read`);
      // Remove from local state
      setNotifications(notifications.filter(n => n.id !== notificationId));
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  };

  // Navigate to updates page
  const handleUpdateNow = () => {
    window.location.href = '/settings?tab=license';
  };

  // Get priority styling
  const getPriorityStyle = (priority) => {
    switch (priority) {
      case 'critical':
        return {
          bg: 'bg-red-50 dark:bg-red-900/20',
          border: 'border-red-200 dark:border-red-800',
          text: 'text-red-800 dark:text-red-200',
          icon: 'text-red-600 dark:text-red-400',
          button: 'bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600',
          badge: 'bg-red-600 dark:bg-red-700'
        };
      case 'important':
        return {
          bg: 'bg-orange-50 dark:bg-orange-900/20',
          border: 'border-orange-200 dark:border-orange-800',
          text: 'text-orange-800 dark:text-orange-200',
          icon: 'text-orange-600 dark:text-orange-400',
          button: 'bg-orange-600 hover:bg-orange-700 dark:bg-orange-700 dark:hover:bg-orange-600',
          badge: 'bg-orange-600 dark:bg-orange-700'
        };
      default:
        return {
          bg: 'bg-blue-50 dark:bg-blue-900/20',
          border: 'border-blue-200 dark:border-blue-800',
          text: 'text-blue-800 dark:text-blue-200',
          icon: 'text-blue-600 dark:text-blue-400',
          button: 'bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600',
          badge: 'bg-blue-600 dark:bg-blue-700'
        };
    }
  };

  // Filter out dismissed notifications
  const visibleNotifications = notifications.filter(n => !dismissed.has(n.id));

  if (visibleNotifications.length === 0) {
    return null;
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-50">
      {visibleNotifications.map((notification) => {
        const style = getPriorityStyle(notification.priority);

        return (
          <div
            key={notification.id}
            className={`${style.bg} ${style.border} border-b`}
          >
            <div className="max-w-7xl mx-auto py-3 px-3 sm:px-6 lg:px-8">
              <div className="flex items-center justify-between flex-wrap">
                <div className="w-0 flex-1 flex items-center">
                  <span className={`flex p-2 rounded-lg ${style.badge}`}>
                    <BellIcon className="h-6 w-6 text-white" aria-hidden="true" />
                  </span>
                  <div className="ml-3 flex-1">
                    <p className={`font-medium ${style.text}`}>
                      <span className="inline">
                        Update Available: {notification.version}
                      </span>
                      {notification.priority && (
                        <span className={`ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${style.badge} text-white uppercase`}>
                          {notification.priority}
                        </span>
                      )}
                    </p>
                    <p className={`mt-1 text-sm ${style.text} opacity-90`}>
                      {notification.message}
                    </p>
                  </div>
                </div>
                <div className="order-3 mt-2 flex-shrink-0 w-full sm:order-2 sm:mt-0 sm:w-auto space-x-2">
                  <button
                    onClick={handleUpdateNow}
                    className={`flex items-center justify-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${style.button} focus:outline-none focus:ring-2 focus:ring-offset-2 ${style.button.replace('bg-', 'focus:ring-')}`}
                  >
                    <ArrowPathIcon className="h-5 w-5 mr-2" />
                    Update Now
                  </button>
                  <button
                    onClick={() => handleDismiss(notification.id)}
                    className={`flex items-center justify-center px-4 py-2 border ${style.border} rounded-md shadow-sm text-sm font-medium ${style.text} bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 ${style.button.replace('bg-', 'focus:ring-')}`}
                  >
                    Dismiss
                  </button>
                </div>
                <div className="order-2 flex-shrink-0 sm:order-3 sm:ml-3">
                  <button
                    type="button"
                    onClick={() => handleDismiss(notification.id)}
                    className={`-mr-1 flex p-2 rounded-md hover:bg-black/10 dark:hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white sm:-mr-2`}
                  >
                    <span className="sr-only">Dismiss</span>
                    <XMarkIcon className={`h-6 w-6 ${style.icon}`} aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default NotificationBanner;
