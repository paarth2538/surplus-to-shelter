import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const emptyProfile = {
  organizationName: '',
  contactPerson: '',
  phone: '',
  address: '',
  latitude: '',
  longitude: '',
  capacity: '',
  currentCapacity: '',
  foodPreferences: '',
  urgencyLevel: 'medium'
};

const emptyRequest = {
  itemName: '',
  foodType: '',
  quantity: '',
  unit: '',
  urgencyLevel: 'medium',
  neededBy: '',
  description: ''
};

function safeErrorLog(scope, error) {
  console.error(`[shelter-${scope}]`, {
    message: error?.message,
    code: error?.code,
    status: error?.status,
    details: error?.details,
    hint: error?.hint
  });
}

function mapShelterError(error) {
  const message = error?.message?.toLowerCase() ?? '';
  if (error?.code === '42501' || message.includes('row-level security') || message.includes('permission')) {
    return "You don't have permission to perform this action.";
  }
  if (message.includes('network') || message.includes('fetch')) return 'Unable to connect. Please try again.';
  return 'Unable to save the request. Please try again.';
}

function profileFromRow(row) {
  return {
    organizationName: row.organization_name ?? '',
    contactPerson: row.contact_person ?? '',
    phone: row.phone ?? '',
    address: row.address ?? '',
    latitude: row.latitude ?? '',
    longitude: row.longitude ?? '',
    capacity: row.capacity ?? '',
    currentCapacity: row.current_capacity ?? '',
    foodPreferences: row.food_preferences ?? '',
    urgencyLevel: row.urgency_level ?? 'medium'
  };
}

function validateProfile(form) {
  const errors = {};
  if (!form.organizationName.trim()) errors.organizationName = 'Organization name is required.';
  if (!form.address.trim()) errors.address = 'Address is required.';
  if (form.capacity !== '' && (!Number.isFinite(Number(form.capacity)) || Number(form.capacity) < 0)) {
    errors.capacity = 'Capacity must be greater than or equal to 0.';
  }
  if (form.currentCapacity !== '' && (!Number.isFinite(Number(form.currentCapacity)) || Number(form.currentCapacity) < 0)) {
    errors.currentCapacity = 'Current capacity must be greater than or equal to 0.';
  }
  if (!errors.capacity && !errors.currentCapacity && form.capacity !== '' && form.currentCapacity !== '' && Number(form.currentCapacity) > Number(form.capacity)) {
    errors.currentCapacity = 'Current capacity cannot exceed total capacity.';
  }
  return errors;
}

function validateRequest(form) {
  const errors = {};
  if (!form.itemName.trim()) errors.itemName = 'Food/item name is required.';
  if (!form.foodType) errors.foodType = 'Food type is required.';
  if (!form.quantity || !Number.isFinite(Number(form.quantity))) errors.quantity = 'Please enter a valid quantity.';
  else if (Number(form.quantity) <= 0) errors.quantity = 'Quantity must be greater than 0.';
  if (!form.unit) errors.unit = 'Unit is required.';
  if (!form.urgencyLevel) errors.urgencyLevel = 'Please select an urgency level.';
  if (!form.neededBy || Number.isNaN(new Date(form.neededBy).getTime())) errors.neededBy = 'Please select when the food is needed.';
  return errors;
}

