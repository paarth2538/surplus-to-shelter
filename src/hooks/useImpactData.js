import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

const TIME_RANGES = {
  today: 'Today',
  week: 'This week',
  month: 'This month',
  year: 'This year',
  all: 'All time'
};

function startOfRange(range) {
  const now = new Date();
  if (range === 'today') {
    now.setHours(0, 0, 0, 0);
    return now.toISOString();
  }
  if (range === 'week') {
    const day = now.getDay();
    now.setDate(now.getDate() - day);
    now.setHours(0, 0, 0, 0);
    return now.toISOString();
  }
  if (range === 'month') {
    now.setDate(1);
    now.setHours(0, 0, 0, 0);
    return now.toISOString();
  }
  if (range === 'year') {
    now.setMonth(0, 1);
    now.setHours(0, 0, 0, 0);
    return now.toISOString();
  }
  return null;
}

/**
 * Fetches impact data from Supabase scoped to the user's role.
 * All numbers come from real verified DELIVERED pickups + impact rows.
 */
export default function useImpactData(userId, role, shelterIdOrDriverId) {
  const [metrics, setMetrics] = useState(null);
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [timeRange, setTimeRange] = useState('all');

  const fetchData = useCallback(async () => {
    if (!supabase) {
      setError('Supabase is not configured.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const rangeStart = startOfRange(timeRange);

      // Build the pickups query for DELIVERED records based on role
      let pickupsQuery = supabase
        .from('pickups')
        .select('id, donation_id, driver_id, shelter_id, status, delivered_at, delivery_verified_at, donations(id, food_name, food_type, quantity, unit, donor_id), shelters(id, organization_name), drivers(id, name)')
        .eq('status', 'DELIVERED')
        .order('delivered_at', { ascending: false });

      if (rangeStart) {
        pickupsQuery = pickupsQuery.gte('delivered_at', rangeStart);
      }

      // Scope by role
      if (role === 'donor') {
        // We need to filter pickups whose donation.donor_id = userId
        // Supabase doesn't support filtering on nested relations directly,
        // so we first fetch donation IDs owned by this donor
        const { data: donorDonations, error: ddError } = await supabase
          .from('donations')
          .select('id')
          .eq('donor_id', userId)
          .eq('status', 'delivered');
        if (ddError) throw ddError;
        const donationIds = (donorDonations || []).map((d) => d.id);
        if (!donationIds.length) {
          setMetrics(emptyMetrics());
          setDeliveries([]);
          setLoading(false);
          return;
        }
        pickupsQuery = pickupsQuery.in('donation_id', donationIds);
      } else if (role === 'shelter' && shelterIdOrDriverId) {
        pickupsQuery = pickupsQuery.eq('shelter_id', shelterIdOrDriverId);
      } else if (role === 'driver' && shelterIdOrDriverId) {
        pickupsQuery = pickupsQuery.eq('driver_id', shelterIdOrDriverId);
      }
      // admin: no additional filter, gets all

      const { data: pickupRows, error: pickupError } = await pickupsQuery;
      if (pickupError) throw pickupError;

      const rows = pickupRows || [];
      const donationIds = [...new Set(rows.map((p) => p.donation_id).filter(Boolean))];

      // Fetch impact records for these donation IDs
      let impactRows = [];
      if (donationIds.length) {
        const { data: impactData, error: impactError } = await supabase
          .from('impact')
          .select('donation_id, weight_rescued, meals_rescued, co2e_avoided, created_at')
          .in('donation_id', donationIds);
        if (impactError) throw impactError;
        impactRows = impactData || [];
      }

      const impactByDonation = Object.fromEntries(
        impactRows.map((imp) => [imp.donation_id, imp])
      );

      // Aggregate metrics
      let totalWeight = 0;
      let totalMeals = 0;
      let totalCo2e = 0;
      let weightAvailable = false;
      let mealsAvailable = false;
      let co2eAvailable = false;
      const shelterSet = new Set();
      const donorSet = new Set();
      const driverSet = new Set();

      // Build per-unit breakdown
      const unitBreakdown = {};

      rows.forEach((pickup) => {
        const imp = impactByDonation[pickup.donation_id];
        if (imp) {
          if (imp.weight_rescued != null) {
            totalWeight += Number(imp.weight_rescued);
            weightAvailable = true;
          }
          if (imp.meals_rescued != null) {
            totalMeals += Number(imp.meals_rescued);
            mealsAvailable = true;
          }
          if (imp.co2e_avoided != null) {
            totalCo2e += Number(imp.co2e_avoided);
            co2eAvailable = true;
          }
        }

        // Aggregate unit-based quantities
        const qty = pickup.donations?.quantity;
        const unit = pickup.donations?.unit;
        if (qty != null && unit) {
          const normalizedUnit = unit.toLowerCase().trim();
          unitBreakdown[normalizedUnit] = (unitBreakdown[normalizedUnit] || 0) + Number(qty);
        }

        if (pickup.shelter_id) shelterSet.add(pickup.shelter_id);
        if (pickup.donations?.donor_id) donorSet.add(pickup.donations.donor_id);
        if (pickup.driver_id) driverSet.add(pickup.driver_id);
      });

      setMetrics({
        totalDeliveries: rows.length,
        totalWeight: weightAvailable ? Math.round(totalWeight * 100) / 100 : null,
        totalMeals: mealsAvailable ? Math.round(totalMeals) : null,
        totalCo2e: co2eAvailable ? Math.round(totalCo2e * 100) / 100 : null,
        sheltersServed: shelterSet.size,
        activeDonors: donorSet.size,
        activeDrivers: driverSet.size,
        unitBreakdown
      });

      // Build enriched deliveries list for the verification log
      const enrichedDeliveries = rows.map((pickup) => ({
        ...pickup,
        impact: impactByDonation[pickup.donation_id] || null,
        verified: Boolean(pickup.delivery_verified_at)
      }));

      setDeliveries(enrichedDeliveries);
    } catch (err) {
      setError(err.message || 'Failed to load impact data.');
    } finally {
      setLoading(false);
    }
  }, [userId, role, shelterIdOrDriverId, timeRange]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // Realtime subscription for impact table changes
  useEffect(() => {
    if (!supabase) return undefined;
    const channel = supabase
      .channel('impact-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'impact' }, () => {
        void fetchData();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'pickups' }, (payload) => {
        if (payload.new?.status === 'DELIVERED') {
          void fetchData();
        }
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [fetchData]);

  return useMemo(() => ({
    metrics,
    deliveries,
    loading,
    error,
    timeRange,
    setTimeRange,
    timeRanges: TIME_RANGES,
    refetch: fetchData
  }), [metrics, deliveries, loading, error, timeRange, fetchData]);
}

function emptyMetrics() {
  return {
    totalDeliveries: 0,
    totalWeight: null,
    totalMeals: null,
    totalCo2e: null,
    sheltersServed: 0,
    activeDonors: 0,
    activeDrivers: 0,
    unitBreakdown: {}
  };
}
