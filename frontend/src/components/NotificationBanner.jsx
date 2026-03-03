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
          border: 'border-l-[#f44336]',
          bg: 'bg-[#ffebee] dark:bg-[#3a1a1a]',
          text: 'text-[#c62828] dark:text-[#ef9a9a]',
          badgeClass: 'badge-danger',
        };
      case 'important':
        return {
          border: 'border-l-[#FF9800]',
          bg: 'bg-[#fff8e1] dark:bg-[#2a2a1a]',
          text: 'text-[#e65100] dark:text-[#FFB74D]',
          badgeClass: 'badge-warning',
        };
      default:
        return {
          border: 'border-l-[#2196F3]',
          bg: 'bg-[#e3f2fd] dark:bg-[#1a2a3a]',
          text: 'text-[#1565c0] dark:text-[#90caf9]',
          badgeClass: 'badge-info',
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
            className={`border-l-4 ${style.border} ${style.bg} border-b border-b-[#a0a0a0] dark:border-b-[#555]`}
          >
            <div className="max-w-7xl mx-auto py-2 px-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center min-w-0 flex-1">
                  <BellIcon className={`h-4 w-4 flex-shrink-0 ${style.text}`} />
                  <div className="ml-2 flex-1 min-w-0">
                    <p className={`text-[12px] font-semibold ${style.text}`}>
                      Update Available: {notification.version}
                      {notification.priority && (
                        <span className={`ml-2 ${style.badgeClass}`}>
                          {notification.priority.toUpperCase()}
                        </span>
                      )}
                    </p>
                    <p className={`text-[12px] ${style.text} opacity-80`}>
                      {notification.message}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={handleUpdateNow}
                    className="btn btn-primary btn-xs"
                  >
                    <ArrowPathIcon className="h-3 w-3 mr-1" />
                    Update Now
                  </button>
                  <button
                    onClick={() => handleDismiss(notification.id)}
                    className="btn btn-xs"
                  >
                    Dismiss
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDismiss(notification.id)}
                    className={`p-0.5 hover:bg-black/10 dark:hover:bg-white/10 ${style.text}`}
                    style={{ borderRadius: '2px' }}
                  >
                    <span className="sr-only">Dismiss</span>
                    <XMarkIcon className="h-3.5 w-3.5" />
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
