import React from 'react';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ allowedRoles, onNavigate, children }) {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return <div className="auth-loading-state">Restoring your secure session...</div>;
  }

  if (!user || !profile) {
    return <div className="auth-loading-state">Redirecting to secure sign in...</div>;
  }

  if (!allowedRoles.includes(profile.role)) {
    return (
      <main className="dashboard-shell">
        <section className="dashboard-panel access-denied-panel">
          <span className="kicker-badge">ACCESS CONTROL</span>
          <h1>That workspace is not assigned to your account.</h1>
          <p>Your {profile.role} account can only open its assigned dashboard.</p>
          <button className="btn-pill-primary" onClick={() => onNavigate(`/${profile.role}`)}>
            Open My Dashboard
          </button>
        </section>
      </main>
    );
  }

  return children;
}