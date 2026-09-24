import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { subscribeToPickups } from '../lib/realtime';

const ACTIVE_STATUSES = ['ASSIGNED', 'PICKUP', 'IN_TRANSIT'];

export default function useDriverPickups(driverId) {
  const [pickups, setPickups] = useState([]);
  const [impactRecords, setImpactRecords] = useState([]);
  const [loading, setLoading] = useState(Boolean(driverId));
  const [error, setError] = useState('');
  const [currentTime] = useState(() => Date.now());

  const refetch = useCallback(async () => {
    if (!supabase || !driverId) {
      setPickups([]);
      setImpactRecords([]);
      setLoading(false);
      return [];
    }

    setLoading(true);
    setError('');
    const { data: pickupRecords, error: pickupError } = await supabase
      .from('pickups')
      .select('id, driver_id, donation_id, status, pickup_time, assigned_at, picked_up_at, delivered_at, pickup_lat, pickup_lng, delivery_lat, delivery_lng, notes, donations(id, food_name, quantity, unit, pickup_address, donor_id), shelters(organization_name, address, phone)')
      .eq('driver_id', driverId)
      .order('pickup_time', { ascending: true, nullsFirst: false });

    if (pickupError) {
      setError(pickupError.message || 'Unable to load assigned pickups.');
      setLoading(false);
      return [];
    }

    const records = pickupRecords || [];
    const donorIds = [...new Set(records.map((pickup) => pickup.donations?.donor_id).filter(Boolean))];
    let donorsById = {};
    if (donorIds.length) {
      const { data: donorProfiles } = await supabase
        .from('profiles')
        .select('id, name, email, phone')
        .in('id', donorIds);
      donorsById = Object.fromEntries((donorProfiles || []).map((donor) => [donor.id, donor]));
    }

    const donationIds = [...new Set(records.map((pickup) => pickup.donations?.id).filter(Boolean))];
    let impactData = [];
    if (donationIds.length) {
      const { data: rescuedImpact, error: impactError } = await supabase
        .from('impact')
        .select('donation_id, weight_rescued, meals_rescued')
        .in('donation_id', donationIds);
      if (impactError) {
        setError(impactError.message || 'Unable to load pickup impact.');
        setLoading(false);
        return [];
      }
      impactData = rescuedImpact || [];
    }

    const enrichedPickups = records.map((pickup) => ({
      ...pickup,
      donor: donorsById[pickup.donations?.donor_id] || null
    }));
    setPickups(enrichedPickups);
    setImpactRecords(impactData);
    setLoading(false);
    return enrichedPickups;
  }, [driverId]);

  useEffect(() => {
    if (!driverId) {
      return undefined;
    }

    let isMounted = true;
    const cleanup = subscribeToPickups(driverId, 'driver', {
      onChange: () => {
        if (isMounted) void refetch();
      }
    });

    void Promise.resolve().then(() => {
      if (isMounted) void refetch();
    });
    return () => {
      isMounted = false;
      cleanup();
    };
  }, [driverId, refetch]);

  const currentPickup = useMemo(
    () => pickups.find((pickup) => ACTIVE_STATUSES.includes(pickup.status)) || null,
    [pickups]
  );
  const upcomingPickups = useMemo(
    () => pickups
      .filter((pickup) => pickup.status === 'ASSIGNED' && pickup.pickup_time && new Date(pickup.pickup_time).getTime() > currentTime)
      .sort((firstPickup, secondPickup) => new Date(firstPickup.pickup_time) - new Date(secondPickup.pickup_time)),
    [currentTime, pickups]
  );

  return { currentPickup, upcomingPickups, loading, error, refetch, pickups, impactRecords };
}