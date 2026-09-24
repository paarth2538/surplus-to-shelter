import React from 'react';

function timeAgo(dateString) {
  if (!dateString) return 'Just now';
  const diff = Date.now() - new Date(dateString).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date(dateString));
}

function typeIcon(type) {
  switch (type) {
    case 'MATCH_FOUND':
    case 'MATCH_ACCEPTED':
      return '🤝';
    case 'PICKUP_ASSIGNED':
      return '🚚';
    case 'FOOD_PICKED_UP':
      return '🥬';
    case 'DRIVER_EN_ROUTE':
      return '⚡';
    case 'DELIVERY_COMPLETED':
      return '🎉';
    case 'PICKUP_CANCELLED':
      return '❌';
    case 'URGENT_REQUEST':
      return '⚠️';
    case 'URGENT_EXPIRY':
      return '⏳';
    case 'DONATION_POSTED':
      return '📦';
    default:
      return '🔔';
  }
}

export default function NotificationPanel({
  notifications,
  allNotificationsCount,
  unreadCount,
  loading,
  error,
  filter,
  setFilter,
  onMarkRead,
  onMarkAllRead,
  onNotificationClick,
  onClose,
  onRefresh,
  onOpenSettings
}) {
  return (
    <div
      className="notification-panel-dropdown"
      role="dialog"
      aria-label="Notifications panel"
      aria-modal="true"
    >
      <header className="notification-panel-header">
        <div className="notification-header-title">
          <h3>Notifications</h3>
          {unreadCount > 0 ? (
            <span className="notification-badge-unread">{unreadCount} new</span>
          ) : null}
        </div>
        <div className="notification-header-actions">
          {unreadCount > 0 ? (
            <button
              type="button"
              className="notification-action-link"
              onClick={onMarkAllRead}
              title="Mark all notifications as read"
            >
              Mark all read
            </button>
          ) : null}
          {onOpenSettings ? (
            <button
              type="button"
              className="notification-settings-btn"
              onClick={onOpenSettings}
              title="Alert Preferences"
              aria-label="Alert Preferences"
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, padding: '0 4px', lineHeight: 1 }}
            >
              ⚙️
            </button>
          ) : null}
          <button
            type="button"
            className="notification-close-btn"
            onClick={onClose}
            aria-label="Close notifications"
          >
            ×
          </button>
        </div>
      </header>

      {/* Filter Tabs */}
      <div className="notification-filter-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={filter === 'all'}
          className={`notif-tab ${filter === 'all' ? 'is-active' : ''}`}
          onClick={() => setFilter('all')}
        >
          All ({allNotificationsCount})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={filter === 'unread'}
          className={`notif-tab ${filter === 'unread' ? 'is-active' : ''}`}
          onClick={() => setFilter('unread')}
        >
          Unread ({unreadCount})
        </button>
      </div>

      {error ? (
        <div className="notification-error-row" role="alert">
          <span>{error}</span>
          <button type="button" onClick={onRefresh}>Retry</button>
        </div>
      ) : null}

      {/* Notification List */}
      <div className="notification-list-body">
        {loading && !notifications.length ? (
          <div className="notification-loading-state">
            <span className="wizard-spinner" />
            <span>Loading notifications...</span>
          </div>
        ) : !notifications.length ? (
          <div className="notification-empty-state">
            <span className="notif-empty-icon">{filter === 'unread' ? '✨' : '📭'}</span>
            <p className="notif-empty-title">
              {filter === 'unread' ? 'All caught up!' : 'No notifications yet'}
            </p>
            <span className="notif-empty-desc">
              {filter === 'unread'
                ? 'You have read all of your active alerts.'
                : 'Real-time updates about matches, pickups, and dispatches will appear here.'}
            </span>
          </div>
        ) : (
          notifications.map((notif) => (
            <article
              key={notif.id}
              className={`notification-item-card ${!notif.read ? 'is-unread' : ''}`}
              onClick={() => onNotificationClick(notif)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onNotificationClick(notif);
                }
              }}
            >
              <div className="notif-icon-col">
                <span className="notif-type-icon">{typeIcon(notif.type)}</span>
              </div>
              <div className="notif-content-col">
                <div className="notif-topline">
                  <strong className="notif-item-title">{notif.title}</strong>
                  <time className="notif-time">{timeAgo(notif.created_at)}</time>
                </div>
                <p className="notif-item-message">{notif.message}</p>
                <div className="notif-meta-actions">
                  {notif.related_entity_type === 'pickup' ? (
                    <span className="notif-entity-link">View Route Details →</span>
                  ) : notif.type === 'DELIVERY_COMPLETED' ? (
                    <span className="notif-entity-link">View Impact Dashboard →</span>
                  ) : null}
                  {!notif.read ? (
                    <button
                      type="button"
                      className="notif-mark-single-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        void onMarkRead(notif.id);
                      }}
                      title="Mark as read"
                    >
                      ✓ Mark read
                    </button>
                  ) : null}
                </div>
              </div>
              {!notif.read ? <span className="notif-unread-dot" aria-label="Unread" /> : null}
            </article>
          ))
        )}
      </div>

      <footer className="notification-panel-footer">
        <span className="realtime-status-pill">
          <span className="live-dot-pulse" />
          <span>Realtime active</span>
        </span>
      </footer>
    </div>
  );
}
