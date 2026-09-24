import { supabase } from './supabase';

export async function findMatchesForDonation(donationId) {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase.rpc('find_matches_for_donation', {
    p_donation_id: donationId
  });
  if (error) throw error;
  return data ?? [];
}

export async function findMatchesForRequest(requestId) {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase.rpc('find_matches_for_request', {
    p_shelter_request_id: requestId
  });
  if (error) throw error;
  return data ?? [];
}

export async function respondToMatch(matchId, status) {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase.rpc('respond_to_match', {
    p_match_id: matchId,
    p_status: status
  });
  if (error) throw error;
  return data;
}
