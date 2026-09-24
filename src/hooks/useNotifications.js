import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

export default function useNotifications(userId) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(Boolean(userId));
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all'); // 'all' | 'unread'
  const [latestToast, setLatestToast] = useState(null);

  const refetch = useCallback(async () => {
    if (!supabase || !userId) {
      setNotifications([]);
      setLoading(false);
      return;
    }

    try {
      const { data, error: queryError } = await supabase
        .from('notification_events')
        .select('id, user_id, type, title, message, related_entity_type, related_entity_id, idempotency_key, data, read, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(60);

      if (queryError) {
        setError(queryError.message || 'Unable to load notifications.');
      } else {
        setNotifications(data || []);
        setError('');
      }
    } catch (err) {
      setError(err?.message || 'Failed to fetch notifications.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId || !supabase) return undefined;
    let isMounted = true;

    const channel = supabase
      .channel(`notifications-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notification_events',
          filter: `user_id=eq.${userId}`
        },
        (payload) => {
          if (!isMounted || !payload.new) return;
          const newNotif = payload.new;

          setNotifications((current) => {
            // Deduplicate: ignore if ID or idempotency_key already present
            if (current.some((n) => n.id === newNotif.id || (newNotif.idempotency_key && n.idempotency_key === newNotif.idempotency_key))) {
              return current;
            }
            return [newNotif, ...current].slice(0, 60);
          });

          // Trigger in-app toast for incoming realtime notification
          setLatestToast({
            id: newNotif.id,
            title: newNotif.title,
            message: newNotif.message,
            type: newNotif.type
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notification_events',
          filter: `user_id=eq.${userId}`
        },
        (payload) => {
          if (!isMounted || !payload.new) return;
          const updated = payload.new;
          setNotifications((current) =>
            current.map((item) => (item.id === updated.id ? { ...item, ...updated } : item))
          );
        }
      )
      .subscribe();

    void Promise.resolve().then(() => {
      if (isMounted) void refetch();
    });

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [refetch, userId]);

  // Auto-dismiss in-app toast after 4.5 seconds
  useEffect(() => {
    if (!latestToast) return undefined;
    const timer = window.setTimeout(() => setLatestToast(null), 4500);
    return () => window.clearTimeout(timer);
  }, [latestToast]);

  const markRead = useCallback(async (notificationId) => {
    if (!supabase || !userId || !notificationId) return;

    // Optimistic update
    setNotifications((current) =>
      current.map((n) => (n.id === notificationId ? { ...n, read: true } : n))
    );

    try {
      const { error: updateError } = await supabase
        .from('notification_events')
        .update({ read: true })
        .eq('id', notificationId)
        .eq('user_id', userId);

      if (updateError) {
        // Rollback on failure
        void refetch();
      }
    } catch {
      void refetch();
    }
  }, [refetch, userId]);

  const markAllRead = useCallback(async () => {
    if (!supabase || !userId) return;

    // Optimistic update
    setNotifications((current) => current.map((n) => ({ ...n, read: true })));

    try {
      const { error: updateError } = await supabase
        .from('notification_events')
        .update({ read: true })
        .eq('user_id', userId)
        .eq('read', false);

      if (updateError) {
        void refetch();
      }
    } catch {
      void refetch();
    }
  }, [refetch, userId]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  const filteredNotifications = useMemo(() => {
    if (filter === 'unread') {
      return notifications.filter((n) => !n.read);
    }
    return notifications;
  }, [filter, notifications]);

  return {
    notifications: filteredNotifications,
    allNotifications: notifications,
    unreadCount,
    loading,
    error,
    filter,
    setFilter,
    latestToast,
    clearToast: () => setLatestToast(null),
    markRead,
    markAllRead,
    refetch
  };
}