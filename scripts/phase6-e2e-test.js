import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.PHASE6_TEST_PASSWORD || `Phase6-${Date.now()}-Test!`;
const shouldCleanup = process.env.PHASE6_CLEANUP === 'true';

if (!url || !serviceKey) {
  console.error('FAIL: Set SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const adminClient = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const stamp = Date.now();
const users = {
  donor: `phase6-donor-${stamp}@example.test`,
  shelter: `phase6-shelter-${stamp}@example.test`,
  driver: `phase6-driver-${stamp}@example.test`,
  admin: `phase6-admin-${stamp}@example.test`
};
const ids = {};
const results = [];

async function step(name, operation) {
  try {
    const value = await operation();
    results.push({ name, pass: true });
    console.log(`PASS  ${name}`);
    return value;
  } catch (error) {
    results.push({ name, pass: false, message: error.message });
    console.error(`FAIL  ${name}: ${error.message}`);
    throw error;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function createUser(role, name) {
  const { data, error } = await adminClient.auth.admin.createUser({ email: users[role], password, email_confirm: true, user_metadata: { name, role } });
  if (error) throw error;
  ids[role] = data.user.id;
  const { error: profileError } = await adminClient.from('profiles').upsert({ id: data.user.id, name, email: users[role], role }, { onConflict: 'id' });
  if (profileError) throw profileError;
  return data.user;
}

async function sessionClient(role) {
  const client = createClient(url, process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({ email: users[role], password });
  if (error) throw error;
  return { client, user: data.user };
}

async function main() {
  console.log(`Phase 6 E2E · ${url}`);
  await step('Create donor, shelter, driver, and admin test users', async () => {
    await createUser('donor', 'Phase 6 Donor');
    await createUser('shelter', 'Phase 6 Shelter');
    await createUser('driver', 'Phase 6 Driver');
    await createUser('admin', 'Phase 6 Admin');
  });

  await step('Create shelter and driver records', async () => {
    const { data: shelter, error: shelterError } = await adminClient.from('shelters').insert({ profile_id: ids.shelter, organization_name: 'Phase 6 Shelter', address: '1 Test Way', verified: true }).select('id').single();
    if (shelterError) throw shelterError;
    ids.shelterRecord = shelter.id;
    const { data: driver, error: driverError } = await adminClient.from('drivers').insert({ profile_id: ids.driver, user_id: ids.driver, name: 'Phase 6 Driver', vehicle_type: 'Van', capacity_kg: 500, is_available: true, available: true, status: 'AVAILABLE' }).select('id').single();
    if (driverError) throw driverError;
    ids.driverRecord = driver.id;
  });

  await step('Create POSTED donation', async () => {
    const { data, error } = await adminClient.from('donations').insert({ donor_id: ids.donor, food_name: 'Phase 6 Test Produce', quantity: 12, unit: 'crates', pickup_address: '2 Test Way', expiry_time: new Date(Date.now() + 86400000).toISOString(), status: 'posted' }).select('id, status').single();
    if (error) throw error;
    ids.donation = data.id;
    assert(data.status === 'posted', 'Donation was not POSTED.');
  });

  await step('Create shelter request and verify matching prerequisites', async () => {
    const { data, error } = await adminClient.from('shelter_requests').insert({ shelter_id: ids.shelterRecord, food_type: 'Fresh Produce', item_name: 'Phase 6 Test Produce', quantity: 12, unit: 'crates', urgency_level: 'high', needed_by: new Date(Date.now() + 86400000).toISOString(), status: 'open' }).select('id, status').single();
    if (error) throw error;
    ids.request = data.id;
    assert(data.status === 'open', 'Shelter request was not OPEN.');
  });

  await step('Create MATCH record', async () => {
    const { data, error } = await adminClient.from('matches').insert({ donation_id: ids.donation, shelter_request_id: ids.request, match_score: 100, distance_km: 0, quantity_coverage: 100, urgency_level: 'high', expiry_warning: 'safe', status: 'proposed' }).select('id, status').single();
    if (error) throw error;
    ids.match = data.id;
    assert(data.status === 'proposed', 'Match was not created.');
  });

  const shelterSession = await step('Sign in shelter test session', () => sessionClient('shelter'));
  await step('Accept match and create pickup', async () => {
    const { data, error } = await shelterSession.client.rpc('respond_to_match', { p_match_id: ids.match, p_status: 'accepted' });
    if (error) throw error;
    assert(data?.status === 'accepted', 'Match was not accepted.');
    const { data: pickup, error: pickupError } = await adminClient.from('pickups').select('id, status').eq('match_id', ids.match).single();
    if (pickupError) throw pickupError;
    ids.pickup = pickup.id;
    assert(pickup.status === 'ASSIGNED', 'Pickup was not created in ASSIGNED state.');
  });

  const adminSession = await step('Sign in admin test session', () => sessionClient('admin'));
  await step('Assign available driver through admin RPC', async () => {
    const { data, error } = await adminSession.client.rpc('assign_driver_to_match', { p_match_id: ids.match, p_driver_id: ids.driverRecord, p_scheduled_at: new Date(Date.now() + 3600000).toISOString() });
    if (error) throw error;
    assert(data === ids.pickup, 'Assignment RPC returned an unexpected pickup id.');
  });

  const driverSession = await step('Sign in driver test session', () => sessionClient('driver'));
  for (const status of ['PICKUP', 'IN_TRANSIT', 'DELIVERED']) {
    await step(`Driver transition ${status}`, async () => {
      const { error } = await driverSession.client.rpc('update_pickup_status', { p_pickup_id: ids.pickup, p_new_status: status, p_temperature_c: 4.0, p_notes: `Phase 6 E2E ${status}` });
      if (error) throw error;
    });
  }

  await step('Attach proof URLs and verify DELIVERED chain of custody', async () => {
    const { error } = await adminClient.from('pickups').update({ proof_photo_url: 'https://example.test/pickup.webp', proof_signature_url: 'https://example.test/pickup-signature.webp', delivery_proof_photo_url: 'https://example.test/delivery.webp', delivery_proof_signature_url: 'https://example.test/delivery-signature.webp', pickup_verified_at: new Date().toISOString(), delivery_verified_at: new Date().toISOString() }).eq('id', ids.pickup);
    if (error) throw error;
    const { data, error: queryError } = await adminClient.from('pickups').select('status, proof_photo_url, delivery_proof_photo_url').eq('id', ids.pickup).single();
    if (queryError) throw queryError;
    assert(data.status === 'DELIVERED', 'Pickup did not reach DELIVERED.');
    assert(data.proof_photo_url && data.delivery_proof_photo_url, 'Proof URLs were not persisted.');
    const { data: donation, error: donationError } = await adminClient.from('donations').select('status').eq('id', ids.donation).single();
    if (donationError) throw donationError;
    assert(donation.status === 'delivered', 'Donation did not synchronize to DELIVERED.');
  });

  await step('Verify donor, shelter, driver notifications', async () => {
    const { data, error } = await adminClient.from('notification_events').select('user_id, data').eq('data->>pickup_id', ids.pickup);
    if (error) throw error;
    const recipients = new Set((data || []).map((notification) => notification.user_id));
    assert([ids.driver, ids.donor, ids.shelter].every((id) => recipients.has(id)), 'Not all three parties received notifications.');
  });

  console.log('\nPhase 6 E2E report');
  console.log(`${results.filter((result) => result.pass).length}/${results.length} checks passed`);
  console.log(`Test users: ${Object.values(users).join(', ')}`);
  console.log(`Pickup: ${ids.pickup}`);
  if (shouldCleanup) {
    await step('Cleanup test records and users', async () => {
      await adminClient.from('notification_events').delete().eq('data->>pickup_id', ids.pickup);
      await adminClient.from('pickups').delete().eq('id', ids.pickup);
      await adminClient.from('matches').delete().eq('id', ids.match);
      await adminClient.from('shelter_requests').delete().eq('id', ids.request);
      await adminClient.from('donations').delete().eq('id', ids.donation);
      await adminClient.from('shelters').delete().eq('id', ids.shelterRecord);
      for (const role of Object.keys(users)) await adminClient.auth.admin.deleteUser(ids[role]);
    });
  }
}

main().catch(() => process.exit(1));