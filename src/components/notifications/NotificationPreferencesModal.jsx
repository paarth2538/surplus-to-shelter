import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

export default function NotificationPreferencesModal({ user, onClose }) {
  const [preferences, setPreferences] = useState({
    in_app: true,
    email_enabled: false,
    telegram_enabled: false,
    telegram_chat_id: '',
    urgent_alerts: true
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!supabase || !user?.id) return;
    let isMounted = true;

    const loadPrefs = async () => {
      try {
        const { data, error: fetchError } = await supabase
          .from('notification_preferences')
          .select('in_app, email_enabled, telegram_enabled, telegram_chat_id, urgent_alerts')
          .eq('user_id', user.id)
          .maybeSingle();

        if (!isMounted) return;
        if (!fetchError && data) {
          setPreferences({
            in_app: data.in_app ?? true,
            email_enabled: data.email_enabled ?? false,
            telegram_enabled: data.telegram_enabled ?? false,
            telegram_chat_id: data.telegram_chat_id || '',
            urgent_alerts: data.urgent_alerts ?? true
          });
        }
      } catch (err) {
        if (isMounted) setError(err?.message || 'Failed to load preferences.');
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    void loadPrefs();
    return () => { isMounted = false; };
  }, [user?.id]);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!supabase || !user?.id) return;

    setSaving(true);
    setError('');
    setMessage('');

    try {
      const { error: upsertError } = await supabase
        .from('notification_preferences')
        .upsert({
          user_id: user.id,
          in_app: preferences.in_app,
          email_enabled: preferences.email_enabled,
          telegram_enabled: preferences.telegram_enabled,
          telegram_chat_id: preferences.telegram_chat_id?.trim() || null,
          urgent_alerts: preferences.urgent_alerts,
          updated_at: new Date().toISOString()
        });

      if (upsertError) throw upsertError;
      setMessage('Preferences saved successfully!');
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err) {
      setError(err?.message || 'Failed to save preferences.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="driver-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="driver-modal-window notif-prefs-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="notif-prefs-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="driver-modal-close"
          onClick={onClose}
          aria-label="Close preferences"
        >
          ×
        </button>

        <span className="kicker-badge">
          <span className="kicker-dot dot-emerald" />
          ALERT CHANNELS
        </span>
        <h2 id="notif-prefs-title">Notification Settings</h2>
        <p className="notif-prefs-subtitle">
          Customize which channels receive real-time food rescue events.
        </p>

        {error ? <div className="driver-error" role="alert">{error}</div> : null}
        {message ? <div className="driver-success" role="status">{message}</div> : null}

        {loading ? (
          <div className="notification-loading-state">
            <span className="wizard-spinner" />
            <span>Loading preferences...</span>
          </div>
        ) : (
          <form onSubmit={handleSave} className="notif-prefs-form">
            <div className="prefs-toggle-row">
              <div>
                <strong>In-App Notifications</strong>
                <span>Real-time bell updates and activity badge</span>
              </div>
              <input
                type="checkbox"
                checked={preferences.in_app}
                onChange={(e) => setPreferences({ ...preferences, in_app: e.target.checked })}
              />
            </div>

            <div className="prefs-toggle-row">
              <div>
                <strong>Urgent Expiry & Emergency Alerts</strong>
                <span>Priority notifications when surplus food is about to expire</span>
              </div>
              <input
                type="checkbox"
                checked={preferences.urgent_alerts}
                onChange={(e) => setPreferences({ ...preferences, urgent_alerts: e.target.checked })}
              />
            </div>

            <div className="prefs-toggle-row">
              <div>
                <strong>Email Summaries</strong>
                <span>Operational dispatch and match confirmations via email</span>
              </div>
              <input
                type="checkbox"
                checked={preferences.email_enabled}
                onChange={(e) => setPreferences({ ...preferences, email_enabled: e.target.checked })}
              />
            </div>

            <div className="prefs-toggle-row">
              <div>
                <strong>Telegram Dispatch Alerts</strong>
                <span>Direct delivery alerts sent to your Telegram account or channel</span>
              </div>
              <input
                type="checkbox"
                checked={preferences.telegram_enabled}
                onChange={(e) => setPreferences({ ...preferences, telegram_enabled: e.target.checked })}
              />
            </div>

            {preferences.telegram_enabled ? (
              <div className="form-group" style={{ marginTop: 12 }}>
                <label htmlFor="telegram-chat-id">Telegram Chat / Channel ID</label>
                <input
                  id="telegram-chat-id"
                  type="text"
                  placeholder="e.g. 123456789 or @channelname"
                  value={preferences.telegram_chat_id}
                  onChange={(e) => setPreferences({ ...preferences, telegram_chat_id: e.target.value })}
                />
                <small className="form-help-text">
                  Bot token is stored securely on the backend server.
                </small>
              </div>
            ) : null}

            <div className="notif-prefs-footer">
              <button
                type="button"
                className="btn-pill-secondary"
                onClick={onClose}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-pill-primary"
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save Preferences'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
