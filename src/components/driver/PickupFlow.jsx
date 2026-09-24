import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import PickupStep from './steps/PickupStep';
import TransitStep from './steps/TransitStep';
import DeliveryStep from './steps/DeliveryStep';

const steps = ['Pickup at Donor', 'Transit', 'Delivery at Shelter'];

function stepForStatus(status) {
  if (status === 'PICKUP') return 1;
  if (status === 'IN_TRANSIT') return 2;
  return 0;
}

function sessionKey(pickupId) {
  return `pickup-flow:${pickupId}`;
}

export default function PickupFlow({ pickup, driver, onClose, onComplete }) {
  const savedProgress = useMemo(() => {
    try {
      return JSON.parse(window.sessionStorage.getItem(sessionKey(pickup.id)) || 'null');
    } catch {
      return null;
    }
  }, [pickup.id]);
  const [currentStep, setCurrentStep] = useState(savedProgress?.currentStep ?? stepForStatus(pickup.status));
  const [pickupData, setPickupData] = useState(savedProgress?.pickupData || {});
  const [formData, setFormData] = useState(savedProgress?.formData || {});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [retryPayload, setRetryPayload] = useState(null);

  useEffect(() => {
    window.sessionStorage.setItem(sessionKey(pickup.id), JSON.stringify({ currentStep, pickupData, formData }));
  }, [currentStep, formData, pickup.id, pickupData]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(''), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const handleKeyDown = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleError = (stepError) => {
    setError(stepError?.message || 'Something went wrong. Please try again.');
  };

  const updateLocation = useCallback(async ({ lat, lng }) => {
    if (!supabase || !driver?.id || lat === undefined || lng === undefined) return;
    const { error: locationError } = await supabase.rpc('update_driver_location', {
      p_lat: lat,
      p_lng: lng,
      p_accuracy: null
    });
    if (locationError) throw locationError;
  }, [driver]);

  const completeStep = async (payload) => {
    if (!supabase) {
      handleError(new Error('Supabase is not configured.'));
      return;
    }
    const status = ['PICKUP', 'IN_TRANSIT', 'DELIVERED'][currentStep];
    setLoading(true);
    setError('');
    setRetryPayload(payload);
    try {
      const position = payload.lat !== undefined ? { p_lat: payload.lat, p_lng: payload.lng } : {};
      const notes = payload.crateCount ? `Crates: ${payload.crateCount}` : undefined;
      const { error: rpcError } = await supabase.rpc('update_pickup_status', {
        p_pickup_id: pickup.id,
        p_new_status: status,
        p_temperature_c: payload.temperature ? Number(payload.temperature) : null,
        p_proof_photo_url: payload.photoUrl || null,
        p_notes: notes || null,
        ...position
      });
      if (rpcError) throw rpcError;

      const proofUpdate = {
        ...(currentStep === 2 && payload.photoUrl ? { delivery_proof_photo_url: payload.photoUrl } : currentStep === 0 && payload.photoUrl ? { proof_photo_url: payload.photoUrl } : {}),
        ...(currentStep === 2 && payload.signatureUrl ? { delivery_proof_signature_url: payload.signatureUrl } : currentStep === 0 && payload.signatureUrl ? { proof_signature_url: payload.signatureUrl } : {}),
        ...(payload.temperature ? { temperature_c: Number(payload.temperature) } : {}),
        ...(currentStep === 0 ? { pickup_verified_at: new Date().toISOString() } : {}),
        ...(currentStep === 2 ? { delivery_verified_at: new Date().toISOString() } : {})
      };
      if (Object.keys(proofUpdate).length) {
        const { error: proofError } = await supabase.from('pickups').update(proofUpdate).eq('id', pickup.id);
        if (proofError) throw proofError;
      }

      const nextPickupData = { ...pickupData, [`step${currentStep + 1}`]: payload };
      setPickupData(nextPickupData);
      setFormData(payload);
      if (currentStep === steps.length - 1) {
        window.sessionStorage.removeItem(sessionKey(pickup.id));
        setToast('Delivery completed and proof saved.');
        onComplete?.();
      } else {
        setCurrentStep((step) => step + 1);
        setToast(`${steps[currentStep]} confirmed.`);
      }
    } catch (stepError) {
      handleError(stepError);
    } finally {
      setLoading(false);
    }
  };

  const renderStep = () => {
    const props = { pickup, onComplete: completeStep, onError: handleError };
    if (currentStep === 0) return <PickupStep {...props} />;
    if (currentStep === 1) return <TransitStep {...props} onLocationUpdate={updateLocation} />;
    return <DeliveryStep {...props} />;
  };

  return (
    <div className="pickup-wizard-backdrop" role="presentation">
      <section className="pickup-wizard" role="dialog" aria-modal="true" aria-labelledby="pickup-wizard-title">
        <header className="pickup-wizard-header"><div><span className="section-eyebrow">PICKUP EXECUTION</span><h2 id="pickup-wizard-title">{pickup.donor?.name || 'Surplus handoff'}</h2><p>{pickup.shelters?.organization_name || 'Shelter delivery'} · {pickup.donations?.food_name || 'Cargo verification'}</p></div><button autoFocus className="driver-modal-close" onClick={onClose} aria-label="Close pickup wizard">×</button></header>
        <div className="pickup-wizard-stepper" aria-label="Pickup progress">{steps.map((step, index) => <div className={`pickup-wizard-step-marker ${index <= currentStep ? 'is-complete' : ''} ${index === currentStep ? 'is-current' : ''}`} key={step}><span>{index + 1}</span><strong>{step}</strong></div>)}</div>
        {error ? <div className="driver-error wizard-error" role="alert"><span>{error}</span><button type="button" onClick={() => retryPayload && completeStep(retryPayload)}>Retry</button></div> : null}
        <div className={loading ? 'pickup-wizard-content is-loading' : 'pickup-wizard-content'}>{renderStep()}{loading ? <div className="pickup-wizard-loading" aria-live="polite"><span className="wizard-spinner" />Saving route proof...</div> : null}</div>
        {toast ? <div className="pickup-wizard-toast" role="status">{toast}</div> : null}
      </section>
    </div>
  );
}