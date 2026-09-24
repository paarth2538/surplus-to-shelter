import React, { useEffect, useState, useRef } from 'react';
import { findMatchesForDonation, findMatchesForRequest, respondToMatch } from '../lib/matching';
import { supabase } from '../lib/supabase';

function safeErrorLog(scope, error) {
  console.error(`[match-${scope}]`, {
    message: error?.message,
    code: error?.code,
    status: error?.status,
    details: error?.details,
    hint: error?.hint
  });
}

function distanceLabel(distance) {
  return distance === null || distance === undefined ? 'Distance unavailable' : `${Number(distance).toFixed(1)} km away`;
}

function expiryLabel(warning) {
  if (warning === 'expires-before-needed-by') return 'Expiry before need date';
  if (warning === 'expired') return 'Expired';
  return 'Expiry window fits';
}

/** Build a plain-language rationale sentence from real match score fields. */
function buildRationale(match) {
  const lines = [];
  const donation = match.donations;
  const request = match.shelter_requests;

  // Category match
  if (donation?.food_type && request?.food_type) {
    if (donation.food_type === request.food_type) {
      lines.push(`Category match: ${donation.food_type}.`);
    } else {
      lines.push(`Category: ${donation.food_type} (requested: ${request.food_type}).`);
    }
  }

  // Quantity coverage
  const coverage = Number(match.quantity_coverage);
  if (!Number.isNaN(coverage)) {
    if (coverage >= 100) {
      lines.push(`Fully covers the requested quantity.`);
    } else if (coverage >= 50) {
      lines.push(`Covers ${coverage.toFixed(0)}% of the requested quantity.`);
    } else {
      lines.push(`Partially covers ${coverage.toFixed(0)}% of the requested quantity.`);
    }
  }

  // Distance
  if (match.distance_km !== null && match.distance_km !== undefined) {
    lines.push(`${Number(match.distance_km).toFixed(1)} km away.`);
  }

  // Expiry
  if (match.expiry_warning === 'expires-before-needed-by') {
    lines.push(`⚠️ Donation may expire before the shelter's need date.`);
  } else if (match.expiry_warning === 'expired') {
    lines.push(`🚫 Donation is already expired.`);
  } else {
    lines.push(`Expiry window fits the shelter's need date.`);
  }

  // Urgency
  if (match.urgency_level) {
    lines.push(`Shelter urgency: ${match.urgency_level.toUpperCase()}.`);
  }

  return lines.join(' ');
}

