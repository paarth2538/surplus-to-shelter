import React, { useState } from 'react';
import ProofCapture from '../ProofCapture';

export default function DeliveryStep({ pickup, onComplete, onError }) {
  const [temperature, setTemperature] = useState('');
  const [crateCount, setCrateCount] = useState('');
  const [proof, setProof] = useState(null);

  return (
    <div className="pickup-flow-step">
      <div className="pickup-flow-step-heading"><span className="section-eyebrow">STEP 3 OF 3</span><h2>Delivery at shelter</h2><p>Confirm the received cargo condition and capture the shelter handoff.</p></div>
      <div className="wizard-form-grid"><label><span>Temperature (°C)</span><input type="number" step="0.1" value={temperature} onChange={(event) => setTemperature(event.target.value)} placeholder="e.g. 4.0" /></label><label><span>Crates received</span><input type="number" min="1" value={crateCount} onChange={(event) => setCrateCount(event.target.value)} placeholder="Count" /></label></div>
      <ProofCapture pickupId={pickup.id} type="delivery" onComplete={setProof} onError={onError} />
      {proof ? <div className="proof-ready-message">Delivery photo and signature ready to submit.</div> : null}
      <button type="button" className="btn-pill-primary wizard-next-button" disabled={!proof || !crateCount} onClick={() => onComplete({ temperature, crateCount, ...proof })}>Complete Delivery</button>
    </div>
  );
}