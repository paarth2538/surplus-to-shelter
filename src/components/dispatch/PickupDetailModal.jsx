import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';

const timeline = ['ASSIGNED', 'PICKUP', 'IN_TRANSIT', 'DELIVERED'];
function label(status) { return status.replace('_', ' '); }

export default function PickupDetailModal({ pickup, onClose, onUpdated }) {
  const [reason, setReason] = useState('');
  const [status, setStatus] = useState(pickup.status);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const override = async () => {
    setSaving(true); setError('');
    const { error: updateError } = await supabase.from('pickups').update({ status, notes: reason ? `${pickup.notes || ''}\nAdmin override: ${reason}` : pickup.notes, updated_at: new Date().toISOString() }).eq('id', pickup.id);
    if (updateError) setError(updateError.message); else onUpdated?.();
    setSaving(false);
  };
  return <div className="dispatch-modal-backdrop"><section className="dispatch-modal dispatch-detail-modal" role="dialog" aria-modal="true"><button className="driver-modal-close" onClick={onClose} aria-label="Close pickup details">×</button><span className={`dispatch-status dispatch-status-${pickup.status.toLowerCase()}`}>{label(pickup.status)}</span><h2>Pickup #{pickup.id.slice(0, 8)}</h2><p>{pickup.donations?.food_name || 'Surplus goods'} · {pickup.shelters?.organization_name || 'Shelter destination'}</p><div className="dispatch-timeline">{timeline.map((item) => <div className={timeline.indexOf(item) <= timeline.indexOf(pickup.status) ? 'is-reached' : ''} key={item}><span>{timeline.indexOf(item) + 1}</span><strong>{label(item)}</strong><small>{item === 'PICKUP' ? pickup.picked_up_at || 'Pending' : item === 'DELIVERED' ? pickup.delivered_at || 'Pending' : item === 'ASSIGNED' ? pickup.assigned_at || 'Pending' : pickup.updated_at || 'Pending'}</small></div>)}</div><div className="dispatch-detail-columns"><div><span>Driver</span><strong>{pickup.drivers?.name || 'Unassigned'}</strong><small>{pickup.drivers?.phone || pickup.drivers?.vehicle_type || 'No contact assigned'}</small></div><div><span>Donor → Shelter</span><strong>{pickup.donations?.pickup_address || 'Pickup address pending'}</strong><small>→ {pickup.shelters?.address || 'Delivery address pending'}</small></div><div><span>Temperature</span><strong>{pickup.temperature_c ?? '—'} °C</strong><small>{pickup.notes || 'No notes recorded'}</small></div><div><span>Proof</span><strong>{pickup.proof_photo_url || pickup.proof_signature_url ? 'Proof uploaded' : 'No proof yet'}</strong><small>{pickup.proof_photo_url ? <a href={pickup.proof_photo_url} target="_blank" rel="noreferrer">Photo ↗</a> : 'Awaiting handoff'}</small></div></div><div className="dispatch-override"><span className="section-eyebrow">ADMIN OVERRIDE</span><div className="wizard-form-grid"><label><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value)}>{['ASSIGNED', 'PICKUP', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED'].map((value) => <option key={value}>{value}</option>)}</select></label><label><span>Reason</span><input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Required for audit trail" /></label></div>{error ? <div className="driver-error">{error}</div> : null}<button className="btn-pill-primary" onClick={override} disabled={saving}>{saving ? 'Saving...' : 'Apply Override'}</button></div></section></div>;
}