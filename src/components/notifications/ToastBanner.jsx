import React from 'react';

function typeEmoji(type) {
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
    default:
      return '🔔';
  }
}

export default function ToastBanner({ toast, onClose }) {
  if (!toast) return null;

  return (
    <div
      className="global-toast-banner"
      role="status"
      aria-live="polite"
      onClick={onClose}
    >
      <div className="toast-emoji-col">
        <span>{typeEmoji(toast.type)}</span>
      </div>
      <div className="toast-body-col">
        <strong>{toast.title}</strong>
        <p>{toast.message}</p>
      </div>
      <button
        type="button"
        className="toast-close-x"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        aria-label="Dismiss toast"
      >
        ×
      </button>
    </div>
  );
}
