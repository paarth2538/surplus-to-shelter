import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { subscribeToPickups } from '../lib/realtime';

const TAB_FILTERS = {
  active: (pickup) => ['ASSIGNED', 'PICKUP', 'IN_TRANSIT'].includes(pickup.status),
  scheduled: (pickup) => pickup.status === 'ASSIGNED' && pickup.scheduled_at && new Date(pickup.scheduled_at) > new Date(),
  completed: (pickup) => pickup.status === 'DELIVERED',
  all: () => true
};

export default function useDispatchData(userId, role = 'admin', { initialTab = 'active' } = {}) {
  const [pickups, setPickups] = useState([]);
  const [tab, setTab] = useState(initialTab);
  const [filters, setFilters] = useState({ search: '', status: 'ALL' });
  const [sort, setSort] = useState({ key: 'scheduled_at', direction: 'asc' });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(Boolean(userId));
  const [error, setError] = useState('');
  const pageSize = 50;

  const refetch = useCallback(async () => {
    if (!supabase || !userId) { setPickups([]); setLoading(false); return []; }
    setLoading(true);
    const { data, error: queryError } = await supabase
      .from('pickups')
      .select('id, match_id, driver_id, donor_id, shelter_id, status, scheduled_at, assigned_at, picked_up_at, delivered_at, pickup_verified_at, delivery_verified_at, pickup_lat, pickup_lng, delivery_lat, delivery_lng, proof_photo_url, proof_signature_url, delivery_proof_photo_url, delivery_proof_signature_url, temperature_c, notes, created_at, updated_at, drivers(id, name, phone, vehicle_type, capacity_kg, current_lat, current_lng, is_available, status), donations(id, food_name, quantity, unit, pickup_address, latitude, longitude, donor_id), shelters(id, organization_name, address, phone, latitude, longitude, profile_id), matches(id, status, score)')
      .order('scheduled_at', { ascending: true, nullsFirst: false });
    if (queryError) setError(queryError.message || 'Unable to load dispatch data.');
    else setPickups(data || []);
    setLoading(false);
    return data || [];
  }, [userId]);

  useEffect(() => {
    if (!userId) return undefined;
    const cleanup = subscribeToPickups(userId, role, { onChange: () => void refetch() });
    void Promise.resolve().then(() => void refetch());
    return cleanup;
  }, [refetch, role, userId]);

  const visiblePickups = useMemo(() => {
    const predicate = TAB_FILTERS[tab] || TAB_FILTERS.all;
    const query = filters.search.trim().toLowerCase();
    return pickups.filter((pickup) => {
      const searchable = [pickup.id, pickup.status, pickup.drivers?.name, pickup.donations?.food_name, pickup.shelters?.organization_name].filter(Boolean).join(' ').toLowerCase();
      return predicate(pickup) && (filters.status === 'ALL' || pickup.status === filters.status) && (!query || searchable.includes(query));
    }).sort((first, second) => {
      const firstValue = first[sort.key] || '';
      const secondValue = second[sort.key] || '';
      return String(firstValue).localeCompare(String(secondValue)) * (sort.direction === 'asc' ? 1 : -1);
    });
  }, [filters, pickups, sort, tab]);

  const totalPages = Math.max(1, Math.ceil(visiblePickups.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedPickups = visiblePickups.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const updateFilter = (key, value) => { setFilters((current) => ({ ...current, [key]: value })); setPage(1); };
  const updateSort = (key) => setSort((current) => ({ key, direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc' }));

  return { pickups: pagedPickups, allPickups: visiblePickups, tab, setTab, filters, updateFilter, sort, updateSort, page: currentPage, setPage, totalPages, loading, error, refetch };
}