export default function ShelterWorkspace() {
  const [shelter, setShelter] = useState(null);
  const [profileForm, setProfileForm] = useState(emptyProfile);
  const [requests, setRequests] = useState([]);
  const [loadingWorkspace, setLoadingWorkspace] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [requestLoading, setRequestLoading] = useState(false);
  const [profileErrors, setProfileErrors] = useState({});
  const [requestErrors, setRequestErrors] = useState({});
  const [workspaceError, setWorkspaceError] = useState('');
  const [profileMessage, setProfileMessage] = useState('');
  const [requestError, setRequestError] = useState('');
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [editingRequest, setEditingRequest] = useState(null);
  const [requestForm, setRequestForm] = useState(emptyRequest);

  const getAuthenticatedUser = async () => {
    if (!supabase) return null;
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return null;
    return user;
  };

  const loadWorkspace = async () => {
    setLoadingWorkspace(true);
    setWorkspaceError('');
    const user = await getAuthenticatedUser();
    if (!user) {
      setWorkspaceError('Please log in as a shelter.');
      setLoadingWorkspace(false);
      return;
    }

    const { data: shelterRow, error: shelterError } = await supabase
      .from('shelters')
      .select('*')
      .eq('profile_id', user.id)
      .maybeSingle();

    if (shelterError) {
      safeErrorLog('profile-load', shelterError);
      setWorkspaceError(mapShelterError(shelterError));
      setLoadingWorkspace(false);
      return;
    }

    setShelter(shelterRow);
    if (shelterRow) {
      setProfileForm(profileFromRow(shelterRow));
      const { data: requestRows, error: requestLoadError } = await supabase
        .from('shelter_requests')
        .select('id, shelter_id, food_type, item_name, quantity, unit, description, urgency_level, needed_by, status, created_at')
        .eq('shelter_id', shelterRow.id)
        .order('created_at', { ascending: false });

      if (requestLoadError) {
        safeErrorLog('request-load', requestLoadError);
        setWorkspaceError(mapShelterError(requestLoadError));
      } else {
        setRequests(requestRows ?? []);
      }
    }
    setLoadingWorkspace(false);
  };

  useEffect(() => {
    void loadWorkspace();
  }, []);

  const updateProfileField = (field, value) => {
    setProfileForm((current) => ({ ...current, [field]: value }));
    setProfileErrors((current) => ({ ...current, [field]: '' }));
    setProfileMessage('');
  };

  const saveProfile = async (event) => {
    event.preventDefault();
    const nextErrors = validateProfile(profileForm);
    setProfileErrors(nextErrors);
    setProfileMessage('');
    if (Object.keys(nextErrors).length > 0) return;

    const user = await getAuthenticatedUser();
    if (!user) {
      setProfileMessage('Please log in as a shelter.');
      return;
    }

    setProfileLoading(true);
    const payload = {
      organization_name: profileForm.organizationName.trim(),
      contact_person: profileForm.contactPerson.trim() || null,
      phone: profileForm.phone.trim() || null,
      address: profileForm.address.trim(),
      latitude: profileForm.latitude === '' ? null : Number(profileForm.latitude),
      longitude: profileForm.longitude === '' ? null : Number(profileForm.longitude),
      capacity: profileForm.capacity === '' ? null : Number(profileForm.capacity),
      current_capacity: profileForm.currentCapacity === '' ? 0 : Number(profileForm.currentCapacity),
      food_preferences: profileForm.foodPreferences.trim() || null,
      urgency_level: profileForm.urgencyLevel
    };

    const response = shelter
      ? await supabase.from('shelters').update(payload).eq('id', shelter.id).eq('profile_id', user.id).select().single()
      : await supabase.from('shelters').insert({ ...payload, profile_id: user.id }).select().single();

    if (response.error) {
      safeErrorLog('profile-save', response.error);
      setProfileMessage(mapShelterError(response.error));
    } else {
      setShelter(response.data);
      setProfileForm(profileFromRow(response.data));
      setProfileMessage('Shelter profile saved.');
    }
    setProfileLoading(false);
  };

  const openRequestModal = (request = null) => {
    setEditingRequest(request);
    setRequestForm(request ? {
      itemName: request.item_name,
      foodType: request.food_type,
      quantity: request.quantity,
      unit: request.unit,
      urgencyLevel: request.urgency_level,
      neededBy: request.needed_by ? new Date(request.needed_by).toISOString().slice(0, 16) : '',
      description: request.description ?? ''
    } : emptyRequest);
    setRequestErrors({});
    setRequestError('');
    setIsRequestModalOpen(true);
  };

  const updateRequestField = (field, value) => {
    setRequestForm((current) => ({ ...current, [field]: value }));
    setRequestErrors((current) => ({ ...current, [field]: '' }));
    setRequestError('');
  };

  const saveRequest = async (event) => {
    event.preventDefault();
    const nextErrors = validateRequest(requestForm);
    setRequestErrors(nextErrors);
    setRequestError('');
    if (Object.keys(nextErrors).length > 0) return;
    if (!shelter) {
      setRequestError('Shelter profile not found. Please complete your shelter profile.');
      return;
    }

    setRequestLoading(true);
    const payload = {
      shelter_id: shelter.id,
      food_type: requestForm.foodType,
      item_name: requestForm.itemName.trim(),
      quantity: Number(requestForm.quantity),
      unit: requestForm.unit,
      urgency_level: requestForm.urgencyLevel,
      needed_by: new Date(requestForm.neededBy).toISOString(),
      description: requestForm.description.trim() || null
    };

    const response = editingRequest
      ? await supabase.from('shelter_requests').update(payload).eq('id', editingRequest.id).eq('shelter_id', shelter.id).eq('status', 'open').select().single()
      : await supabase.from('shelter_requests').insert(payload).select().single();

    if (response.error) {
      safeErrorLog('request-save', response.error);
      setRequestError(mapShelterError(response.error));
      setRequestLoading(false);
      return;
    }

    setRequests((current) => editingRequest
      ? current.map((request) => request.id === response.data.id ? response.data : request)
      : [response.data, ...current]);
    setIsRequestModalOpen(false);
    setRequestLoading(false);
  };

  const cancelRequest = async (request) => {
    if (!shelter || request.status !== 'open') return;
    setRequestError('');
    const { data, error } = await supabase
      .from('shelter_requests')
      .update({ status: 'cancelled' })
      .eq('id', request.id)
      .eq('shelter_id', shelter.id)
      .eq('status', 'open')
      .select()
      .single();

    if (error) {
      safeErrorLog('request-cancel', error);
      setRequestError(mapShelterError(error));
      return;
    }
    setRequests((current) => current.map((item) => item.id === data.id ? data : item));
  };

  const fieldError = (errors, field) => errors[field] ? <span className="field-error">{errors[field]}</span> : null;
  const availableCapacity = profileForm.capacity === '' ? null : Number(profileForm.capacity) - Number(profileForm.currentCapacity || 0);
  const occupiedPercent = profileForm.capacity && Number(profileForm.capacity) > 0
    ? Math.round((Number(profileForm.currentCapacity || 0) / Number(profileForm.capacity)) * 100)
    : null;
  const formatDate = (value) => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));

  if (loadingWorkspace) return <p className="dashboard-muted">Loading shelter profile...</p>;

  return (
    <div className="shelter-workspace">
      {workspaceError ? <p className="form-error" role="alert">{workspaceError}</p> : null}
      <section className="workspace-section">
        <div className="workspace-section-heading">
          <div><span className="kicker-badge">SHELTER PROFILE</span><h2>Organization & capacity</h2></div>
        </div>
        <form onSubmit={saveProfile} className="workspace-form">
          <div className="form-row-2">
            <div className="form-group"><label htmlFor="shelter-organization">Organization Name</label><input id="shelter-organization" value={profileForm.organizationName} onChange={(event) => updateProfileField('organizationName', event.target.value)} />{fieldError(profileErrors, 'organizationName')}</div>
            <div className="form-group"><label htmlFor="shelter-contact">Contact Person</label><input id="shelter-contact" value={profileForm.contactPerson} onChange={(event) => updateProfileField('contactPerson', event.target.value)} /></div>
          </div>
          <div className="form-row-2">
            <div className="form-group"><label htmlFor="shelter-phone">Phone</label><input id="shelter-phone" value={profileForm.phone} onChange={(event) => updateProfileField('phone', event.target.value)} /></div>
            <div className="form-group"><label htmlFor="shelter-address">Address</label><input id="shelter-address" value={profileForm.address} onChange={(event) => updateProfileField('address', event.target.value)} />{fieldError(profileErrors, 'address')}</div>
          </div>
          <div className="form-row-2">
            <div className="form-group"><label htmlFor="shelter-capacity">Total Capacity</label><input id="shelter-capacity" type="number" min="0" step="any" value={profileForm.capacity} onChange={(event) => updateProfileField('capacity', event.target.value)} />{fieldError(profileErrors, 'capacity')}</div>
            <div className="form-group"><label htmlFor="shelter-current-capacity">Current Capacity</label><input id="shelter-current-capacity" type="number" min="0" step="any" value={profileForm.currentCapacity} onChange={(event) => updateProfileField('currentCapacity', event.target.value)} />{fieldError(profileErrors, 'currentCapacity')}</div>
          </div>
          <div className="form-row-2">
            <div className="form-group"><label htmlFor="shelter-latitude">Latitude <span className="optional-label">Optional</span></label><input id="shelter-latitude" type="number" step="any" value={profileForm.latitude} onChange={(event) => updateProfileField('latitude', event.target.value)} /></div>
            <div className="form-group"><label htmlFor="shelter-longitude">Longitude <span className="optional-label">Optional</span></label><input id="shelter-longitude" type="number" step="any" value={profileForm.longitude} onChange={(event) => updateProfileField('longitude', event.target.value)} /></div>
          </div>
          <div className="form-group"><label htmlFor="shelter-preferences">Food Preferences</label><textarea id="shelter-preferences" rows="3" value={profileForm.foodPreferences} onChange={(event) => updateProfileField('foodPreferences', event.target.value)} placeholder="Prepared Meals, Fruits & Vegetables" /></div>
          <div className="form-group"><label htmlFor="shelter-urgency">Current Urgency</label><select id="shelter-urgency" value={profileForm.urgencyLevel} onChange={(event) => updateProfileField('urgencyLevel', event.target.value)}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></div>
          {shelter ? <p className="workspace-meta">Verification status: <strong>{shelter.verified ? 'Verified' : 'Pending verification'}</strong></p> : null}
          {profileForm.capacity !== '' ? <div className="capacity-summary"><strong>{profileForm.currentCapacity || 0} / {profileForm.capacity}</strong><span>{occupiedPercent}% occupied · {availableCapacity} available</span></div> : null}
          {profileMessage ? <p className="auth-success-message" role="status">{profileMessage}</p> : null}
          <button type="submit" className="btn-pill-primary" disabled={profileLoading}>{profileLoading ? 'Saving...' : 'Save Shelter Profile'}</button>
        </form>
      </section>

      <section className="workspace-section">
        <div className="workspace-section-heading">
          <div><span className="kicker-badge">CURRENT DEMAND</span><h2>Supply requests</h2></div>
          <button className="btn-pill-primary" onClick={() => openRequestModal() } disabled={!shelter}>Request Supplies</button>
        </div>
        {requestError ? <p className="form-error" role="alert">{requestError}</p> : null}
        {requests.length === 0 ? <div className="donation-empty-state"><p>No supply requests yet.</p><button className="btn-pill-secondary" onClick={() => openRequestModal()} disabled={!shelter}>Request Supplies</button></div> : null}
        <div className="donation-history-list">
          {requests.map((request) => (
            <article className="donation-history-card" key={request.id}>
              <div className="donation-card-heading"><div><h3>{request.item_name}</h3><span>{request.food_type} · {request.quantity} {request.unit}</span></div><span className="donation-status-pill">{request.status.toUpperCase()}</span></div>
              <div className="donation-card-grid"><span><strong>Urgency</strong>{request.urgency_level.toUpperCase()}</span><span><strong>Needed by</strong>{formatDate(request.needed_by)}</span><span><strong>Created</strong>{formatDate(request.created_at)}</span><span><strong>Description</strong>{request.description || 'No description'}</span></div>
              {request.status === 'open' ? <div className="workspace-card-actions"><button className="btn-pill-secondary" onClick={() => openRequestModal(request)}>Edit</button><button className="btn-modal-cancel" onClick={() => cancelRequest(request)}>Cancel request</button></div> : null}
            </article>
          ))}
        </div>
      </section>

      {isRequestModalOpen ? (
        <div className="modal-backdrop" onClick={() => setIsRequestModalOpen(false)}>
          <div className="modal-window donation-modal-window" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header"><div className="modal-title-wrap"><span className="kicker-badge"><span className="kicker-dot dot-emerald"></span>SHELTER DEMAND</span><h3 className="modal-heading">{editingRequest ? 'Update supply request' : 'Request supplies'}</h3></div><button className="modal-close-btn" onClick={() => setIsRequestModalOpen(false)} aria-label="Close request form">✕</button></div>
            <form onSubmit={saveRequest} className="modal-form">
              <div className="form-group"><label htmlFor="request-item-name">Item / Food Name</label><input id="request-item-name" value={requestForm.itemName} onChange={(event) => updateRequestField('itemName', event.target.value)} />{fieldError(requestErrors, 'itemName')}</div>
              <div className="form-row-2"><div className="form-group"><label htmlFor="request-food-type">Food Type</label><select id="request-food-type" value={requestForm.foodType} onChange={(event) => updateRequestField('foodType', event.target.value)}><option value="">Select type</option><option>Prepared Meals</option><option>Fruits & Vegetables</option><option>Bakery</option><option>Packaged Food</option><option>Beverages</option><option>Other</option></select>{fieldError(requestErrors, 'foodType')}</div><div className="form-group"><label htmlFor="request-unit">Unit</label><select id="request-unit" value={requestForm.unit} onChange={(event) => updateRequestField('unit', event.target.value)}><option value="">Select unit</option><option>Meals</option><option>Kg</option><option>Boxes</option><option>Crates</option><option>Packets</option><option>Pieces</option></select>{fieldError(requestErrors, 'unit')}</div></div>
              <div className="form-row-2"><div className="form-group"><label htmlFor="request-quantity">Quantity</label><input id="request-quantity" type="number" min="0.01" step="any" value={requestForm.quantity} onChange={(event) => updateRequestField('quantity', event.target.value)} />{fieldError(requestErrors, 'quantity')}</div><div className="form-group"><label htmlFor="request-urgency">Urgency</label><select id="request-urgency" value={requestForm.urgencyLevel} onChange={(event) => updateRequestField('urgencyLevel', event.target.value)}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select>{fieldError(requestErrors, 'urgencyLevel')}</div></div>
              <div className="form-group"><label htmlFor="request-needed-by">Needed By</label><input id="request-needed-by" type="datetime-local" value={requestForm.neededBy} onChange={(event) => updateRequestField('neededBy', event.target.value)} />{fieldError(requestErrors, 'neededBy')}</div>
              <div className="form-group"><label htmlFor="request-description">Description <span className="optional-label">Optional</span></label><textarea id="request-description" rows="3" value={requestForm.description} onChange={(event) => updateRequestField('description', event.target.value)} /></div>
              {requestError ? <p className="form-error" role="alert">{requestError}</p> : null}
              <div className="modal-actions-row"><button type="button" className="btn-modal-cancel" onClick={() => setIsRequestModalOpen(false)}>Cancel</button><button type="submit" className="btn-pill-hero-primary" disabled={requestLoading}>{requestLoading ? 'Saving...' : editingRequest ? 'Save Request →' : 'Create Request →'}</button></div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}