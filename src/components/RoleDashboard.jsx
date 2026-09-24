import React from 'react';
import { useAuth } from '../context/AuthContext';

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

export default function RoleDashboard({ onNavigate, onSignOut }) {
  const { profile } = useAuth();
  const copy = dashboardCopy[profile.role] ?? dashboardCopy.donor;

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
        <p className="dashboard-phase-note">Phase 2 authentication is active. Operational workflows will be added in later phases.</p>
      </section>
    </main>
  );
}