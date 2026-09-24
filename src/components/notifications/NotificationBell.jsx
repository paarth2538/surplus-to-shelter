import React, { useEffect, useRef, useState } from 'react';
import useNotifications from '../../hooks/useNotifications';
import NotificationPanel from './NotificationPanel';
import ToastBanner from './ToastBanner';
import NotificationPreferencesModal from './NotificationPreferencesModal';
import './notifications.css';

export default function NotificationBell({ user, role, onNavigate }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const containerRef = useRef(null);

  const {
    notifications,
    allNotifications,
    unreadCount,
    loading,
    error,
    filter,
    setFilter,
    latestToast,
    clearToast,
    markRead,
    markAllRead,
    refetch
  } = useNotifications(user?.id);

  // Close dropdown on click outside
  useEffect(() => {
    if (!isOpen) return undefined;
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleNotificationClick = (notification) => {
    // Mark as read
    if (!notification.read) {
      void markRead(notification.id);
    }

    // Contextual navigation if entity route exists
    if (onNavigate) {
      if (notification.related_entity_type === 'pickup' && notification.related_entity_id) {
        setIsOpen(false);
        const targetRole = role === 'admin' ? 'dispatch' : role || 'donor';
        if (targetRole === 'dispatch') {
          onNavigate('/dispatch');
        } else {
          onNavigate(`/${targetRole}/pickup/${notification.related_entity_id}`);
        }
      } else if (notification.type === 'DELIVERY_COMPLETED') {
        setIsOpen(false);
        onNavigate('/impact');
      }
    }
  };

  return (
    <div className="notification-bell-container" ref={containerRef}>
      <button
        type="button"
        className={`notification-bell-btn ${unreadCount > 0 ? 'has-unread' : ''} ${isOpen ? 'is-active' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        aria-label={`Notifications ${unreadCount > 0 ? `(${unreadCount} unread)` : ''}`}
        aria-expanded={isOpen}
      >
        <span className="bell-icon" aria-hidden="true">🔔</span>
        {unreadCount > 0 ? (
          <span className="notification-counter-badge" aria-hidden="true">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        ) : null}
      </button>

      {isOpen ? (
        <NotificationPanel
          notifications={notifications}
          allNotificationsCount={allNotifications.length}
          unreadCount={unreadCount}
          loading={loading}
          error={error}
          filter={filter}
          setFilter={setFilter}
          onMarkRead={markRead}
          onMarkAllRead={markAllRead}
          onNotificationClick={handleNotificationClick}
          onClose={() => setIsOpen(false)}
          onRefresh={refetch}
          onOpenSettings={() => {
            setIsOpen(false);
            setIsSettingsOpen(true);
          }}
        />
      ) : null}

      {isSettingsOpen ? (
        <NotificationPreferencesModal
          user={user}
          onClose={() => setIsSettingsOpen(false)}
        />
      ) : null}

      {latestToast ? (
        <ToastBanner toast={latestToast} onClose={clearToast} />
      ) : null}
    </div>
  );
}
