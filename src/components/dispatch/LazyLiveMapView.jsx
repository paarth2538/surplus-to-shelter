import React, { lazy, Suspense } from 'react';

const LiveMapView = lazy(() => import('./LiveMapView'));

export default function LazyLiveMapView(props) {
  return <Suspense fallback={<div className="dispatch-empty">Loading live map...</div>}><LiveMapView {...props} /></Suspense>;
}