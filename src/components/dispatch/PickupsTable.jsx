import React from 'react';

function statusLabel(status) { return status.replace('_', ' '); }
function time(value) { return value ? new Date(value).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : '—'; }

function PickupsTable({ pickups, sort, onSort, onSelect, onAssign, onCancel }) {
  const sortable = (key, label) => <button className="dispatch-sort-button" onClick={() => onSort(key)}>{label}{sort.key === key ? (sort.direction === 'asc' ? ' ↑' : ' ↓') : ''}</button>;
  return (
    <div className="dispatch-table-wrap">
      <table className="dispatch-table">
        <thead><tr><th>ID</th><th>{sortable('status', 'Status')}</th><th>Driver</th><th>Donor → Shelter</th><th>Cargo</th><th>{sortable('pickup_time', 'Scheduled')}</th><th>Actual times</th><th>Actions</th></tr></thead>
        <tbody>{pickups.length ? pickups.map((pickup) => <tr key={pickup.id} onClick={() => onSelect(pickup)}><td className="dispatch-id">#{pickup.id.slice(0, 8)}</td><td><span className={`dispatch-status dispatch-status-${pickup.status.toLowerCase()}`}>{statusLabel(pickup.status)}</span></td><td>{pickup.drivers?.name || 'Unassigned'}</td><td><strong>{pickup.donations?.donor_id ? 'Donor partner' : 'Donor pending'}</strong><span className="table-subtext">→ {pickup.shelters?.organization_name || 'Shelter pending'}</span></td><td>{pickup.donations?.quantity || '—'} {pickup.donations?.unit || 'units'}<span className="table-subtext">{pickup.donations?.food_name || 'Surplus goods'}</span></td><td>{time(pickup.pickup_time)}</td><td><span className="table-subtext">Picked: {time(pickup.picked_up_at)}</span><span className="table-subtext">Delivered: {time(pickup.delivered_at)}</span></td><td onClick={(event) => event.stopPropagation()}><div className="dispatch-row-actions"><button onClick={() => onSelect(pickup)}>View Details</button>{pickup.status === 'ASSIGNED' ? <button onClick={() => onAssign(pickup)}>{pickup.driver_id ? 'Reassign' : 'Assign Driver'}</button> : null}{pickup.status !== 'DELIVERED' && pickup.status !== 'CANCELLED' ? <button className="dispatch-danger-button" onClick={() => onCancel(pickup)}>Cancel</button> : null}</div></td></tr>) : <tr><td colSpan="8"><div className="dispatch-empty">No pickups match the current filters.</div></td></tr>}</tbody>
      </table>
    </div>
  );
}

export default React.memo(PickupsTable);