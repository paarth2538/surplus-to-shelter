import React, { useEffect, useState } from 'react';
import useLocation from '../../../hooks/useLocation';

export default function TransitStep({ onComplete, onError, onLocationUpdate }) {
  const location = useLocation();
  const { getCurrentPosition, watchPosition } = location;
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    const stopWatching = watchPosition();
    return stopWatching;
  }, [watchPosition]);

  useEffect(() => {
    const updateLocation = () => {
      void getCurrentPosition()
        .then((position) => onLocationUpdate?.({ lat: position.latitude, lng: position.longitude }))
        .catch(() => {});
    };
    updateLocation();
    const timer = window.setInterval(updateLocation, 30000);
    return () => window.clearInterval(timer);
  }, [getCurrentPosition, onLocationUpdate]);

  useEffect(() => {
    if (!location.error) return;
    onError?.(new Error(location.error));
  }, [location.error, onError]);

  const startTransit = async () => {
    setUpdating(true);
    try {
      const position = location.lat === null ? await getCurrentPosition() : location;
      await onComplete({ lat: position.lat ?? position.latitude, lng: position.lng ?? position.longitude });
    } catch (error) {
      onError?.(error);
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="pickup-flow-step">
      <div className="pickup-flow-step-heading"><span className="section-eyebrow">STEP 2 OF 3</span><h2>Transit</h2><p>Share your live route location, then start the delivery journey.</p></div>
      <div className="location-readout"><span className="location-pulse" />{location.lat ? `Location ready · ±${Math.round(location.accuracy || 0)}m` : 'Waiting for location permission'}</div>
      <button type="button" className="btn-pill-primary wizard-next-button" onClick={startTransit} disabled={updating}>{updating ? 'Starting transit...' : 'Start Transit'}</button>
    </div>
  );
}