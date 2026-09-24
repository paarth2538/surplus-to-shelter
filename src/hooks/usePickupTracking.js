import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { subscribeToDriver, subscribeToPickup } from '../lib/realtime';

export default function usePickupTracking(pickupId, userId, _role) {
  const [pickup, setPickup] = useState(null);
  const [loading, setLoading] = useState(Boolean(pickupId));
  const [error, setError] = useState('');

  const refetch = useCallback(async () => {
    if (!supabase || !pickupId) return;
    setLoading(true);
    const { data, error: queryError } = await supabase.from('pickups').select('id, driver_id, donation_id, shelter_id, status, pickup_time, assigned_at, picked_up_at, delivered_at, pickup_verified_at, delivery_verified_at, pickup_lat, pickup_lng, delivery_lat, delivery_lng, proof_photo_url, proof_signature_url, delivery_proof_photo_url, delivery_proof_signature_url, temperature_c, notes, drivers(id, name, phone, vehicle_type, current_lat, current_lng, status), donations(id, food_name, quantity, unit, pickup_address, latitude, longitude, donor_id), shelters(id, organization_name, address, phone, latitude, longitude, profile_id), matches(id, status)').eq('id', pickupId).single();
    if (queryError) setError(queryError.message || 'Unable to load pickup tracking.');
    else {
      let donor = null;
      if (data?.donations?.donor_id) {
        const { data: donorProfile } = await supabase.from('profiles').select('id, name, email, phone').eq('id', data.donations.donor_id).maybeSingle();
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
    const cleanup = subscribeToPickup(pickupId, { onChange: () => void refetch() });
    return () => { mounted = false; cleanup(); };
  }, [pickupId, refetch, userId]);

  useEffect(() => {
    if (!pickup?.driver_id) return undefined;
    return subscribeToDriver(pickup.driver_id, {
      onChange: ({ new: updatedDriver }) => setPickup((current) => current
        ? { ...current, drivers: { ...current.drivers, ...updatedDriver } }
        : current)
    });
  }, [pickup?.driver_id]);

  const proofUrls = { pickupPhoto: pickup?.proof_photo_url, pickupSignature: pickup?.proof_signature_url, deliveryPhoto: pickup?.delivery_proof_photo_url, deliverySignature: pickup?.delivery_proof_signature_url };
  return { pickup, driver: pickup?.drivers || null, donor: pickup?.donor || null, shelter: pickup?.shelters || null, donation: pickup?.donations || null, proofUrls, loading, error, refetch };
}