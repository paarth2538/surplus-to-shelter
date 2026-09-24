import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { subscribeToPickups } from '../lib/realtime';

export default function usePickupTracking(pickupId, userId, role) {
  const [pickup, setPickup] = useState(null);
  const [loading, setLoading] = useState(Boolean(pickupId));
  const [error, setError] = useState('');

  const refetch = useCallback(async () => {
    if (!supabase || !pickupId) return;
    setLoading(true);
    const { data, error: queryError } = await supabase.from('pickups').select('id, driver_id, donor_id, shelter_id, status, scheduled_at, assigned_at, picked_up_at, delivered_at, pickup_verified_at, delivery_verified_at, pickup_lat, pickup_lng, delivery_lat, delivery_lng, proof_photo_url, proof_signature_url, delivery_proof_photo_url, delivery_proof_signature_url, temperature_c, notes, drivers(id, name, phone, vehicle_type, current_lat, current_lng, status), donations(id, food_name, quantity, unit, pickup_address, latitude, longitude, donor_id), shelters(id, organization_name, address, phone, latitude, longitude, profile_id), matches(id, status)').eq('id', pickupId).single();
    if (queryError) setError(queryError.message || 'Unable to load pickup tracking.');
    else {
      let donor = null;
      if (data?.donor_id || data?.donations?.donor_id) {
        const { data: donorProfile } = await supabase.from('profiles').select('id, name, email, phone').eq('id', data.donor_id || data.donations.donor_id).maybeSingle();
        donor = donorProfile;
      }
      setPickup({ ...data, donor });
    }
    setLoading(false);
  }, [pickupId]);

  useEffect(() => {
    let mounted = true;
    void Promise.resolve().then(() => { if (mounted) void refetch(); });
    if (!pickupId || !userId) return undefined;
    const cleanup = subscribeToPickups(userId, role, { onChange: (payload) => { if (payload.new?.id === pickupId || payload.old?.id === pickupId) void refetch(); } });
    return () => { mounted = false; cleanup(); };
  }, [pickupId, refetch, role, userId]);

  const proofUrls = { pickupPhoto: pickup?.proof_photo_url, pickupSignature: pickup?.proof_signature_url, deliveryPhoto: pickup?.proof_photo_url, deliverySignature: pickup?.proof_signature_url };
  return { pickup, driver: pickup?.drivers || null, donor: null, shelter: pickup?.shelters || null, donation: pickup?.donations || null, proofUrls, loading, error, refetch };
}