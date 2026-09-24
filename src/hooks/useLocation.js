import { useCallback, useEffect, useRef, useState } from 'react';

export default function useLocation() {
  const [location, setLocation] = useState({ lat: null, lng: null, accuracy: null, error: null });
  const watchIdRef = useRef(null);

  const handlePosition = useCallback((position) => {
    setLocation({
      lat: position.coords.latitude,
      lng: position.coords.longitude,
      accuracy: position.coords.accuracy,
      error: null
    });
    return position.coords;
  }, []);

  const handleError = useCallback((positionError) => {
    const message = positionError.code === 1
      ? 'Location permission is required to update this route.'
      : positionError.message || 'Unable to read your current location.';
    setLocation((current) => ({ ...current, error: message }));
  }, []);

  const getCurrentPosition = useCallback(() => new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      const error = new Error('Geolocation is not supported by this browser.');
      setLocation((current) => ({ ...current, error: error.message }));
      reject(error);
      return;
    }
    navigator.geolocation.getCurrentPosition((position) => resolve(handlePosition(position)), (error) => {
      handleError(error);
      reject(error);
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 15000 });
  }), [handleError, handlePosition]);

  const stopWatching = useCallback(() => {
    if (watchIdRef.current !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  const watchPosition = useCallback(() => {
    if (!navigator.geolocation) {
      const error = new Error('Geolocation is not supported by this browser.');
      setLocation((current) => ({ ...current, error: error.message }));
      return () => {};
    }
    stopWatching();
    watchIdRef.current = navigator.geolocation.watchPosition(handlePosition, handleError, {
      enableHighAccuracy: true,
      maximumAge: 15000,
      timeout: 15000
    });
    return stopWatching;
  }, [handleError, handlePosition, stopWatching]);

  useEffect(() => stopWatching, [stopWatching]);

  return { ...location, getCurrentPosition, watchPosition, stopWatching };
}