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
        <h3>Community demand trends</h3>
        <p className="match-muted">Not enough community data yet. As more shelter requests come in, demand trends will appear here.</p>
      </div>
    );
  }

  const maxCount = Math.max(...(insights.top_categories || []).map((c) => c.count || 0), 1);

  return (
    <div className="demand-insights-card">
      <span className="kicker-badge">COMMUNITY DEMAND</span>
      <h3>Community demand trends</h3>
      <p className="match-muted" style={{ marginBottom: 12 }}>See what your community needs most to plan your requests better.</p>
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

export default function ShelterDashboard({ user, onNavigate }) {
  const { allPickups, loading, error } = useDispatchData(user?.id, 'shelter', { initialTab: 'all' });
  return (
    <section className="visibility-workspace">
      <span className="kicker-badge"><span className="kicker-dot dot-emerald" />SHELTER INTAKE</span>
      <h1>Incoming deliveries</h1>
      <p>See what is on the way and prepare your receiving team.</p>
      {loading ? (
        <div className="dispatch-empty">Loading incoming deliveries...</div>
      ) : error ? (
        <div className="driver-error">{error}</div>
      ) : (
        <div className="visibility-list">
          {allPickups.length ? allPickups.map((pickup) => (
            <button
              className={`visibility-row ${pickup.status === 'IN_TRANSIT' || pickup.status === 'PICKUP' ? 'is-arriving' : ''}`}
              key={pickup.id}
              onClick={() => onNavigate(`/shelter/pickup/${pickup.id}`)}
            >
              <span className={`dispatch-status dispatch-status-${pickup.status.toLowerCase()}`}>
                {pickup.status === 'IN_TRANSIT' ? 'ARRIVING SOON' : pickup.status.replace('_', ' ')}
              </span>
              <span>
                <strong>{pickup.drivers?.name || 'Driver being assigned'}</strong>
                <small>{pickup.donations?.food_name || 'Surplus goods'} · {pickup.donations?.quantity || '—'} {pickup.donations?.unit || 'units'}</small>
              </span>
              <span className="visibility-arrow">View →</span>
            </button>
          )) : (
            <div className="driver-empty-state">No incoming deliveries yet.</div>
          )}
        </div>
      )}
      <DemandInsightsCard />
    </section>
  );
}