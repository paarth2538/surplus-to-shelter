import { supabase } from './supabase';

export function subscribeToPickups(userId, role, callbacks = {}) {
  if (!supabase || !userId) return () => {};
  const channelName = `pickups-${role}-${userId}`;
  let channel;
  let reconnectTimer;
  let stopped = false;

  const matchesRole = (payload) => {
    if (role === 'admin') return true;
    const record = payload.new || payload.old || {};
    if (role === 'driver') return record.driver_id === userId;
    if (role === 'donor') return record.donor_id === userId;
    if (role === 'shelter') return record.shelter_id === userId;
    return false;
  };

  const connect = () => {
    if (stopped || !supabase) return;
    channel = supabase.channel(channelName);
    ['INSERT', 'UPDATE', 'DELETE'].forEach((event) => {
      channel.on('postgres_changes', { event, schema: 'public', table: 'pickups' }, (payload) => {
        if (!matchesRole(payload)) return;
        callbacks.onChange?.(payload);
        callbacks[`on${event[0]}${event.slice(1).toLowerCase()}`]?.(payload);
      });
    });
    channel.subscribe((status) => {
      if (!stopped && ['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) {
        reconnectTimer = window.setTimeout(connect, 3000);
      }
      callbacks.onStatus?.(status);
    });
  };

  connect();
  return () => {
    stopped = true;
    if (reconnectTimer) window.clearTimeout(reconnectTimer);
    if (channel) supabase.removeChannel(channel);
  };
}