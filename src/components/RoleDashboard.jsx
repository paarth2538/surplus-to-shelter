import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

const dashboardCopy = {
  donor: {
    title: 'Donor workspace',
    description: 'Post surplus food and keep an eye on the care network receiving it.'
  },
  shelter: {
    title: 'Shelter workspace',
    description: 'Keep your organization profile and current community needs ready for future matching.'
  },
  driver: {
    title: 'Driver workspace',
    description: 'Your assigned pickup workflow will appear here when dispatch operations are enabled.'
  },
  admin: {
    title: 'Admin workspace',
    description: 'Manage trusted network accounts and oversee platform operations.'
  }
};

export default function RoleDashboard({ onNavigate, onSignOut, onDonate, donationRefreshKey }) {
  const { user, profile } = useAuth();
  const [donations, setDonations] = useState([]);
  const [loadingDonations, setLoadingDonations] = useState(profile.role === 'donor');
  const [donationError, setDonationError] = useState('');
  const copy = dashboardCopy[profile.role] ?? dashboardCopy.donor;

  useEffect(() => {
    if (profile.role !== 'donor' || !user?.id || !supabase) return undefined;
    let isMounted = true;

    const loadDonations = async () => {
      setLoadingDonations(true);
      setDonationError('');
      const { data, error } = await supabase
        .from('donations')
        .select('id, food_name, food_type, description, quantity, unit, pickup_address, expiry_time, status, created_at')
        .eq('donor_id', user.id)
        .order('created_at', { ascending: false });

      if (!isMounted) return;
      if (error) {
        console.error('[donation-history]', {
          message: error.message,
          code: error.code,
          status: error.status,
          details: error.details,
          hint: error.hint
        });
        setDonationError('Unable to load donations. Please try again.');
      } else {
        setDonations(data ?? []);
      }
      setLoadingDonations(false);
    };

    void loadDonations();
    return () => { isMounted = false; };
  }, [profile.role, user?.id, donationRefreshKey]);

  const formatDate = (value) => new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));

  return (
    <main className="dashboard-shell">
      <header className="dashboard-topbar">
        <button className="brand-logo" onClick={() => onNavigate('/')}>
          <div className="logo-icon-wrap">
            <svg className="brand-circles-svg" viewBox="0 0 48 48" fill="none" aria-hidden="true">
              <circle cx="20" cy="24" r="14" fill="#2b60ec" fillOpacity="0.18" />
              <circle cx="28" cy="24" r="14" fill="#2b60ec" />
              <circle cx="20" cy="24" r="8" fill="#ffffff" />
            </svg>
          </div>
          <div className="brand-text">
            <span className="brand-title">surplus<span className="brand-accent">2</span>shelter</span>
            <span className="brand-sub">DIRECT CARE LOGISTICS</span>
          </div>
        </button>
        <button className="btn-pill-secondary" onClick={onSignOut}>Log out</button>
      </header>
      <section className="dashboard-panel">
        <span className="kicker-badge"><span className="kicker-dot dot-emerald"></span>{profile.role.toUpperCase()} ACCOUNT</span>
        <h1>{copy.title}</h1>
        <p>{copy.description}</p>
        <div className="dashboard-profile-summary">
          <div className="user-avatar-pill">{(profile.name || profile.email || 'U').slice(0, 2).toUpperCase()}</div>
          <div>
            <strong>{profile.name || 'Network member'}</strong>
            <span>{profile.email}</span>
          </div>
        </div>
        {profile.role === 'donor' ? (
          <section className="donation-history-section" aria-labelledby="donation-history-heading">
            <div className="donation-history-header">
              <div>
                <span className="kicker-badge">DONOR ACTIVITY</span>
                <h2 id="donation-history-heading">My Donations</h2>
              </div>
              <button className="btn-pill-primary" onClick={onDonate}>Donate Surplus</button>
            </div>

            {loadingDonations ? <p className="dashboard-muted">Loading donations...</p> : null}
            {donationError ? <p className="form-error" role="alert">{donationError}</p> : null}
            {!loadingDonations && !donationError && donations.length === 0 ? (
              <div className="donation-empty-state">
                <p>No surplus donations yet.</p>
                <button className="btn-pill-secondary" onClick={onDonate}>Donate Surplus</button>
              </div>
            ) : null}
            <div className="donation-history-list">
              {donations.map((donation) => (
                <article className="donation-history-card" key={donation.id}>
                  <div className="donation-card-heading">
                    <div>
                      <h3>{donation.food_name}</h3>
                      <span>{donation.food_type}</span>
                    </div>
                    <span className="donation-status-pill">{donation.status.toUpperCase()}</span>
                  </div>
                  <div className="donation-card-grid">
                    <span><strong>{donation.quantity} {donation.unit}</strong> quantity</span>
                    <span><strong>Expires</strong> {formatDate(donation.expiry_time)}</span>
                    <span><strong>Pickup</strong> {donation.pickup_address}</span>
                    <span><strong>Posted</strong> {formatDate(donation.created_at)}</span>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : (
          <p className="dashboard-phase-note">Phase 2 authentication is active. Operational workflows will be added in later phases.</p>
        )}
      </section>
    </main>
  );
}