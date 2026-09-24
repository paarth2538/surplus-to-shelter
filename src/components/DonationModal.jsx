import React, { useRef, useState } from 'react';
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

function formatForDatetimeLocal(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function DonationModal({ isOpen, onClose, onCreated }) {
  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  // AI Intake States
  const [imagePreview, setImagePreview] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiError, setAiError] = useState('');
  const [aiSuccessMessage, setAiSuccessMessage] = useState('');
  const [aiEstimatedFields, setAiEstimatedFields] = useState({});
  const [aiMetadata, setAiMetadata] = useState(null);
  const fileInputRef = useRef(null);

  if (!isOpen) return null;

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: '' }));
    setSubmitError('');
    // Remove AI estimate indicator once user manually edits the field
    setAiEstimatedFields((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const handlePhotoSelect = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setAiError('');
    setAiSuccessMessage('');

    // Client-side file validation
    const validMimes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validMimes.includes(file.type)) {
      setAiError('Please choose a JPEG, PNG, or WebP photo.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setAiError('Image is larger than 5 MB. Please choose a smaller photo.');
      return;
    }

    // Generate local preview
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result;
      setImagePreview(dataUrl);

      // Extract raw base64 data without data:image/...;base64, prefix
      const base64Data = String(dataUrl).split(',')[1];
      if (!base64Data) return;

      setIsAnalyzing(true);
      try {
        if (!supabase) {
          throw new Error('Supabase client is not available.');
        }

        const { data, error } = await supabase.functions.invoke('ai-food-intake', {
          body: {
            image_base64: base64Data,
            mime_type: file.type
          }
        });

        if (error) {
          throw new Error(error.message || 'AI analysis unavailable.');
        }

        if (data?.estimate) {
          const est = data.estimate;
          const prefilled = {};

          if (est.food_name) {
            updateField('foodName', est.food_name);
            prefilled.foodName = true;
          }
          if (est.food_type) {
            updateField('foodType', est.food_type);
            prefilled.foodType = true;
          }
          if (est.quantity) {
            updateField('quantity', String(est.quantity));
            prefilled.quantity = true;
          }
          if (est.unit) {
            updateField('unit', est.unit);
            prefilled.unit = true;
          }
          if (est.suggested_expiry_time) {
            updateField('expiryTime', formatForDatetimeLocal(est.suggested_expiry_time));
            prefilled.expiryTime = true;
          }

          setAiEstimatedFields(prefilled);
          setAiMetadata({
            detected_name: est.food_name,
            confidence: est.confidence,
            suggested_hours: est.suggested_expiry_hours,
            source: 'vision_model'
          });
          setAiSuccessMessage('✨ Food detected! Review the prefilled values below before posting.');
        } else if (data?.error) {
          setAiError(data.error);
        }
      } catch (err) {
        setAiError(
          err?.message?.includes('503') || err?.message?.includes('not configured')
            ? 'AI service is temporarily unconfigured. Please fill in the details manually.'
            : 'AI scan could not be completed. You can still fill out the form manually.'
        );
      } finally {
        setIsAnalyzing(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleClearPhoto = () => {
    setImagePreview(null);
    setAiError('');
    setAiSuccessMessage('');
    setAiEstimatedFields({});
    setAiMetadata(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
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
        longitude: form.longitude ? Number(form.longitude) : null,
        ai_estimated: Boolean(aiMetadata),
        ai_metadata: aiMetadata
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
      setImagePreview(null);
      setAiEstimatedFields({});
      setAiMetadata(null);
      setIsSuccess(false);
      onClose();
    }, 1200);
  };

  const fieldError = (field) => (errors[field] ? <span className="field-error">{errors[field]}</span> : null);

  const estimateTag = (field) => (
    aiEstimatedFields[field] ? (
      <span className="ai-estimate-pill" title="Estimated by AI vision — please verify before posting">
        ✨ AI estimate
      </span>
    ) : null
  );

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-window donation-modal-window" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-wrap">
            <span className="kicker-badge"><span className="kicker-dot dot-emerald"></span>DONOR INTAKE</span>
            <h3 className="modal-heading">Post surplus with dignity</h3>
          </div>
          <button className="modal-close-button" onClick={onClose} aria-label="Close donation modal">×</button>
        </div>

        {isSuccess ? (
          <div className="modal-success-state">
            <div className="success-icon">✓</div>
            <h4>Donation posted successfully.</h4>
            <p>Your donation is now visible in your donor workspace.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="modal-form">
            {/* AI Photo Intake Section */}
            <div className="ai-photo-intake-card">
              <div className="ai-intake-header">
                <div>
                  <strong className="ai-intake-title">📸 AI Photo Intake (Optional)</strong>
                  <p className="ai-intake-desc">Take or upload a photo to auto-estimate food type, quantity, and shelf-life.</p>
                </div>
                {!imagePreview ? (
                  <button
                    type="button"
                    className="btn-pill-secondary ai-scan-btn"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isAnalyzing}
                  >
                    {isAnalyzing ? 'Scanning...' : 'Scan Photo'}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn-modal-cancel"
                    style={{ fontSize: 12, padding: '4px 10px' }}
                    onClick={handleClearPhoto}
                    disabled={isAnalyzing}
                  >
                    Clear Photo
                  </button>
                )}
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                style={{ display: 'none' }}
                onChange={handlePhotoSelect}
              />

              {imagePreview ? (
                <div className="ai-preview-row">
                  <img src={imagePreview} alt="Donation preview" className="ai-thumbnail-preview" />
                  <div className="ai-preview-meta">
                    {isAnalyzing ? (
                      <div className="ai-analyzing-indicator">
                        <span className="wizard-spinner" />
                        <span>Analyzing food with vision model...</span>
                      </div>
                    ) : aiSuccessMessage ? (
                      <span className="ai-success-text">{aiSuccessMessage}</span>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {aiError ? (
                <div className="ai-error-banner" role="alert">
                  <span>{aiError}</span>
                  <button type="button" onClick={() => setAiError('')}>×</button>
                </div>
              ) : null}
            </div>

            {/* Standard Form Fields with AI Verification Badges */}
            <div className="form-group">
              <div className="form-label-row">
                <label htmlFor="donation-food-name">Food / Item Name</label>
                {estimateTag('foodName')}
              </div>
              <input
                id="donation-food-name"
                value={form.foodName}
                onChange={(event) => updateField('foodName', event.target.value)}
                placeholder="e.g. Prepared vegetable meals"
              />
              {fieldError('foodName')}
            </div>

            <div className="form-row-2">
              <div className="form-group">
                <div className="form-label-row">
                  <label htmlFor="donation-food-type">Food Type</label>
                  {estimateTag('foodType')}
                </div>
                <select
                  id="donation-food-type"
                  value={form.foodType}
                  onChange={(event) => updateField('foodType', event.target.value)}
                >
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
                <div className="form-label-row">
                  <label htmlFor="donation-unit">Unit</label>
                  {estimateTag('unit')}
                </div>
                <select
                  id="donation-unit"
                  value={form.unit}
                  onChange={(event) => updateField('unit', event.target.value)}
                >
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
                <div className="form-label-row">
                  <label htmlFor="donation-quantity">Quantity</label>
                  {estimateTag('quantity')}
                </div>
                <input
                  id="donation-quantity"
                  type="number"
                  min="0.01"
                  step="any"
                  value={form.quantity}
                  onChange={(event) => updateField('quantity', event.target.value)}
                  placeholder="50"
                />
                {fieldError('quantity')}
              </div>
              <div className="form-group">
                <div className="form-label-row">
                  <label htmlFor="donation-expiry">Expiry Date & Time</label>
                  {estimateTag('expiryTime')}
                </div>
                <input
                  id="donation-expiry"
                  type="datetime-local"
                  value={form.expiryTime}
                  onChange={(event) => updateField('expiryTime', event.target.value)}
                />
                {fieldError('expiryTime')}
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="donation-address">Pickup Address</label>
              <input
                id="donation-address"
                value={form.pickupAddress}
                onChange={(event) => updateField('pickupAddress', event.target.value)}
                placeholder="Street address, city, postcode"
              />
              {fieldError('pickupAddress')}
            </div>

            <div className="form-group">
              <label htmlFor="donation-description">Notes & Storage Conditions (Optional)</label>
              <textarea
                id="donation-description"
                rows="2"
                value={form.description}
                onChange={(event) => updateField('description', event.target.value)}
                placeholder="Keep refrigerated below 4°C, contains wheat, packaged in foil trays"
              />
            </div>

            {submitError ? <div className="form-error" role="alert">{submitError}</div> : null}

            <div className="modal-actions">
              <button type="button" className="btn-modal-cancel" onClick={onClose} disabled={isSubmitting}>
                Cancel
              </button>
              <button type="submit" className="btn-pill-primary" disabled={isSubmitting || isAnalyzing}>
                {isSubmitting ? 'Posting...' : 'Post Donation'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}