export default function MatchList({ resourceType, resourceId }) {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [respondingId, setRespondingId] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  // Map of donation_id -> { expiry_risk, risk_reason } fetched from RPC
  const [riskMap, setRiskMap] = useState({});
  const riskFetchedRef = useRef(new Set());

  const loadMatches = async () => {
    if (!supabase || !resourceId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error: loadError } = await supabase
      .from('matches')
      .select('id, donation_id, shelter_request_id, match_score, distance_km, quantity_coverage, urgency_level, expiry_warning, status, created_at, donations(food_name, food_type, quantity, unit, expiry_time, expiry_risk), shelter_requests(item_name, food_type, quantity, unit, urgency_level, needed_by, shelter_id, shelters(organization_name))')
      .eq(resourceType === 'donation' ? 'donation_id' : 'shelter_request_id', resourceId)
      .order('match_score', { ascending: false });

    if (loadError) {
      safeErrorLog('load', loadError);
      setError('Matches are not available yet. Apply the Phase 5 database migration first.');
    } else {
      setMatches(data ?? []);
      setError('');
    }
    setLoading(false);
  };

  useEffect(() => {
    void loadMatches();
  }, [resourceType, resourceId]);

  // Fetch expiry-risk assessment for donation-type resource matches
  useEffect(() => {
    if (resourceType !== 'donation' || !supabase) return;
    matches.forEach((match) => {
      const did = match.donation_id;
      if (!did || riskFetchedRef.current.has(did)) return;
      riskFetchedRef.current.add(did);
      // Use the column value already on donations if present, else call RPC
      if (match.donations?.expiry_risk) {
        setRiskMap((prev) => ({
          ...prev,
          [did]: { expiry_risk: match.donations.expiry_risk, risk_reason: '' }
        }));
        return;
      }
      supabase
        .rpc('get_donation_risk_assessment', { p_donation_id: did })
        .then(({ data: rpcData, error: rpcError }) => {
          if (!rpcError && rpcData) {
            setRiskMap((prev) => ({
              ...prev,
              [did]: { expiry_risk: rpcData.expiry_risk, risk_reason: rpcData.risk_reason || '' }
            }));
          }
        });
    });
  }, [matches, resourceType]);

  const runMatching = async () => {
    setRunning(true);
    setError('');
    setMessage('');
    try {
      const data = resourceType === 'donation'
        ? await findMatchesForDonation(resourceId)
        : await findMatchesForRequest(resourceId);
      setMatches(data);
      setMessage(data.length ? `${data.length} potential match${data.length === 1 ? '' : 'es'} found.` : 'No viable matches found within the distance and expiry limits.');
    } catch (matchError) {
      safeErrorLog('calculate', matchError);
      setError('Unable to calculate matches. Apply the Phase 5 migration and try again.');
    } finally {
      setRunning(false);
    }
  };

  const handleResponse = async (matchId, status) => {
    setRespondingId(matchId);
    setError('');
    try {
      const updated = await respondToMatch(matchId, status);
      setMatches((current) => current.map((match) => match.id === matchId ? { ...match, ...updated } : match));
    } catch (matchError) {
      safeErrorLog('response', matchError);
      setError('Unable to update this match. Please try again.');
    } finally {
      setRespondingId(null);
    }
  };

  if (loading) return <p className="match-muted">Loading matches...</p>;

  return (
    <section className="match-list-section" aria-label="Potential matches">
      <div className="match-list-heading">
        <div>
          <span className="kicker-badge">SMART MATCHES</span>
          <h4>Potential matches</h4>
        </div>
        <button className="btn-pill-secondary" onClick={runMatching} disabled={running}>
          {running ? 'Finding matches...' : 'Find Matches'}
        </button>
      </div>
      {message ? <p className="match-success" role="status">{message}</p> : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {!matches.length && !error ? <p className="match-muted">No viable matches found within distance and expiry limits.</p> : null}
      <div className="match-list">
        {matches.map((match) => {
          const request = match.shelter_requests;
          const shelterName = request?.shelters?.organization_name || 'Shelter request';
          const risk = riskMap[match.donation_id];
          const riskLevel = risk?.expiry_risk || null;
          const rationale = buildRationale(match);
          return (
            <article className="match-card" key={match.id}>
              <div className="match-card-topline">
                <div>
                  <strong>{resourceType === 'donation' ? shelterName : request?.item_name || 'Donation match'}</strong>
                  <span>{Number(match.match_score).toFixed(0)}% Match · {distanceLabel(match.distance_km)}</span>
                </div>
                <div className="match-card-badges">
                  <span className={`match-status-pill match-status-${match.status}`}>{match.status.toUpperCase()}</span>
                  {riskLevel ? (
                    <span className={`risk-pill risk-${riskLevel}`} title={risk?.risk_reason || ''}>
                      {riskLevel.toUpperCase()} RISK
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="match-metrics">
                <span><strong>Quantity</strong>{Number(match.quantity_coverage).toFixed(0)}% coverage</span>
                <span><strong>Urgency</strong>{match.urgency_level.toUpperCase()}</span>
                <span><strong>Expiry</strong>{expiryLabel(match.expiry_warning)}</span>
              </div>
              {rationale ? (
                <div className="match-rationale">
                  <span className="match-rationale-label">Why this match?</span>
                  <p>{rationale}</p>
                </div>
              ) : null}
              {match.status === 'proposed' ? (
                <div className="match-actions">
                  <button className="btn-pill-primary" onClick={() => handleResponse(match.id, 'accepted')} disabled={respondingId === match.id}>Accept Match</button>
                  <button className="btn-modal-cancel" onClick={() => handleResponse(match.id, 'dismissed')} disabled={respondingId === match.id}>Dismiss</button>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
