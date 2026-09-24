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
  const points = [
    ...drivers.filter((driver) => Number.isFinite(Number(driver.current_lat)) && Number.isFinite(Number(driver.current_lng))).map((driver) => ({
      key: `driver-${driver.id}`,
      kind: 'driver',
      lat: Number(driver.current_lat),
      lng: Number(driver.current_lng),
      label: `${driver.name} · ${driver.status}`
    })),
    ...pickups.slice(0, 8).flatMap((pickup) => [
      Number.isFinite(Number(pickup.donations?.latitude)) && Number.isFinite(Number(pickup.donations?.longitude)) ? {
        key: `pickup-${pickup.id}`,
        kind: 'pickup',
        lat: Number(pickup.donations.latitude),
        lng: Number(pickup.donations.longitude),
        label: `Pickup ${pickup.id.slice(0, 8)}`
      } : null,
      Number.isFinite(Number(pickup.shelters?.latitude)) && Number.isFinite(Number(pickup.shelters?.longitude)) ? {
        key: `shelter-${pickup.id}`,
        kind: 'shelter',
        lat: Number(pickup.shelters.latitude),
        lng: Number(pickup.shelters.longitude),
        label: `${pickup.shelters.organization_name || 'Shelter'} destination`
      } : null
    ].filter(Boolean))
  ];
  const latitudes = points.map((point) => point.lat);
  const longitudes = points.map((point) => point.lng);
  const minLat = latitudes.length ? Math.min(...latitudes) : 0;
  const maxLat = latitudes.length ? Math.max(...latitudes) : 1;
  const minLng = longitudes.length ? Math.min(...longitudes) : 0;
  const maxLng = longitudes.length ? Math.max(...longitudes) : 1;
  const latSpan = Math.max(maxLat - minLat, 0.001);
  const lngSpan = Math.max(maxLng - minLng, 0.001);
  const positionFor = (point) => ({
    left: `${10 + ((point.lng - minLng) / lngSpan) * 80}%`,
    top: `${10 + (1 - ((point.lat - minLat) / latSpan)) * 80}%`
  });
  return <section className="live-map-panel"><div className="live-map-header"><div><span className="section-eyebrow">LIVE MAP</span><h2>Network positions</h2></div><span className="map-refresh-label">Driver updates stream live</span></div><div className="static-map"><div className="map-grid-lines" />{points.map((point) => <span className={`map-marker map-marker-${point.kind}`} key={point.key} style={positionFor(point)} title={point.label}>●</span>)}{!points.length ? <div className="map-empty-label">No live coordinates available for the active network.</div> : null}<div className="map-legend"><span><i className="map-legend-driver" />Driver</span><span><i className="map-legend-pickup" />Pickup</span><span><i className="map-legend-shelter" />Shelter</span></div></div></section>;
}