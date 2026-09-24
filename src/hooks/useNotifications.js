import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

export default function useNotifications(userId) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(Boolean(userId));

  const refetch = useCallback(async () => {
    if (!supabase || !userId) {
      setNotifications([]);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from('notification_events')
      .select('id, type, title, message, data, read, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (!error) setNotifications(data || []);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    if (!userId || !supabase) return undefined;
    let isMounted = true;
    const channel = supabase
      .channel(`notifications-${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notification_events', filter: `user_id=eq.${userId}` }, (payload) => {
        if (isMounted) setNotifications((current) => [payload.new, ...current].slice(0, 50));
      })
      .subscribe();
    void Promise.resolve().then(() => { if (isMounted) void refetch(); });
    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [refetch, userId]);

  const markRead = useCallback(async (notificationId) => {
    if (!supabase) return;
    await supabase.from('notification_events').update({ read: true }).eq('id', notificationId).eq('user_id', userId);
    setNotifications((current) => current.map((notification) => notification.id === notificationId ? { ...notification, read: true } : notification));
  }, [userId]);

  const markAllRead = useCallback(async () => {
    if (!supabase) return;
    await supabase.from('notification_events').update({ read: true }).eq('user_id', userId).eq('read', false);
    setNotifications((current) => current.map((notification) => ({ ...notification, read: true })));
  }, [userId]);

  const unreadCount = useMemo(() => notifications.filter((notification) => !notification.read).length, [notifications]);
  return { notifications, unreadCount, markRead, markAllRead, loading };
}