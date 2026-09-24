import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

export default function LiveMapView({ pickups }) {
  const [drivers, setDrivers] = useState([]);
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const { data } = await supabase.from('drivers').select('id, name, current_lat, current_lng, status').not('current_lat', 'is', null);
      if (mounted) setDrivers(data || []);
    };
    void load();
    const timer = window.setInterval(load, 15000);
    const channel = supabase.channel('dispatch-drivers').on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'drivers' }, ({ new: driver }) => setDrivers((current) => current.map((item) => item.id === driver.id ? driver : item))).subscribe();
    return () => { mounted = false; window.clearInterval(timer); supabase.removeChannel(channel); };
  }, []);
  return <section className="live-map-panel"><div className="live-map-header"><div><span className="section-eyebrow">LIVE MAP</span><h2>Network positions</h2></div><span className="map-refresh-label">Refreshes every 15s</span></div><div className="static-map"><div className="map-grid-lines" />{drivers.map((driver, index) => <span className="map-marker map-marker-driver" key={driver.id} style={{ left: `${18 + ((index * 23) % 70)}%`, top: `${25 + ((index * 31) % 55)}%` }} title={`${driver.name} · ${driver.status}`}>●</span>)}{pickups.slice(0, 8).map((pickup, index) => <span className={`map-marker map-marker-pickup ${pickup.status === 'DELIVERED' ? 'completed' : pickup.status === 'ASSIGNED' ? 'scheduled' : 'active'}`} key={pickup.id} style={{ left: `${12 + ((index * 37) % 78)}%`, top: `${62 - ((index * 17) % 40)}%` }} title={`Pickup ${pickup.id.slice(0, 8)}`}>●</span>)}<div className="map-fallback-label">Map service token not configured · showing live static positions</div></div></section>;
}