import React, { useEffect, useState } from 'react';
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

export default function MatchList({ resourceType, resourceId }) {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [respondingId, setRespondingId] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const loadMatches = async () => {
    if (!supabase || !resourceId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error: loadError } = await supabase
      .from('matches')
      .select('id, donation_id, shelter_request_id, match_score, distance_km, quantity_coverage, urgency_level, expiry_warning, status, created_at, donations(food_name, food_type, quantity, unit, expiry_time), shelter_requests(item_name, food_type, quantity, unit, urgency_level, needed_by, shelter_id, shelters(organization_name))')
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
          return (
            <article className="match-card" key={match.id}>
              <div className="match-card-topline">
                <div>
                  <strong>{resourceType === 'donation' ? shelterName : request?.item_name || 'Donation match'}</strong>
                  <span>{Number(match.match_score).toFixed(0)}% Match · {distanceLabel(match.distance_km)}</span>
                </div>
                <span className={`match-status-pill match-status-${match.status}`}>{match.status.toUpperCase()}</span>
              </div>
              <div className="match-metrics">
                <span><strong>Quantity</strong>{Number(match.quantity_coverage).toFixed(0)}% coverage</span>
                <span><strong>Urgency</strong>{match.urgency_level.toUpperCase()}</span>
                <span><strong>Expiry</strong>{expiryLabel(match.expiry_warning)}</span>
              </div>
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
