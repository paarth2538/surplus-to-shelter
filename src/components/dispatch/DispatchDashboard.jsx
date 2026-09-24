import React, { useState } from 'react';
import useDispatchData from '../../hooks/useDispatchData';
import { supabase } from '../../lib/supabase';
import PickupsTable from './PickupsTable';
import DriverAssignmentModal from './DriverAssignmentModal';
import PickupDetailModal from './PickupDetailModal';
import LazyLiveMapView from './LazyLiveMapView';

const LiveMapView = LazyLiveMapView;

const tabs = ['active', 'scheduled', 'completed', 'all'];

export default function DispatchDashboard({ user, onNavigate, onSignOut }) {
  const dispatch = useDispatchData(user?.id, 'admin');
  const [selectedPickup, setSelectedPickup] = useState(null);
  const [assignmentPickup, setAssignmentPickup] = useState(null);
  const [showMap, setShowMap] = useState(false);
  const cancelPickup = async (pickup) => {
    if (!window.confirm('Cancel this pickup?')) return;
    await supabase.rpc('admin_update_pickup_status', { p_pickup_id: pickup.id, p_new_status: 'CANCELLED', p_notes: 'Cancelled by dispatch.' });
    void dispatch.refetch();
  };
  return <main className="dispatch-shell"><header className="dispatch-topbar"><button className="brand-logo" onClick={() => onNavigate('/')}>surplus<span className="brand-accent">2</span>shelter</button><button className="btn-pill-secondary" onClick={onSignOut}>Log out</button></header><header className="dispatch-heading"><div><span className="kicker-badge"><span className="kicker-dot dot-emerald" />DISPATCH CONTROL</span><h1>Pickup operations</h1><p>Assign, monitor, and close the network&apos;s active handoffs.</p></div><button className="btn-pill-secondary" onClick={() => setShowMap((value) => !value)}>{showMap ? 'Hide Live Map' : 'Show Live Map'}</button></header><div className="dispatch-layout"><aside className="dispatch-sidebar"><span className="section-eyebrow">VIEW</span><div className="dispatch-tabs">{tabs.map((tab) => <button key={tab} className={dispatch.tab === tab ? 'is-active' : ''} onClick={() => dispatch.setTab(tab)}>{tab[0].toUpperCase() + tab.slice(1)}<span>{tab === dispatch.tab ? dispatch.allPickups.length : ''}</span></button>)}</div><span className="section-eyebrow">FILTER</span><label className="dispatch-filter-label">Search<input value={dispatch.filters.search} onChange={(event) => dispatch.updateFilter('search', event.target.value)} placeholder="ID, driver, shelter" /></label><label className="dispatch-filter-label">Status<select value={dispatch.filters.status} onChange={(event) => dispatch.updateFilter('status', event.target.value)}><option>ALL</option>{['ASSIGNED', 'PICKUP', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED'].map((status) => <option key={status}>{status}</option>)}</select></label></aside><section className="dispatch-main">{showMap ? <LiveMapView pickups={dispatch.allPickups} /> : null}<div className="dispatch-table-heading"><div><span className="section-eyebrow">{dispatch.allPickups.length} RECORDS</span><h2>{dispatch.tab[0].toUpperCase() + dispatch.tab.slice(1)} pickups</h2></div><span className="dispatch-page-label">Page {dispatch.page} of {dispatch.totalPages}</span></div>{dispatch.loading ? <div className="dispatch-empty">Loading pickup operations...</div> : dispatch.error ? <div className="driver-error">{dispatch.error}</div> : <PickupsTable pickups={dispatch.pickups} sort={dispatch.sort} onSort={dispatch.updateSort} onSelect={setSelectedPickup} onAssign={setAssignmentPickup} onCancel={cancelPickup} />}<div className="dispatch-pagination"><button disabled={dispatch.page <= 1} onClick={() => dispatch.setPage((page) => page - 1)}>Previous</button><button disabled={dispatch.page >= dispatch.totalPages} onClick={() => dispatch.setPage((page) => page + 1)}>Next</button></div></section></div>{selectedPickup ? <PickupDetailModal pickup={selectedPickup} onClose={() => setSelectedPickup(null)} onUpdated={() => { setSelectedPickup(null); void dispatch.refetch(); }} /> : null}{assignmentPickup ? <DriverAssignmentModal pickup={assignmentPickup} onClose={() => setAssignmentPickup(null)} onAssigned={() => { setAssignmentPickup(null); void dispatch.refetch(); }} /> : null}</main>;
}