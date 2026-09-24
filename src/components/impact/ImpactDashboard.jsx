import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import useImpactData from '../../hooks/useImpactData';

function formatNumber(value) {
  if (value == null) return null;
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return String(Math.round(value * 100) / 100);
}

function formatDate(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(value));
}

function unitLabel(unit) {
  const map = {
    kg: 'kg', kgs: 'kg', kilogram: 'kg', kilograms: 'kg',
    lb: 'lbs', lbs: 'lbs', pound: 'lbs', pounds: 'lbs',
    g: 'g', gm: 'g', gram: 'g', grams: 'g',
    meal: 'meals', meals: 'meals', serving: 'servings', servings: 'servings',
    box: 'boxes', boxes: 'boxes', crate: 'crates', crates: 'crates',
    packet: 'packets', packets: 'packets', piece: 'pieces', pieces: 'pieces'
  };
  return map[unit?.toLowerCase()?.trim()] || unit || 'units';
}

/** Simple SVG bar chart for food rescued over time */
function MiniBarChart({ deliveries }) {
  if (!deliveries.length) return null;

  // Group deliveries by date
  const byDate = {};
  deliveries.forEach((d) => {
    const date = d.delivered_at
      ? new Date(d.delivered_at).toLocaleDateString('en', { month: 'short', day: 'numeric' })
      : 'Unknown';
    byDate[date] = (byDate[date] || 0) + 1;
  });

  const entries = Object.entries(byDate).slice(-12);
  if (entries.length < 2) return null;

  const max = Math.max(...entries.map(([, v]) => v), 1);
  const barWidth = Math.max(16, Math.min(40, 360 / entries.length - 4));
  const chartWidth = entries.length * (barWidth + 4);
  const chartHeight = 120;

  return (
    <div className="impact-chart-wrap">
      <span className="section-eyebrow">DELIVERIES OVER TIME</span>
      <svg
        className="impact-bar-chart"
        viewBox={`0 0 ${chartWidth} ${chartHeight + 24}`}
        width={chartWidth}
        height={chartHeight + 24}
        aria-label="Deliveries over time bar chart"
      >
        {entries.map(([label, count], i) => {
          const barHeight = (count / max) * chartHeight;
          const x = i * (barWidth + 4);
          const y = chartHeight - barHeight;
          return (
            <g key={label}>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={barHeight}
                rx={4}
                fill="#2b60ec"
                opacity={0.85}
              />
              <text
                x={x + barWidth / 2}
                y={chartHeight + 14}
                textAnchor="middle"
                fontSize="9"
                fill="#64748b"
              >
                {label}
              </text>
              <text
                x={x + barWidth / 2}
                y={y - 4}
                textAnchor="middle"
                fontSize="10"
                fontWeight="700"
                fill="#0f172a"
              >
                {count}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** Food type breakdown chart */
function FoodTypeChart({ deliveries }) {
  if (!deliveries.length) return null;

  const byType = {};
  deliveries.forEach((d) => {
    const type = d.donations?.food_type || 'Other';
    byType[type] = (byType[type] || 0) + 1;
  });

  const entries = Object.entries(byType).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const total = entries.reduce((sum, [, v]) => sum + v, 0);
  if (!entries.length) return null;

  const colors = ['#2b60ec', '#047857', '#7c3aed', '#ea580c', '#0891b2', '#dc2626'];

  return (
    <div className="impact-chart-wrap">
      <span className="section-eyebrow">FOOD CATEGORIES</span>
      <div className="impact-food-type-chart">
        {entries.map(([type, count], i) => (
          <div className="food-type-row" key={type}>
            <div className="food-type-label">
              <span className="food-type-dot" style={{ background: colors[i % colors.length] }} />
              <span>{type}</span>
            </div>
            <div className="food-type-bar-wrap">
              <div
                className="food-type-bar"
                style={{
                  width: `${(count / total) * 100}%`,
                  background: colors[i % colors.length]
                }}
              />
            </div>
            <span className="food-type-count">{count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ImpactDashboard({ role: roleProp, onNavigate: _onNavigate }) {
  const { user, profile } = useAuth();
  const role = roleProp || profile?.role || 'donor';

  // Resolve shelter/driver IDs for scoping
  const [scopeId, setScopeId] = useState(null);
  const [scopeLoading, setScopeLoading] = useState(role === 'shelter' || role === 'driver');

  useEffect(() => {
    if (!supabase || !user?.id) return;
    let cancelled = false;

    const resolve = async () => {
      setScopeLoading(true);
      if (role === 'shelter') {
        const { data } = await supabase
          .from('shelters')
          .select('id')
          .eq('profile_id', user.id)
          .limit(1)
          .maybeSingle();
        if (!cancelled) setScopeId(data?.id || null);
      } else if (role === 'driver') {
        const { data } = await supabase
          .from('drivers')
          .select('id')
          .or(`user_id.eq.${user.id},profile_id.eq.${user.id}`)
          .limit(1)
          .maybeSingle();
        if (!cancelled) setScopeId(data?.id || null);
      }
      if (!cancelled) setScopeLoading(false);
    };

    if (role === 'shelter' || role === 'driver') {
      void resolve();
    } else {
      setScopeLoading(false);
    }

    return () => { cancelled = true; };
  }, [role, user?.id]);

  const {
    metrics,
    deliveries,
    loading,
    error,
    timeRange,
    setTimeRange,
    timeRanges,
    refetch
  } = useImpactData(user?.id, role, scopeId);

  const isLoading = loading || scopeLoading;

  const roleLabels = {
    donor: { eyebrow: 'DONOR IMPACT', title: 'Your donation impact', desc: 'See how your surplus contributions have made a difference.' },
    shelter: { eyebrow: 'SHELTER IMPACT', title: 'Your received deliveries', desc: 'Track the real food rescue reaching your community.' },
    driver: { eyebrow: 'DRIVER IMPACT', title: 'Your delivery impact', desc: 'See the food you have transported and the community meals enabled.' },
    admin: { eyebrow: 'PLATFORM IMPACT', title: 'Community impact dashboard', desc: 'Platform-wide metrics from all verified deliveries.' }
  };

  const labels = roleLabels[role] || roleLabels.donor;

  return (
    <section className="impact-dashboard" aria-labelledby="impact-heading">
      <div className="impact-dashboard-header">
        <div>
          <span className="kicker-badge">
            <span className="kicker-dot dot-emerald" />
            {labels.eyebrow}
          </span>
          <h1 id="impact-heading">{labels.title}</h1>
          <p>{labels.desc}</p>
        </div>
        <div className="impact-time-filters">
          {Object.entries(timeRanges).map(([key, label]) => (
            <button
              key={key}
              className={`impact-time-btn ${timeRange === key ? 'is-active' : ''}`}
              onClick={() => setTimeRange(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <div className="driver-error" role="alert">
          {error}
          <button className="btn-pill-secondary" onClick={refetch} style={{ marginLeft: 12 }}>Retry</button>
        </div>
      ) : null}

      {isLoading ? (
        <div className="impact-loading">
          <span className="wizard-spinner" />
          Loading impact data...
        </div>
      ) : !metrics || metrics.totalDeliveries === 0 ? (
        <div className="impact-empty-state">
          <div className="impact-empty-icon">📊</div>
          <h3>No completed deliveries yet</h3>
          <p>
            {role === 'donor'
              ? 'Once your donated surplus is picked up and delivered to a shelter, your impact will appear here.'
              : role === 'shelter'
                ? 'When deliveries arrive and are verified at your location, your impact metrics will be shown.'
                : role === 'driver'
                  ? 'Complete your first delivery to see your contribution to the rescue network.'
                  : 'Impact data will populate as deliveries are completed across the network.'}
          </p>
        </div>
      ) : (
        <>
          {/* Summary Stat Cards */}
          <div className="impact-stats-grid">
            <div className="impact-stat-card">
              <div className="impact-stat-icon">🚚</div>
              <div className="impact-stat-value">{formatNumber(metrics.totalDeliveries)}</div>
              <div className="impact-stat-label">Deliveries Completed</div>
            </div>

            <div className="impact-stat-card">
              <div className="impact-stat-icon">⚖️</div>
              <div className="impact-stat-value">
                {metrics.totalWeight != null ? formatNumber(metrics.totalWeight) : '—'}
              </div>
              <div className="impact-stat-label">
                {metrics.totalWeight != null ? 'Kg Food Rescued' : 'Weight data not available'}
              </div>
              {metrics.totalWeight == null && Object.keys(metrics.unitBreakdown).length > 0 ? (
                <div className="impact-stat-detail">
                  {Object.entries(metrics.unitBreakdown).map(([unit, qty]) => (
                    <span key={unit}>{formatNumber(qty)} {unitLabel(unit)}</span>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="impact-stat-card">
              <div className="impact-stat-icon">🍽️</div>
              <div className="impact-stat-value">
                {metrics.totalMeals != null ? formatNumber(metrics.totalMeals) : '—'}
              </div>
              <div className="impact-stat-label">
                {metrics.totalMeals != null ? 'Meals Rescued' : 'Meals data not available'}
              </div>
            </div>

            <div className="impact-stat-card">
              <div className="impact-stat-icon">🌿</div>
              <div className="impact-stat-value">
                {metrics.totalCo2e != null ? formatNumber(metrics.totalCo2e) : '—'}
              </div>
              <div className="impact-stat-label">
                {metrics.totalCo2e != null ? 'Kg CO₂e Avoided' : 'CO₂e data not available'}
              </div>
            </div>

            {(role === 'admin' || role === 'shelter') ? (
              <div className="impact-stat-card">
                <div className="impact-stat-icon">🏠</div>
                <div className="impact-stat-value">{formatNumber(metrics.sheltersServed)}</div>
                <div className="impact-stat-label">Shelters Served</div>
              </div>
            ) : null}

            {role === 'admin' ? (
              <>
                <div className="impact-stat-card">
                  <div className="impact-stat-icon">🤝</div>
                  <div className="impact-stat-value">{formatNumber(metrics.activeDonors)}</div>
                  <div className="impact-stat-label">Active Donors</div>
                </div>
                <div className="impact-stat-card">
                  <div className="impact-stat-icon">👷</div>
                  <div className="impact-stat-value">{formatNumber(metrics.activeDrivers)}</div>
                  <div className="impact-stat-label">Active Drivers</div>
                </div>
              </>
            ) : null}
          </div>

          {/* Unit breakdown for non-weight units */}
          {metrics.totalWeight != null && Object.keys(metrics.unitBreakdown).length > 0 ? (
            <div className="impact-unit-breakdown">
              <span className="section-eyebrow">QUANTITY BREAKDOWN</span>
              <div className="impact-unit-chips">
                {Object.entries(metrics.unitBreakdown).map(([unit, qty]) => (
                  <span className="impact-unit-chip" key={unit}>
                    <strong>{formatNumber(qty)}</strong> {unitLabel(unit)}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {/* Charts */}
          <div className="impact-charts-row">
            <MiniBarChart deliveries={deliveries} />
            <FoodTypeChart deliveries={deliveries} />
          </div>

          {/* Delivery Verification Log */}
          <div className="impact-verification-log">
            <div className="impact-log-header">
              <span className="section-eyebrow">VERIFIED DELIVERY LOG</span>
              <span className="impact-log-count">{deliveries.length} {deliveries.length === 1 ? 'record' : 'records'}</span>
            </div>
            <div className="impact-log-list">
              {deliveries.slice(0, 50).map((delivery) => (
                <article className="impact-log-row" key={delivery.id}>
                  <div className="impact-log-chain">
                    <span className="impact-chain-step">
                      <span className="chain-icon">📦</span>
                      <span>{delivery.donations?.food_name || 'Surplus donation'}</span>
                    </span>
                    <span className="chain-arrow">→</span>
                    <span className="impact-chain-step">
                      <span className="chain-icon">🚚</span>
                      <span>{delivery.drivers?.name || 'Driver'}</span>
                    </span>
                    <span className="chain-arrow">→</span>
                    <span className="impact-chain-step">
                      <span className="chain-icon">🏠</span>
                      <span>{delivery.shelters?.organization_name || 'Shelter'}</span>
                    </span>
                  </div>
                  <div className="impact-log-meta">
                    <span className={`impact-badge ${delivery.verified ? 'badge-verified' : 'badge-delivered'}`}>
                      {delivery.verified ? '✓ VERIFIED' : 'DELIVERED'}
                    </span>
                    {delivery.impact ? (
                      <span className="impact-log-stats">
                        {delivery.impact.weight_rescued != null ? `${delivery.impact.weight_rescued} kg` : null}
                        {delivery.impact.meals_rescued != null ? ` · ${delivery.impact.meals_rescued} meals` : null}
                      </span>
                    ) : null}
                    <span className="impact-log-date">{formatDate(delivery.delivered_at)}</span>
                    <span className="impact-log-qty">
                      {delivery.donations?.quantity || '—'} {unitLabel(delivery.donations?.unit)}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
