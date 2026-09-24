import React, { useState } from 'react';
import { supabase } from '../lib/supabase';

const initialForm = {
  foodName: '',
  foodType: '',
  description: '',
  quantity: '',
  unit: '',
  expiryTime: '',
  pickupAddress: '',
  latitude: '',
  longitude: ''
};

function mapDonationError(error) {
  const message = error?.message?.toLowerCase() ?? '';
  if (error?.code === '42501' || message.includes('row-level security') || message.includes('permission')) {
    return "You don't have permission to post this donation.";
  }
  if (message.includes('network') || message.includes('fetch')) {
    return 'Unable to connect. Please try again.';
  }
  return 'Unable to post the donation. Please try again.';
}

function validateForm(form) {
  const errors = {};
  if (!form.foodName.trim()) errors.foodName = 'Food name is required.';
  if (!form.foodType) errors.foodType = 'Please select a food type.';
  if (!form.quantity) errors.quantity = 'Please enter a valid quantity.';
  else if (!Number.isFinite(Number(form.quantity))) errors.quantity = 'Please enter a valid quantity.';
  else if (Number(form.quantity) <= 0) errors.quantity = 'Quantity must be greater than 0.';
  if (!form.unit) errors.unit = 'Please select a unit.';
  if (!form.expiryTime || Number.isNaN(new Date(form.expiryTime).getTime())) {
    errors.expiryTime = 'Please select an expiry time.';
  }
  if (!form.pickupAddress.trim()) errors.pickupAddress = 'Pickup address is required.';
  return errors;
}

export default function DonationModal({ isOpen, onClose, onCreated }) {
  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  if (!isOpen) return null;

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: '' }));
    setSubmitError('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const nextErrors = validateForm(form);
    setErrors(nextErrors);
    setSubmitError('');
    if (Object.keys(nextErrors).length > 0) return;
    if (!supabase) {
      setSubmitError('Unable to connect. Please try again.');
      return;
    }

    setIsSubmitting(true);
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      setSubmitError('Please log in before posting a donation.');
      setIsSubmitting(false);
      return;
    }

    const { data, error } = await supabase
      .from('donations')
      .insert({
        donor_id: user.id,
        food_name: form.foodName.trim(),
        food_type: form.foodType,
        description: form.description.trim() || null,
        quantity: Number(form.quantity),
        unit: form.unit,
        expiry_time: new Date(form.expiryTime).toISOString(),
        pickup_address: form.pickupAddress.trim(),
        latitude: form.latitude ? Number(form.latitude) : null,
        longitude: form.longitude ? Number(form.longitude) : null
      })
      .select()
      .single();

    if (error) {
      console.error('[donation]', {
        message: error.message,
        code: error.code,
        status: error.status,
        details: error.details,
        hint: error.hint
      });
      setSubmitError(mapDonationError(error));
      setIsSubmitting(false);
      return;
    }

    setIsSuccess(true);
    setIsSubmitting(false);
    onCreated(data);
    window.setTimeout(() => {
      setForm(initialForm);
      setErrors({});
      setIsSuccess(false);
      onClose();
    }, 1200);
  };

  const fieldError = (field) => errors[field] ? <span className="field-error">{errors[field]}</span> : null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-window donation-modal-window" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-wrap">
            <span className="kicker-badge"><span className="kicker-dot dot-emerald"></span>DONOR INTAKE</span>
            <h3 className="modal-heading">Post surplus with dignity</h3>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close donation form">✕</button>
        </div>

        {isSuccess ? (
          <div className="modal-success-state">
            <div className="success-icon">✓</div>
            <h4>Donation posted successfully.</h4>
            <p>Your donation is now visible in your donor workspace.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="modal-form">
            <div className="form-group">
              <label htmlFor="donation-food-name">Food / Item Name</label>
              <input id="donation-food-name" value={form.foodName} onChange={(event) => updateField('foodName', event.target.value)} placeholder="e.g. Prepared vegetable meals" />
              {fieldError('foodName')}
            </div>

            <div className="form-row-2">
              <div className="form-group">
                <label htmlFor="donation-food-type">Food Type</label>
                <select id="donation-food-type" value={form.foodType} onChange={(event) => updateField('foodType', event.target.value)}>
                  <option value="">Select type</option>
                  <option>Prepared Meals</option>
                  <option>Fruits & Vegetables</option>
                  <option>Bakery</option>
                  <option>Packaged Food</option>
                  <option>Beverages</option>
                  <option>Other</option>
                </select>
                {fieldError('foodType')}
              </div>
              <div className="form-group">
                <label htmlFor="donation-unit">Unit</label>
                <select id="donation-unit" value={form.unit} onChange={(event) => updateField('unit', event.target.value)}>
                  <option value="">Select unit</option>
                  <option>Meals</option>
                  <option>Kg</option>
                  <option>Boxes</option>
                  <option>Crates</option>
                  <option>Packets</option>
                  <option>Pieces</option>
                </select>
                {fieldError('unit')}
              </div>
            </div>

            <div className="form-row-2">
              <div className="form-group">
                <label htmlFor="donation-quantity">Quantity</label>
                <input id="donation-quantity" type="number" min="0.01" step="any" value={form.quantity} onChange={(event) => updateField('quantity', event.target.value)} placeholder="50" />
                {fieldError('quantity')}
              </div>
              <div className="form-group">
                <label htmlFor="donation-expiry">Expiry Date & Time</label>
                <input id="donation-expiry" type="datetime-local" value={form.expiryTime} onChange={(event) => updateField('expiryTime', event.target.value)} />
                {fieldError('expiryTime')}
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="donation-address">Pickup Address</label>
              <input id="donation-address" value={form.pickupAddress} onChange={(event) => updateField('pickupAddress', event.target.value)} placeholder="Street address for pickup" />
              {fieldError('pickupAddress')}
            </div>

            <div className="form-group">
              <label htmlFor="donation-description">Description <span className="optional-label">Optional</span></label>
              <textarea id="donation-description" value={form.description} onChange={(event) => updateField('description', event.target.value)} placeholder="Storage notes, allergens, or serving details" rows="3" />
            </div>

            <div className="form-row-2">
              <div className="form-group">
                <label htmlFor="donation-latitude">Latitude <span className="optional-label">Optional</span></label>
                <input id="donation-latitude" type="number" step="any" value={form.latitude} onChange={(event) => updateField('latitude', event.target.value)} />
              </div>
              <div className="form-group">
                <label htmlFor="donation-longitude">Longitude <span className="optional-label">Optional</span></label>
                <input id="donation-longitude" type="number" step="any" value={form.longitude} onChange={(event) => updateField('longitude', event.target.value)} />
              </div>
            </div>

            {submitError ? <p className="form-error" role="alert">{submitError}</p> : null}
            <div className="modal-actions-row">
              <button type="button" className="btn-modal-cancel" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn-pill-hero-primary" disabled={isSubmitting}>
                {isSubmitting ? 'Posting donation...' : 'Post Donation →'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}