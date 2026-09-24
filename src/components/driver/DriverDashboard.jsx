import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import useDriverPickups from '../../hooks/useDriverPickups';
import PickupFlow from './PickupFlow';
import LazyLiveMapView from '../dispatch/LazyLiveMapView';

function formatDate(value, includeTime = true) {
  if (!value) return 'Time to be confirmed';
  return new Intl.DateTimeFormat('en', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(includeTime ? { hour: 'numeric', minute: '2-digit' } : {})
  }).format(new Date(value));
}

function nextStatus(status) {
  if (status === 'ASSIGNED') return 'PICKUP';
  if (status === 'PICKUP') return 'IN_TRANSIT';
  if (status === 'IN_TRANSIT') return 'DELIVERED';
  return null;
}

function statusLabel(status) {
  return status.replace('_', ' ');
}

function pickupTitle(pickup) {
  return pickup.donations?.food_name || pickup.donations?.donor_id ? 'Surplus food pickup' : 'Community pickup';
}

function actionLabel(status) {
  if (status === 'ASSIGNED') return 'Start Pickup';
  if (status === 'PICKUP') return 'Start Transit';
  if (status === 'IN_TRANSIT') return 'Complete Delivery';
  return 'View Details';
}

function navigationUrl(address) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address || '')}`;
}

function isSameDay(value, reference = new Date()) {
  const date = new Date(value);
  return date.toDateString() === reference.toDateString();
}

function isThisWeek(value, reference = new Date()) {
  const date = new Date(value);
  const start = new Date(reference);
  const day = start.getDay();
  start.setDate(start.getDate() - day);
  start.setHours(0, 0, 0, 0);
  return date >= start && date <= reference;
}

export default function DriverDashboard({ user, profile }) {
  const [driver, setDriver] = useState(null);
  const [loading, setLoading] = useState(true);
  const [setupForm, setSetupForm] = useState({
    name: profile?.name || '',
    phone: profile?.phone || '',
    vehicleType: ''
  });
  const [setupErrors, setSetupErrors] = useState({});
  const [isSavingSetup, setIsSavingSetup] = useState(false);
  const [setupMessage, setSetupMessage] = useState('');
  const [isSavingAvailability, setIsSavingAvailability] = useState(false);
  const [updatingPickupId, setUpdatingPickupId] = useState(null);
  const [detailsPickup, setDetailsPickup] = useState(null);
  const [flowPickup, setFlowPickup] = useState(null);
  const [error, setError] = useState('');

  const loadDriverWorkspace = useCallback(async () => {
    if (!supabase || !user?.id) {
      setError('Connect Supabase to load your driver workspace.');
      setLoading(false);
      return null;
    }

    setError('');
    const { data: driverRecord, error: driverError } = await supabase
      .from('drivers')
      .select('id, name, phone, profile_id, vehicle_type, available, is_available, status, current_lat, current_lng, last_location_update, latitude, longitude')
      .eq('profile_id', user.id)
      .maybeSingle();

    if (driverError) throw driverError;
    if (!driverRecord) {
      setError('Driver profile not set up yet.');
      setSetupForm((current) => ({
        ...current,
        name: current.name || profile?.name || '',
        phone: current.phone || profile?.phone || ''
      }));
      setLoading(false);
      return null;
    }

    setDriver(driverRecord);
    setLoading(false);
    return driverRecord;
  }, [profile?.name, profile?.phone, user]);

  useEffect(() => {
    let isMounted = true;
    let driverChannel;

    const load = async () => {
      try {
        const driverRecord = await loadDriverWorkspace();
        if (!isMounted || !driverRecord || !supabase) return;

        driverChannel = supabase
          .channel(`driver-status-${driverRecord.id}`)
          .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'drivers',
            filter: `id=eq.${driverRecord.id}`
          }, ({ new: updatedDriver }) => {
            if (isMounted) setDriver(updatedDriver);
          })
          .subscribe();
      } catch (loadError) {
        if (isMounted) {
          setError(loadError.message || 'Unable to load your driver workspace.');
          setLoading(false);
        }
      }
    };

    void load();
    return () => {
      isMounted = false;
      if (driverChannel) supabase?.removeChannel(driverChannel);
    };
  }, [loadDriverWorkspace]);

  const pickupWorkspace = useDriverPickups(driver?.id);
  const { currentPickup, upcomingPickups, pickups, impactRecords, loading: pickupsLoading, error: pickupsError, refetch } = pickupWorkspace;
  const hasActivePickup = pickups.some((pickup) => ['PICKUP', 'IN_TRANSIT'].includes(pickup.status));
  const deliveredCount = pickups.filter((pickup) => pickup.status === 'DELIVERED').length;
  const todayPickups = pickups.filter((pickup) => pickup.pickup_time && isSameDay(pickup.pickup_time)).length;
  const weeklyPickups = pickups.filter((pickup) => pickup.pickup_time && isThisWeek(pickup.pickup_time)).length;
  const rescuedWeight = impactRecords.reduce((total, impact) => total + Number(impact.weight_rescued || 0), 0);
  const workspaceError = error || pickupsError;

  const toggleAvailability = async () => {
    if (!supabase || !driver || isSavingAvailability || hasActivePickup) return;
    setIsSavingAvailability(true);
    setError('');
    const nextAvailable = !driver.available;
    const { data, error: updateError } = await supabase
      .from('drivers')
      .update({ available: nextAvailable, is_available: nextAvailable, status: nextAvailable ? 'AVAILABLE' : 'OFFLINE' })
      .eq('id', driver.id)
      .eq('profile_id', driver.profile_id)
      .select('id, name, phone, profile_id, vehicle_type, available, is_available, status, current_lat, current_lng, last_location_update, latitude, longitude')
      .single();

    if (updateError) setError(updateError.message || 'Availability could not be updated.');
    else setDriver(data);
    setIsSavingAvailability(false);
  };

  const updateSetupField = (field, value) => {
    setSetupForm((current) => ({ ...current, [field]: value }));
    setSetupErrors((current) => ({ ...current, [field]: '' }));
    setError('');
  };

  const saveDriverProfile = async (event) => {
    event.preventDefault();
    const nextErrors = {};
    if (!setupForm.name.trim()) nextErrors.name = 'Name is required.';
    if (!setupForm.phone.trim()) nextErrors.phone = 'Phone is required.';
    if (!setupForm.vehicleType.trim()) nextErrors.vehicleType = 'Vehicle type is required.';
    setSetupErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setIsSavingSetup(true);
    setError('');
    setSetupMessage('');
    const { data: { user: authenticatedUser }, error: userError } = await supabase.auth.getUser();
    if (userError || !authenticatedUser) {
      setError('Please log in as a driver.');
      setIsSavingSetup(false);
      return;
    }

    const { data: existingDriver, error: existingError } = await supabase
      .from('drivers')
      .select('id, name, phone, profile_id, vehicle_type, available, is_available, status, current_lat, current_lng, last_location_update, latitude, longitude')
      .eq('profile_id', authenticatedUser.id)
      .maybeSingle();

    if (existingError) {
      setError(existingError.message || 'Unable to check your driver profile.');
      setIsSavingSetup(false);
      return;
    }
    if (existingDriver) {
      setDriver(existingDriver);
      setError('');
      setSetupMessage('Driver profile loaded.');
      setIsSavingSetup(false);
      return;
    }

    const { data: createdDriver, error: insertError } = await supabase
      .from('drivers')
      .insert({
        profile_id: authenticatedUser.id,
        name: setupForm.name.trim(),
        phone: setupForm.phone.trim(),
        vehicle_type: setupForm.vehicleType.trim(),
        available: false,
        is_available: false,
        status: 'OFFLINE'
      })
      .select('id, name, phone, profile_id, vehicle_type, available, is_available, status, current_lat, current_lng, last_location_update, latitude, longitude')
      .single();

    if (insertError) {
      console.error('[driver-profile-setup]', {
        message: insertError.message,
        code: insertError.code,
        status: insertError.status,
        details: insertError.details,
        hint: insertError.hint
      });
      setError(insertError.code === '42501' ? "You don't have permission to create this driver profile." : 'Unable to create your driver profile. Please try again.');
      setIsSavingSetup(false);
      return;
    }

    setDriver(createdDriver);
    setError('');
    setSetupMessage('Driver profile created successfully.');
    setIsSavingSetup(false);
  };

  const advancePickup = async (pickup) => {
    const status = nextStatus(pickup.status);
    if (!supabase || !status || updatingPickupId) return;
    setUpdatingPickupId(pickup.id);
    setError('');
    const { error: updateError } = await supabase.rpc('update_pickup_status', {
      p_pickup_id: pickup.id,
      p_new_status: status,
      p_lat: driver?.current_lat,
      p_lng: driver?.current_lng
    });

    if (updateError) setError(updateError.message || 'Pickup status could not be updated.');
    else await refetch();
    setUpdatingPickupId(null);
  };

  const handlePrimaryAction = (pickup) => {
    if (pickup.status === 'ASSIGNED') {
      setFlowPickup(pickup);
      return;
    }
    void advancePickup(pickup);
  };

  if (loading || pickupsLoading) {
    return <section className="driver-workspace" aria-live="polite"><div className="driver-skeleton-heading"><span className="driver-skeleton skeleton-kicker" /><span className="driver-skeleton skeleton-title" /><span className="driver-skeleton skeleton-copy" /></div><div className="driver-stats-strip driver-stats-skeleton" aria-label="Loading quick stats">{[1, 2, 3, 4].map((item) => <div key={item}><span className="driver-skeleton skeleton-label" /><strong className="driver-skeleton skeleton-value" /></div>)}</div><div className="driver-skeleton driver-skeleton-card" /></section>;
  }

  if (!driver) {
    return (
      <section className="driver-workspace">
        <div className="driver-workspace-heading">
          <div>
            <span className="kicker-badge"><span className="kicker-dot dot-emerald"></span>DRIVER OPERATIONS</span>
            <h1>Set up your driver profile.</h1>
            <p>Complete your profile before joining the care network.</p>
          </div>
        </div>
        {error ? <div className="driver-error" role="alert">{error}</div> : null}
        <form className="driver-profile-setup" onSubmit={saveDriverProfile}>
          <span className="section-eyebrow">DRIVER PROFILE</span>
          <h2>Set Up Driver Profile</h2>
          <div className="form-group"><label htmlFor="driver-name">Name</label><input id="driver-name" value={setupForm.name} onChange={(event) => updateSetupField('name', event.target.value)} />{setupErrors.name ? <span className="field-error">{setupErrors.name}</span> : null}</div>
          <div className="form-group"><label htmlFor="driver-phone">Phone</label><input id="driver-phone" type="tel" value={setupForm.phone} onChange={(event) => updateSetupField('phone', event.target.value)} />{setupErrors.phone ? <span className="field-error">{setupErrors.phone}</span> : null}</div>
          <div className="form-group"><label htmlFor="driver-vehicle-type">Vehicle Type</label><input id="driver-vehicle-type" value={setupForm.vehicleType} onChange={(event) => updateSetupField('vehicleType', event.target.value)} placeholder="e.g. Refrigerated van" />{setupErrors.vehicleType ? <span className="field-error">{setupErrors.vehicleType}</span> : null}</div>
          <p className="workspace-meta">Your profile starts offline. You can change availability after setup.</p>
          <button type="submit" className="btn-pill-primary" disabled={isSavingSetup}>{isSavingSetup ? 'Saving...' : 'Save Driver Profile'}</button>
        </form>
      </section>
    );
  }

  const isAvailable = Boolean(driver?.available);

  return (
    <section className="driver-workspace">
      <div className="driver-workspace-heading">
        <div>
          <span className="kicker-badge"><span className="kicker-dot dot-emerald"></span>DRIVER OPERATIONS</span>
          <h1>Good to see you, {profile?.name?.split(' ')[0] || 'driver'}.</h1>
          <p>Keep your route clear, your cargo safe, and your handoffs visible.</p>
        </div>
        <button className={`driver-availability-toggle ${isAvailable ? 'is-available' : ''}`} onClick={toggleAvailability} disabled={isSavingAvailability || hasActivePickup} aria-pressed={isAvailable} title={hasActivePickup ? 'Finish your active pickup before changing availability' : undefined}>
          <span className="availability-indicator" />
          <span>{isSavingAvailability ? 'Saving...' : isAvailable ? 'Available for Dispatch' : 'Offline'}</span>
        </button>
      </div>

      {setupMessage ? <div className="driver-success" role="status">{setupMessage}</div> : null}
      {workspaceError ? <div className="driver-error" role="alert">{workspaceError}</div> : null}

      <div className="driver-stats-strip" aria-label="Driver stats">
        <div><span>Today&apos;s pickups</span><strong>{todayPickups}</strong></div>
        <div><span>This week</span><strong>{weeklyPickups}</strong></div>
        <div><span>Total completed</span><strong>{deliveredCount}</strong></div>
        <div><span>Rescued cargo</span><strong title={rescuedWeight ? `${rescuedWeight} kg rescued` : 'No verified rescue weights yet'}>{rescuedWeight ? `${Math.round(rescuedWeight * 10) / 10} kg` : '0 kg'}</strong></div>
      </div>

      <div className="driver-dashboard-grid">
        <div className="driver-main-column">
          <div className="driver-section-heading">
            <div><span className="section-eyebrow">NOW</span><h2>Current pickup</h2></div>
            <span className="live-status"><span />Live feed</span>
          </div>
          {currentPickup ? (
            <article className="current-pickup-card">
              <div className="pickup-card-topline"><span className={`pickup-status pickup-status-${currentPickup.status.toLowerCase()}`}>{statusLabel(currentPickup.status)}</span><span>{formatDate(currentPickup.pickup_time)}</span></div>
              <h3>{pickupTitle(currentPickup)}</h3>
              <div className="pickup-parties"><span><b>Donor</b>{currentPickup.donor?.name || 'Donor partner'}</span><span><b>Shelter</b>{currentPickup.shelters?.organization_name || 'Shelter destination pending'}</span></div>
              <div className="route-pair"><div><span className="route-label">Collect from</span><strong>{currentPickup.donations?.pickup_address || 'Donor address pending'}</strong></div><span className="route-arrow">→</span><div><span className="route-label">Deliver to</span><strong>{currentPickup.shelters?.address || currentPickup.shelters?.organization_name || 'Shelter address pending'}</strong></div></div>
              <div className="pickup-card-footer"><span>{currentPickup.donations?.quantity || '—'} {currentPickup.donations?.unit || 'units'} cargo</span><div className="pickup-actions"><button className="btn-pill-secondary pickup-details-button" onClick={() => setDetailsPickup(currentPickup)}>View Details</button><button className="btn-pill-primary" onClick={() => handlePrimaryAction(currentPickup)} disabled={!nextStatus(currentPickup.status) || updatingPickupId === currentPickup.id}>{updatingPickupId === currentPickup.id ? 'Updating...' : actionLabel(currentPickup.status)}</button></div></div>
            </article>
          ) : <div className="driver-empty-state"><strong>No active pickup right now.</strong><span>Stay available and new assignments will appear here in real time.</span></div>}

          {currentPickup ? <LazyLiveMapView pickups={[currentPickup]} /> : null}

          <div className="driver-section-heading upcoming-heading"><div><span className="section-eyebrow">QUEUE</span><h2>Upcoming pickups</h2></div><span className="queue-count">{upcomingPickups.length} scheduled</span></div>
          <div className="upcoming-pickups-list">
            {upcomingPickups.length ? upcomingPickups.map((pickup) => <article className="upcoming-pickup-row" key={pickup.id}><div className="schedule-marker"><strong>{new Date(pickup.pickup_time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</strong><span>{formatDate(pickup.pickup_time, false).split(',')[0]}</span></div><div className="upcoming-pickup-copy"><strong>{pickup.donor?.name || 'Donor partner'} <span className="route-inline-arrow">→</span> {pickup.shelters?.organization_name || 'Shelter destination pending'}</strong><span>{pickup.donations?.food_name || 'Surplus donation'} · {pickup.donations?.quantity || '—'} {pickup.donations?.unit || 'units'}</span></div><span className={`pickup-status pickup-status-${pickup.status.toLowerCase()}`}>{statusLabel(pickup.status)}</span><button className="upcoming-view-button" onClick={() => setDetailsPickup(pickup)}>View</button></article>) : <div className="driver-empty-state compact"><span>No upcoming pickups. Stay available for dispatch!</span></div>}
          </div>
        </div>

        <aside className="driver-side-column">
          <div className="driver-side-card vehicle-card"><span className="section-eyebrow">YOUR VEHICLE</span><div className="vehicle-icon">▰</div><h3>{driver?.vehicle_type || 'Vehicle profile'}</h3><p>{isAvailable ? 'Ready for a new route' : 'Currently off duty'}</p><div className="capacity-meter"><span style={{ width: `${Math.min(100, Number(driver?.capacity_kg || 0) / 5)}%` }} /></div><small>{driver?.capacity_kg ? `${driver.capacity_kg} kg capacity` : 'Add your cargo capacity'}</small></div>
          <div className="driver-side-card quick-note-card"><span className="section-eyebrow">HANDOFF REMINDER</span><h3>Every delivery tells a story.</h3><p>Confirm the handoff at the shelter so donors can see the impact of the route you completed.</p></div>
        </aside>
      </div>

      {flowPickup ? (
        <PickupFlow pickup={flowPickup} driver={driver} onClose={() => setFlowPickup(null)} onComplete={() => { setFlowPickup(null); void refetch(); }} />
      ) : null}

      {detailsPickup ? (
        <div className="driver-modal-backdrop" role="presentation" onClick={() => setDetailsPickup(null)}>
          <div className="driver-modal-window pickup-details-modal" role="dialog" aria-modal="true" aria-labelledby="pickup-details-title" onClick={(event) => event.stopPropagation()}>
            <button className="driver-modal-close" onClick={() => setDetailsPickup(null)} aria-label="Close pickup details">×</button>
            <span className={`pickup-status pickup-status-${detailsPickup.status.toLowerCase()}`}>{statusLabel(detailsPickup.status)}</span>
            <h2 id="pickup-details-title">{pickupTitle(detailsPickup)}</h2>
            <div className="pickup-detail-grid"><div><span>Donor</span><strong>{detailsPickup.donor?.name || 'Donor partner'}</strong><small>{detailsPickup.donor?.phone || detailsPickup.donor?.email || 'Contact details unavailable'}</small></div><div><span>Shelter</span><strong>{detailsPickup.shelters?.organization_name || 'Shelter destination pending'}</strong><small>{detailsPickup.shelters?.phone || 'Contact details unavailable'}</small></div><div><span>Cargo</span><strong>{detailsPickup.donations?.quantity || '—'} {detailsPickup.donations?.unit || 'units'}</strong><small>{detailsPickup.donations?.food_name || 'Surplus goods'}</small></div><div><span>Scheduled</span><strong>{formatDate(detailsPickup.pickup_time)}</strong><small>{detailsPickup.notes || 'No additional notes'}</small></div></div>
            <div className="pickup-address-list"><a href={navigationUrl(detailsPickup.donations?.pickup_address)} target="_blank" rel="noreferrer"><span>Pickup address</span><strong>{detailsPickup.donations?.pickup_address || 'Address pending'} ↗</strong></a><a href={navigationUrl(detailsPickup.shelters?.address)} target="_blank" rel="noreferrer"><span>Delivery address</span><strong>{detailsPickup.shelters?.address || 'Address pending'} ↗</strong></a></div>
          </div>
        </div>
      ) : null}
    </section>
  );
}