import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import LazyLiveMapView from '../dispatch/LazyLiveMapView';

export default function PickupLogisticsMap({ pickupId }) {
  const [pickup, setPickup] = useState(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!supabase || !pickupId) return;
      const { data } = await supabase
        .from('pickups')
        .select('id, status, donations(latitude, longitude), shelters(latitude, longitude, organization_name)')
        .eq('id', pickupId)
        .maybeSingle();
      if (mounted) setPickup(data || null);
    };
    void load();
    return () => { mounted = false; };
  }, [pickupId]);

  return pickup ? <LazyLiveMapView pickups={[pickup]} /> : null;
}
