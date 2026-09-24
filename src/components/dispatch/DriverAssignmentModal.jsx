import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

export default function DriverAssignmentModal({ pickup, onClose, onAssigned }) {
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      const { data, error: queryError } = await supabase.from('drivers').select('id, name, phone, vehicle_type, capacity_kg, current_lat, current_lng, is_available, status').eq('is_available', true).eq('status', 'AVAILABLE').is('current_pickup_id', null).order('name');
      if (queryError) setError(queryError.message); else setDrivers(data || []);
      setLoading(false);
    };
    void load();
  }, []);

  const assign = async (driver) => {
    setAssigning(driver.id);
    const { error: assignError } = await supabase.rpc('assign_driver_to_match', { p_match_id: pickup.match_id, p_driver_id: driver.id, p_scheduled_at: pickup.scheduled_at });
    if (assignError) setError(assignError.message); else onAssigned?.();
    setAssigning(null);
  };

  return <div className="dispatch-modal-backdrop"><section className="dispatch-modal" role="dialog" aria-modal="true"><button className="driver-modal-close" onClick={onClose} aria-label="Close assignment dialog">×</button><span className="section-eyebrow">DISPATCH ASSIGNMENT</span><h2>Choose an available driver</h2><p>Pickup #{pickup.id.slice(0, 8)} · {pickup.shelters?.organization_name || 'Shelter destination'}</p>{error ? <div className="driver-error" role="alert">{error}</div> : null}{loading ? <div className="dispatch-empty">Loading available drivers...</div> : <div className="driver-assignment-list">{drivers.length ? drivers.map((driver) => <button className="driver-assignment-row" key={driver.id} onClick={() => assign(driver)} disabled={Boolean(assigning)}><span className="driver-assignment-avatar">{driver.name.slice(0, 2).toUpperCase()}</span><span><strong>{driver.name}</strong><small>{driver.vehicle_type || 'Vehicle'} · {driver.capacity_kg || '—'} kg · {driver.current_lat ? 'Location available' : 'Location unavailable'}</small></span><em>{assigning === driver.id ? 'Assigning...' : 'Assign'}</em></button>) : <div className="dispatch-empty">No available drivers right now.</div>}</div>}</section></div>;
}