import React, { useEffect, useState } from 'react';
import useDispatchData from '../../hooks/useDispatchData';
import { supabase } from '../../lib/supabase';

function DemandInsightsCard() {
  const [insights, setInsights] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    supabase.rpc('get_demand_insights').then(({ data, error }) => {
      if (!error && data) setInsights(data);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="demand-insights-card">
        <span className="kicker-badge">COMMUNITY DEMAND</span>
        <p className="match-muted">Loading community trends...</p>
      </div>
    );
  }

  if (!insights || !insights.has_sufficient_data) {
    return (
      <div className="demand-insights-card">
        <span className="kicker-badge">COMMUNITY DEMAND</span>
        <h3>What shelters need most</h3>
        <p className="match-muted">Not enough community data yet. As more shelter requests come in, demand trends will appear here.</p>
      </div>
    );
  }

  const maxCount = Math.max(...(insights.top_categories || []).map((c) => c.count || 0), 1);

  return (
    <div className="demand-insights-card">
      <span className="kicker-badge">COMMUNITY DEMAND</span>
      <h3>What shelters need most</h3>
      <p className="match-muted" style={{ marginBottom: 12 }}>Based on recent shelter requests in your area.</p>
      {(insights.top_categories || []).map((cat) => (
        <div className="demand-category-bar" key={cat.food_type}>
          <span className="demand-category-label">{cat.food_type}</span>
          <div className="demand-bar-track">
            <div className="demand-bar-fill" style={{ width: `${Math.round((cat.count / maxCount) * 100)}%` }} />
          </div>
          <span className="demand-category-count">{cat.count}</span>
        </div>
      ))}
      {insights.urgency_breakdown && (
        <div className="demand-urgency-row">
          {Object.entries(insights.urgency_breakdown).map(([level, count]) => (
            <span key={level} className={`match-status-pill match-status-${level === 'critical' ? 'proposed' : 'accepted'}`}>
              {level.toUpperCase()}: {count}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DonorDashboard({ user, onNavigate }) {
  const { allPickups, loading, error } = useDispatchData(user?.id, 'donor', { initialTab: 'all' });
  return (
    <section className="visibility-workspace">
      <span className="kicker-badge"><span className="kicker-dot dot-emerald" />DONOR VISIBILITY</span>
      <h1>My pickups</h1>
      <p>Follow every surplus handoff from assignment to delivery.</p>
      {loading ? (
        <div className="dispatch-empty">Loading your pickups...</div>
      ) : error ? (
        <div className="driver-error">{error}</div>
      ) : (
        <div className="visibility-list">
          {allPickups.length ? allPickups.map((pickup) => (
            <button className="visibility-row" key={pickup.id} onClick={() => onNavigate(`/donor/pickup/${pickup.id}`)}>
              <span className={`dispatch-status dispatch-status-${pickup.status.toLowerCase()}`}>{pickup.status.replace('_', ' ')}</span>
              <span>
                <strong>{pickup.drivers?.name || 'Driver being assigned'}</strong>
                <small>{pickup.shelters?.organization_name || 'Shelter pending'} · {pickup.pickup_time ? new Date(pickup.pickup_time).toLocaleString() : 'Schedule pending'}</small>
              </span>
              <span className="visibility-arrow">View →</span>
            </button>
          )) : (
            <div className="driver-empty-state">No pickups have been assigned yet.</div>
          )}
        </div>
      )}
      <DemandInsightsCard />
    </section>
  );
}