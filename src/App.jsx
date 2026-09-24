import React, { useEffect, useState } from 'react';
import ThreeCanvas from './components/ThreeCanvas';
import AuthModal from './components/AuthModal';
import DonationModal from './components/DonationModal';
import ProtectedRoute from './components/ProtectedRoute';
import RoleDashboard from './components/RoleDashboard';
import DispatchDashboard from './components/dispatch/DispatchDashboard';
import PickupTrackingView from './components/shared/PickupTrackingView';
import PickupLogisticsMap from './components/shared/PickupLogisticsMap';
import ImpactDashboard from './components/impact/ImpactDashboard';
import NotificationBell from './components/notifications/NotificationBell';
import { useAuth } from './context/AuthContext';
import { supabase } from './lib/supabase';
import './App.css';

export default function App() {
  const { user, profile, loading, signOut } = useAuth();
  const [activeNav, setActiveNav] = useState('How It Works');
  const [activeMode, setActiveMode] = useState('van'); // 'van' | 'stories' | 'tracking'
  const [filterCategory, setFilterCategory] = useState('All');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [pathname, setPathname] = useState(window.location.pathname);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isDonationModalOpen, setIsDonationModalOpen] = useState(false);
  const [donationRefreshKey, setDonationRefreshKey] = useState(0);

  const [pickupForm, setPickupForm] = useState({
    businessName: '',
    category: 'Fresh Produce',
    crates: '12',
    address: ''
  });
  const [publicMetrics, setPublicMetrics] = useState({
    totalDeliveries: 0,
    totalWeight: 0,
    totalMeals: 0,
    sheltersServed: 0,
    totalCo2e: 0,
    loading: true
  });

  const navigate = (path) => {
    if (window.location.pathname !== path) {
      window.history.pushState({}, '', path);
    }
    setPathname(path);
    setIsProfileMenuOpen(false);
  };

  useEffect(() => {
    const handlePopState = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (loading) return;

    const pathParts = pathname.split('/').filter(Boolean);
    const requestedRole = pathParts[0] || '';
    const isTrackingPath = pathParts.length === 3 && pathParts[1] === 'pickup';
    const protectedPath = ['dashboard', 'donor', 'shelter', 'driver', 'admin', 'dispatch', 'impact'].includes(requestedRole) || isTrackingPath;

    if (!user && protectedPath) {
      navigate('/login');
      return;
    }

    if (user && profile && requestedRole === 'dashboard') {
      navigate(`/${profile.role}`);
      return;
    }

    if (user && profile && ['donor', 'shelter', 'driver', 'admin', 'dispatch'].includes(requestedRole) && requestedRole !== profile.role && requestedRole !== 'impact' && !(requestedRole === 'dispatch' && profile.role === 'admin')) {
      navigate(`/${profile.role}`);
    }
  }, [loading, user, profile, pathname]);

  useEffect(() => {
    if (!supabase) {
      setPublicMetrics((prev) => ({ ...prev, loading: false }));
      return undefined;
    }
    let isMounted = true;
    const loadPublicMetrics = async () => {
      try {
        const { data, error } = await supabase.rpc('get_public_impact_metrics');
        if (!isMounted) return;
        if (!error && data && typeof data === 'object') {
          setPublicMetrics({
            totalDeliveries: Number(data.total_deliveries) || 0,
            totalWeight: Number(data.total_weight_kg) || 0,
            totalMeals: Number(data.total_meals) || 0,
            sheltersServed: Number(data.shelters_served) || 0,
            totalCo2e: Number(data.total_co2e_avoided) || 0,
            loading: false
          });
        } else {
          const { count } = await supabase
            .from('pickups')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'DELIVERED');
          if (!isMounted) return;
          setPublicMetrics({
            totalDeliveries: count || 0,
            totalWeight: 0,
            totalMeals: 0,
            sheltersServed: 0,
            totalCo2e: 0,
            loading: false
          });
        }
      } catch {
        if (isMounted) setPublicMetrics((prev) => ({ ...prev, loading: false }));
      }
    };
    void loadPublicMetrics();
    return () => { isMounted = false; };
  }, []);

  const pathParts = pathname.split('/').filter(Boolean);
  const requestedRole = pathParts[0] || '';
  const isTrackingPath = pathParts.length === 3 && pathParts[1] === 'pickup';
  const trackingPickupId = isTrackingPath ? pathParts[2] : null;
  const isProtectedPath = ['dashboard', 'donor', 'shelter', 'driver', 'admin', 'dispatch', 'impact'].includes(requestedRole) || isTrackingPath;

  if (loading) {
    return <div className="auth-loading-state">Restoring your secure session...</div>;
  }

  if (isProtectedPath) {
    if (requestedRole === 'dispatch') {
      return <ProtectedRoute allowedRoles={['admin']} onNavigate={navigate}><DispatchDashboard user={user} onNavigate={navigate} onSignOut={async () => { await signOut(); navigate('/'); }} /></ProtectedRoute>;
    }
    if (requestedRole === 'impact') {
      return <ProtectedRoute allowedRoles={['donor', 'shelter', 'driver', 'admin']} onNavigate={navigate}><main className="dashboard-shell"><header className="dashboard-topbar"><button className="brand-logo" onClick={() => navigate('/')} aria-label="Go to home"><div className="logo-icon-wrap"><svg className="brand-circles-svg" viewBox="0 0 48 48" fill="none" aria-hidden="true"><circle cx="20" cy="24" r="14" fill="#2b60ec" fillOpacity="0.18" /><circle cx="28" cy="24" r="14" fill="#2b60ec" /><circle cx="20" cy="24" r="8" fill="#ffffff" /></svg></div><div className="brand-text"><span className="brand-title">surplus<span className="brand-accent">2</span>shelter</span><span className="brand-sub">DIRECT CARE LOGISTICS</span></div></button><div style={{ display: 'flex', gap: 12, alignItems: 'center' }}><NotificationBell user={user} role={profile?.role} onNavigate={navigate} /><button className="impact-tab-btn" onClick={() => navigate(`/${profile?.role || 'dashboard'}`)}>← Back to Dashboard</button><button className="btn-pill-secondary" onClick={async () => { await signOut(); navigate('/'); }}>Log out</button></div></header><ImpactDashboard onNavigate={navigate} /></main></ProtectedRoute>;
    }
    if (isTrackingPath) {
      return <ProtectedRoute allowedRoles={[requestedRole]} onNavigate={navigate}><PickupTrackingView pickupId={trackingPickupId} user={user} role={requestedRole} onBack={() => navigate(`/${requestedRole}`)} /><PickupLogisticsMap pickupId={trackingPickupId} /></ProtectedRoute>;
    }
    return (
      <ProtectedRoute
        allowedRoles={requestedRole === 'dashboard' ? [profile?.role] : [requestedRole]}
        onNavigate={navigate}
      >
        <RoleDashboard
          onNavigate={navigate}
          onDonate={() => setIsDonationModalOpen(true)}
          donationRefreshKey={donationRefreshKey}
          onSignOut={async () => {
            await signOut();
            navigate('/');
          }}
        />
      </ProtectedRoute>
    );
  }

  const dispatches = [
    {
      id: 1,
      donor: 'Whole Foods Market',
      recipient: 'St. Jude Family Shelter',
      cargo: '48 crates of organic apples, greens & baked goods',
      time: 'Delivered 12m ago',
      status: 'Completed',
      statusColor: 'emerald',
      eta: 'Completed',
      category: 'Produce'
    },
    {
      id: 2,
      donor: 'Target Distribution Hub',
      recipient: 'ShelterCare Family Center',
      cargo: '120 winter warmth coats & hygiene kits',
      time: 'In Transit • Van #04',
      status: 'Active Van',
      statusColor: 'blue',
      eta: 'ETA 8 mins',
      category: 'Warmth'
    },
    {
      id: 3,
      donor: 'Metropolitan Catering Co.',
      recipient: 'Grace House Community Shelter',
      cargo: '85 prepared hot nutritious dinner entrées',
      time: 'Cold-chain verification',
      status: 'Checking',
      statusColor: 'amber',
      eta: 'Departing in 4m',
      category: 'Food'
    }
  ];

  const wishlists = [
    {
      title: 'Fresh Fruits & Leafy Greens',
      description: '6 community shelters craving immediate dinner drops',
      urgency: 'High Urgency',
      color: 'red'
    },
    {
      title: 'Thermal Blankets & Heavy Socks',
      description: 'Overnight cold wave relief hub preparedness',
      urgency: 'Medium',
      color: 'blue'
    },
    {
      title: 'Baby Diaper Kits & Sanitizers',
      description: 'Family shelter mission readiness inventory',
      urgency: 'Fulfilled',
      color: 'emerald'
    }
  ];

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitError('');

    if (!supabase) {
      setSubmitError('Supabase is not configured. Add the project values to .env.local.');
      setIsSubmitting(false);
      return;
    }

    const { error } = await supabase.from('pickup_requests').insert({
      business_name: pickupForm.businessName.trim(),
      category: pickupForm.category,
      crates: Number(pickupForm.crates),
      address: pickupForm.address.trim()
    });

    if (error) {
      setSubmitError('We could not schedule this pickup. Please try again.');
      setIsSubmitting(false);
      return;
    }

    setSubmitted(true);
    setIsSubmitting(false);
    setTimeout(() => {
      setSubmitted(false);
      setIsModalOpen(false);
    }, 2000);
  };

  return (
    <div className="stitch-app">
      {/* Top Banner */}
      <div className="top-announcement-banner">
        <div className="banner-inner">
          <span className="banner-pill">⚡ Live Network</span>
          <span className="banner-text">
            Join <strong>340+</strong> businesses & couriers transforming food surplus into neighbourhood care today.
          </span>
          <button className="banner-btn" onClick={() => setIsModalOpen(true)}>
            Schedule Today's Drop →
          </button>
        </div>
      </div>

      {/* Main Navbar */}
      <header className="stitch-navbar">
        <div className="navbar-container">
          {/* Logo */}
          <div className="brand-logo" onClick={() => setActiveNav('How It Works')}>
            <div className="logo-icon-wrap">
              <svg className="brand-circles-svg" viewBox="0 0 48 48" fill="none">
                <circle cx="20" cy="24" r="14" fill="#2b60ec" fillOpacity="0.18" />
                <circle cx="28" cy="24" r="14" fill="#2b60ec" />
                <circle cx="20" cy="24" r="8" fill="#ffffff" />
              </svg>
            </div>
            <div className="brand-text">
              <span className="brand-title">surplus<span className="brand-accent">2</span>shelter</span>
              <span className="brand-sub">DIRECT CARE LOGISTICS</span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="nav-links">
            {['How It Works', 'Explore Causes', 'Partner Donors', 'Live Impact', 'Our Story', 'Track & Dispatches'].map((item) => (
              <button
                key={item}
                className={`nav-link-btn ${activeNav === item ? 'nav-active' : ''}`}
                onClick={() => {
                  setActiveNav(item);
                  if (item === 'Track & Dispatches') setActiveMode('tracking');
                  if (item === 'Our Story') setActiveMode('stories');
                  if (item === 'How It Works') setActiveMode('van');
                  if (item === 'Live Impact') {
                    document.getElementById('live-impact-section')?.scrollIntoView({ behavior: 'smooth' });
                  }
                }}
              >
                {item}
              </button>
            ))}
          </nav>

          {/* Action Buttons */}
          <div className="nav-actions">
            <button className="btn-pill-primary" onClick={() => setIsDonationModalOpen(true)}>
              Donate Surplus
            </button>
            <button className="btn-pill-secondary" onClick={() => {
              if (profile?.role === 'shelter') navigate('/shelter');
                else if (user) setIsModalOpen(true);
              else { setIsAuthModalOpen(true); navigate('/login'); }
            }}>
              Request Supplies
            </button>
            {user ? (
              <>
                <NotificationBell user={user} role={profile?.role} onNavigate={navigate} />
                <div className="profile-menu-wrap">
                  <button
                    className="user-avatar-pill"
                  title={`${profile?.name || profile?.email || 'Account'} profile`}
                  onClick={() => setIsProfileMenuOpen((current) => !current)}
                >
                  <span>{(profile?.name || profile?.email || 'U').slice(0, 2).toUpperCase()}</span>
                </button>
                {isProfileMenuOpen ? (
                  <div className="profile-menu">
                    <strong>{profile?.name || 'Network member'}</strong>
                    <span>{profile?.role || 'Account'}</span>
                    <button onClick={() => navigate('/dashboard')}>Profile & Dashboard</button>
                    <button onClick={async () => { await signOut(); navigate('/'); }}>Log out</button>
                  </div>
                ) : null}
                </div>
              </>
            ) : (
              <button className="btn-pill-secondary" onClick={() => { setIsAuthModalOpen(true); navigate('/login'); }}>
                Log in
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="hero-section">
        <div className="hero-container">
          {/* Left Column: Text & CTA */}
          <div className="hero-content">
            <div className="kicker-badge">
              <span className="kicker-dot"></span>
              <span>DIRECT CARE LOGISTICS: RESCUING SURPLUS FOR GOOD</span>
            </div>

            <h1 className="hero-headline">
              Surplus goods.<br />
              Delivered<br />
              <span className="hero-italic-highlight">with dignity.</span>
            </h1>

            <p className="hero-subtext">
              Connecting excess food, warm apparel, and hygiene supplies from retailers and grocers
              directly to neighborhood shelters. Zero waste. 100% human warmth.
            </p>

            <div className="hero-cta-group">
              <button className="btn-pill-hero-primary" onClick={() => setIsModalOpen(true)}>
                <span>Schedule a Pickup</span>
                <span className="btn-arrow">➜</span>
              </button>
              <button
                className="btn-pill-hero-secondary"
                onClick={() => {
                  const el = document.getElementById('dispatches-section');
                  el?.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                <span>📍 Visit Shelters Near You</span>
              </button>
            </div>

            {/* Screen Mode Switcher */}
            <div className="screen-variant-switcher">
              <span className="switcher-label">Stitch 3D View:</span>
              <button
                className={`switch-tab ${activeMode === 'van' ? 'switch-tab-active' : ''}`}
                onClick={() => setActiveMode('van')}
              >
                🚐 3D Experience
              </button>
              <button
                className={`switch-tab ${activeMode === 'stories' ? 'switch-tab-active' : ''}`}
                onClick={() => setActiveMode('stories')}
              >
                📖 3D Stories
              </button>
              <button
                className={`switch-tab ${activeMode === 'tracking' ? 'switch-tab-active' : ''}`}
                onClick={() => setActiveMode('tracking')}
              >
                📡 Live Tracking
              </button>
            </div>

            {/* Social Proof */}
            <div className="social-proof-row">
              <div className="avatar-stack">
                <img src="/screenshots/screen-logo.png" alt="Avatar 1" className="avatar-img" />
                <div className="avatar-chip avatar-blue">MK</div>
                <div className="avatar-chip avatar-emerald">SJ</div>
                <div className="avatar-chip avatar-amber">WF</div>
              </div>
              <div className="rating-wrap">
                <div className="star-rating">
                  {'★'.repeat(5)}
                </div>
                <span className="rating-desc">Automated 18-minute cold-chain updates</span>
              </div>
            </div>
          </div>

          {/* Right Column: 3D Interactive Canvas */}
          <div className="hero-3d-stage">
            <div className="hero-stage-card">
              <ThreeCanvas activeMode={activeMode} />
            </div>
          </div>
        </div>
      </section>

      {/* Live Impact Telemetry Bar */}
      <section className="telemetry-bar-section" id="live-impact-section">
        <div className="telemetry-container">
          <div className="telemetry-header">
            <div className="telemetry-title-group">
              <span className="pulse-indicator"></span>
              <h2 className="telemetry-heading">Live Impact Network Telemetry</h2>
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <div className="telemetry-tag">
                Real-time verified delivery data across community shelter routes
              </div>
              <button
                className="btn-pill-secondary"
                style={{ fontSize: 13, padding: '6px 16px' }}
                onClick={() => navigate(user ? `/${profile?.role || 'donor'}` : '/impact')}
              >
                View Full Impact Dashboard →
              </button>
            </div>
          </div>

          <div className="telemetry-grid">
            <div className="telemetry-card">
              <div className="tcard-top">
                <span className="tcard-icon">📦</span>
                <span className="tcard-badge badge-emerald">Verified</span>
              </div>
              <div className="tcard-value">
                {publicMetrics.totalWeight > 0 ? `${publicMetrics.totalWeight} kg` : `${publicMetrics.totalDeliveries}`}
              </div>
              <div className="tcard-title">{publicMetrics.totalWeight > 0 ? 'Food Rescued & Delivered' : 'Completed Deliveries'}</div>
              <div className="tcard-detail">Verified operational data</div>
            </div>

            <div className="telemetry-card">
              <div className="tcard-top">
                <span className="tcard-icon">🏠</span>
                <span className="tcard-badge badge-blue">Supplied</span>
              </div>
              <div className="tcard-value">{publicMetrics.sheltersServed}</div>
              <div className="tcard-title">Shelters Actively Supplied</div>
              <div className="tcard-detail">Community receiving network</div>
            </div>

            <div className="telemetry-card">
              <div className="tcard-top">
                <span className="tcard-icon">🍽️</span>
                <span className="tcard-badge badge-purple">Meals</span>
              </div>
              <div className="tcard-value">{publicMetrics.totalMeals}</div>
              <div className="tcard-title">Meals Rescued & Shared</div>
              <div className="tcard-detail">Direct nutrition support</div>
            </div>

            <div className="telemetry-card">
              <div className="tcard-top">
                <span className="tcard-icon">🌿</span>
                <span className="tcard-badge badge-emerald">Diverted</span>
              </div>
              <div className="tcard-value">{publicMetrics.totalCo2e > 0 ? `${publicMetrics.totalCo2e} kg` : '0 kg'}</div>
              <div className="tcard-title">CO₂e Emissions Avoided</div>
              <div className="tcard-detail">Landfill diversion impact</div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="workflow-section">
        <div className="workflow-container">
          <div className="workflow-header-row">
            <div className="workflow-header-left">
              <div className="kicker-sub">EFFICIENT, ZERO-WASTE WORKFLOW</div>
              <h2 className="section-heading">
                How healthy surplus transforms<br />
                into warm community shelter meals.
              </h2>
            </div>
            <div className="workflow-header-right">
              <p className="workflow-desc">
                We integrate supermarket, restaurant, and company logistics directly into scheduled
                courier routes, preventing waste with frictionless speed and dignity.
              </p>
            </div>
          </div>

          <div className="workflow-steps-grid">
            <div className="step-card">
              <div className="step-top">
                <span className="step-num">01</span>
                <span className="step-icon-badge">⚡</span>
              </div>
              <h3 className="step-title">Flag Surplus</h3>
              <p className="step-body">
                Grocers, restaurants, and retailers post excess food, supplies, or hygiene items with quick
                barcode & weight scanning.
              </p>
              <div className="step-footer">
                <button className="step-action-pill" onClick={() => setIsModalOpen(true)}>
                  Inventory scan &lt;30 seconds
                </button>
              </div>
            </div>

            <div className="step-card">
              <div className="step-top">
                <span className="step-num">02</span>
                <span className="step-icon-badge">🧭</span>
              </div>
              <h3 className="step-title">Smart Routing</h3>
              <p className="step-body">
                Our real-time engine matches surplus batches with verified nearby recipient shelters by
                urgent dietary need and bed capacity.
              </p>
              <div className="step-footer">
                <button className="step-action-pill" onClick={() => setActiveMode('tracking')}>
                  Predictive demand inventory
                </button>
              </div>
            </div>

            <div className="step-card">
              <div className="step-top">
                <span className="step-num">03</span>
                <span className="step-icon-badge">🚚</span>
              </div>
              <h3 className="step-title">Direct Delivery</h3>
              <p className="step-body">
                Dedicated fleet and certified volunteer couriers pick up insulated coolers and deliver directly
                to shelter kitchen drop-offs.
              </p>
              <div className="step-footer">
                <button className="step-action-pill" onClick={() => setActiveMode('tracking')}>
                  Dispatched in record route
                </button>
              </div>
            </div>

            <div className="step-card">
              <div className="step-top">
                <span className="step-num">04</span>
                <span className="step-icon-badge">🛡️</span>
              </div>
              <h3 className="step-title">Verified Impact</h3>
              <p className="step-body">
                Donors receive instant receipt delivery confirmations, digital timestamps, and CO2 tax-free
                deduction reports.
              </p>
              <div className="step-footer">
                <button className="step-action-pill" onClick={() => setIsModalOpen(true)}>
                  Tax eligibility guarantee
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Live Rescue Dispatches & Shelter Wishlist Split */}
      <section className="dispatches-section" id="dispatches-section">
        <div className="dispatches-container">
          <div className="split-grid">
            {/* Left: Live Dispatches */}
            <div className="split-card dispatches-card">
              <div className="card-header-row">
                <div>
                  <div className="card-kicker">
                    <span className="kicker-dot dot-emerald"></span>
                    <span>Live Rescue Dispatches</span>
                  </div>
                  <div className="card-subtext">Real-time telemetry from active courier routes.</div>
                </div>
                <button className="card-link-btn" onClick={() => setActiveMode('tracking')}>
                  View all 24 vans ➜
                </button>
              </div>

              {/* Filter Chips */}
              <div className="filter-chips-row">
                {['All', 'Produce', 'Warmth', 'Food'].map((cat) => (
                  <button
                    key={cat}
                    className={`filter-chip ${filterCategory === cat ? 'chip-active' : ''}`}
                    onClick={() => setFilterCategory(cat)}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {/* Dispatch Items List */}
              <div className="dispatch-items-list">
                {dispatches
                  .filter((d) => filterCategory === 'All' || d.category === filterCategory)
                  .map((d) => (
                    <div key={d.id} className="dispatch-item-card">
                      <div className="item-icon-col">
                        <div className={`status-bubble bubble-${d.statusColor}`}>
                          {d.statusColor === 'emerald' ? '✓' : d.statusColor === 'blue' ? '🚐' : '⏳'}
                        </div>
                      </div>
                      <div className="item-details-col">
                        <div className="item-title">
                          <strong>{d.donor}</strong>
                          <span className="route-arrow">➔</span>
                          <span className="recipient-name">{d.recipient}</span>
                        </div>
                        <div className="item-cargo">{d.cargo}</div>
                        <div className="item-meta">
                          <span>{d.time}</span>
                          <span className="meta-bullet">•</span>
                          <span className="meta-eta">{d.eta}</span>
                        </div>
                      </div>
                      <div className="item-badge-col">
                        <span className={`status-pill pill-${d.statusColor}`}>{d.status}</span>
                      </div>
                    </div>
                  ))}
              </div>

              {/* Summary Graph Bar */}
              <div className="dispatch-summary-footer">
                <div className="summary-stat">
                  <span className="summary-label">IN TRANSIT TODAY</span>
                  <span className="summary-number">14.8 Tons Redirected Today</span>
                </div>
                <div className="sparkline-graphic">
                  <svg viewBox="0 0 160 36" className="sparkline-svg">
                    <path
                      d="M 0 28 Q 20 25, 40 22 T 80 14 T 120 18 T 160 4"
                      fill="none"
                      stroke="#10b981"
                      strokeWidth="3"
                      strokeLinecap="round"
                    />
                    <path
                      d="M 0 28 Q 20 25, 40 22 T 80 14 T 120 18 T 160 4 L 160 36 L 0 36 Z"
                      fill="url(#sparkGradient)"
                      opacity="0.25"
                    />
                    <defs>
                      <linearGradient id="sparkGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" />
                        <stop offset="100%" stopColor="#ffffff" />
                      </linearGradient>
                    </defs>
                  </svg>
                </div>
              </div>
            </div>

            {/* Right: Urgent Wishlist + Testimonial */}
            <div className="split-right-column">
              <div className="split-card wishlist-card">
                <div className="card-header-row">
                  <div>
                    <div className="card-kicker text-red">CRITICAL DEMAND</div>
                    <h3 className="card-main-title">Urgent Shelter Wishlist</h3>
                  </div>
                  <span className="demand-icon">💧</span>
                </div>

                <div className="wishlist-items-list">
                  {wishlists.map((w, idx) => (
                    <div key={idx} className="wishlist-item">
                      <div className="wishlist-info">
                        <div className="wishlist-item-title">{w.title}</div>
                        <div className="wishlist-item-sub">{w.description}</div>
                      </div>
                      <span className={`urgency-pill pill-${w.color}`}>{w.urgency}</span>
                    </div>
                  ))}
                </div>

                <button className="claim-priority-btn" onClick={() => setIsModalOpen(true)}>
                  Claim a high priority dispatch ➜ Dispatch Log
                </button>
              </div>

              {/* Testimonial Quote */}
              <div className="testimonial-card">
                <blockquote className="quote-text">
                  “Picking up 50 crates of wholesome dough for the warm shelter kitchen and seeing their
                  smiling faces straight inside the kitchen at 8 a.m. yesterday is the best part of our Saturday.”
                </blockquote>
                <div className="quote-author">
                  <div className="author-avatar">MR</div>
                  <div className="author-info">
                    <span className="author-name">Marcus R.</span>
                    <span className="author-role">Lead Courier Partner • Pacific Northwest</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Bill Emerson Good Samaritan Act & Donor Partners */}
      <section className="partners-section">
        <div className="partners-container">
          <div className="partners-header">
            <span className="kicker-sub">LEGAL PROTECTION & CERTIFIED PARTNERS</span>
            <h2 className="partners-headline">Backed by the Bill Emerson Good Samaritan Act</h2>
            <p className="partners-subtext">
              Enterprise grocers and donors are 100% protected from civil and criminal liability when
              donating sound grocery goods in good faith.
            </p>
          </div>

          <div className="partners-badges-row">
            {['WHOLE FOODS MARKET', 'SPROUTS MKT', 'BAKERY & BREADS', 'LOCAL PANTRY', 'COLD-CHAIN LOGIST', 'ZERO WASTE FED'].map(
              (partner) => (
                <div key={partner} className="partner-badge-pill">
                  <span>{partner}</span>
                </div>
              )
            )}
          </div>
        </div>
      </section>

      {/* Accelerated Donation CTA Section */}
      <section className="cta-banner-section">
        <div className="cta-container">
          <div className="cta-inner-card">
            <div className="cta-content-col">
              <div className="cta-pill-kicker">
                <span className="kicker-dot dot-emerald"></span>
                <span>ACCELERATED DONATION SYSTEM</span>
              </div>
              <h2 className="cta-heading">
                Have surplus goods today?<br />
                Put them in the hands that need them most.
              </h2>
              <p className="cta-paragraph">
                Whether you manage a neighborhood bakery with leftover croissants or run a multi-store grocery
                chain, our couriers redirect your excess with dignity in minutes.
              </p>
            </div>
            <div className="cta-buttons-col">
              <button className="btn-pill-cta-primary" onClick={() => setIsModalOpen(true)}>
                Partner Surplus Goods ➜
              </button>
              <button className="btn-pill-cta-secondary" onClick={() => setIsModalOpen(true)}>
                Join Courier Fleet
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="stitch-footer">
        <div className="footer-container">
          <div className="footer-top-grid">
            {/* Col 1: Brand & Statement */}
            <div className="footer-brand-col">
              <div className="brand-logo">
                <div className="logo-icon-wrap">
                  <svg className="brand-circles-svg" viewBox="0 0 48 48" fill="none">
                    <circle cx="20" cy="24" r="14" fill="#2b60ec" fillOpacity="0.2" />
                    <circle cx="28" cy="24" r="14" fill="#2b60ec" />
                    <circle cx="20" cy="24" r="8" fill="#ffffff" />
                  </svg>
                </div>
                <div className="brand-text">
                  <span className="brand-title">surplus<span className="brand-accent">2</span>shelter</span>
                  <span className="brand-sub">DIRECT CARE LOGISTICS</span>
                </div>
              </div>
              <p className="footer-mission-text">
                Direct logistics connecting healthy surplus food and everyday essentials directly to
                community shelters with zero waste & dignity.
              </p>
              <div className="location-tag">
                📍 San Francisco • Oakland • Seattle • Vancouver
              </div>
            </div>

            {/* Col 2: Logistics */}
            <div className="footer-links-col">
              <h4 className="footer-heading">LOGISTICS</h4>
              <ul className="footer-links-list">
                <li><a href="#dispatches-section">Live Dispatch</a></li>
                <li><a href="#fulfillment">Fulfillment Map</a></li>
                <li><a href="#dispatch-rules">Dispatch Rules</a></li>
                <li><a href="#volunteer">Volunteer Couriers</a></li>
              </ul>
            </div>

            {/* Col 3: Supporting */}
            <div className="footer-links-col">
              <h4 className="footer-heading">SUPPORTING</h4>
              <ul className="footer-links-list">
                <li><a href="#donors">Donor Network</a></li>
                <li><a href="#shelters">Directory of Shelters</a></li>
                <li><a href="#public-dash">Public Dashboard</a></li>
                <li><a href="#grants">Grant Resources</a></li>
              </ul>
            </div>

            {/* Col 4: Responsibility */}
            <div className="footer-links-col">
              <h4 className="footer-heading">RESPONSIBILITY</h4>
              <ul className="footer-links-list">
                <li><a href="#metrics">Rescue Metrics</a></li>
                <li><a href="#carbon">Carbon Ledger</a></li>
                <li><a href="#zero-waste">Zero Waste Rules</a></li>
                <li><a href="#social">Social Reports</a></li>
              </ul>
            </div>

            {/* Col 5: Legal */}
            <div className="footer-links-col">
              <h4 className="footer-heading">LEGAL</h4>
              <ul className="footer-links-list">
                <li><a href="#act">Bill Emerson Act</a></li>
                <li><a href="#privacy">Privacy Policy</a></li>
                <li><a href="#terms">Terms of Service</a></li>
                <li><a href="#donor-protection">Donor Protection</a></li>
              </ul>
            </div>
          </div>

          <div className="footer-bottom-bar">
            <div className="copyright-text">
              © 2026 SURPLUS TO SHELTER INITIATIVE. POWERED BY LOGISTICS DISPATCH. ALL RIGHTS RESERVED.
            </div>
            <div className="system-status-indicator">
              <span className="status-live-dot"></span>
              <span>System Status: Optimal 100% Operational</span>
            </div>
          </div>
        </div>
      </footer>

      {/* Interactive Modal for Pickup & Donor Entry */}
      {isModalOpen && (
        <div className="modal-backdrop" onClick={() => setIsModalOpen(false)}>
          <div className="modal-window" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-wrap">
                <span className="kicker-badge">
                  <span className="kicker-dot dot-emerald"></span>
                  <span>RAPID COURIER DISPATCH</span>
                </span>
                <h3 className="modal-heading">Schedule Surplus Care Drop</h3>
              </div>
              <button className="modal-close-btn" onClick={() => setIsModalOpen(false)}>✕</button>
            </div>

            {submitted ? (
              <div className="modal-success-state">
                <div className="success-icon">✓</div>
                <h4>Pickup Scheduled with Dignity!</h4>
                <p>Courier Van #04 has been matched to your route. Expected arrival in 18 minutes.</p>
              </div>
            ) : (
              <form onSubmit={handleFormSubmit} className="modal-form">
                <div className="form-group">
                  <label>Business / Organization Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Acme Bakery or Metro Grocer"
                    value={pickupForm.businessName}
                    onChange={(e) => setPickupForm({ ...pickupForm, businessName: e.target.value })}
                  />
                </div>

                <div className="form-row-2">
                  <div className="form-group">
                    <label>Surplus Category</label>
                    <select
                      value={pickupForm.category}
                      onChange={(e) => setPickupForm({ ...pickupForm, category: e.target.value })}
                    >
                      <option value="Fresh Produce">Fresh Produce / Fruits</option>
                      <option value="Prepared Meals">Prepared Meals (Hot/Cold)</option>
                      <option value="Bakery">Bakery & Breads</option>
                      <option value="Warmth & Apparel">Warmth & Apparel</option>
                      <option value="Hygiene Kits">Hygiene & Baby Supplies</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Estimated Crates / Boxes</label>
                    <input
                      type="number"
                      required
                      min="1"
                      value={pickupForm.crates}
                      onChange={(e) => setPickupForm({ ...pickupForm, crates: e.target.value })}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>Pickup Location / Address</label>
                  <input
                    type="text"
                    required
                    placeholder="Street address for cold-chain courier van"
                    value={pickupForm.address}
                    onChange={(e) => setPickupForm({ ...pickupForm, address: e.target.value })}
                  />
                </div>

                {submitError && <p className="form-error" role="alert">{submitError}</p>}

                <div className="modal-actions-row">
                  <button type="button" className="btn-modal-cancel" onClick={() => setIsModalOpen(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn-pill-hero-primary" disabled={isSubmitting}>
                    {isSubmitting ? 'Scheduling...' : 'Dispatch Courier Now ➜'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      <DonationModal
        isOpen={isDonationModalOpen}
        onClose={() => setIsDonationModalOpen(false)}
        onCreated={() => setDonationRefreshKey((current) => current + 1)}
      />

      <AuthModal
        isOpen={isAuthModalOpen || pathname === '/login'}
        onClose={() => { setIsAuthModalOpen(false); navigate('/'); }}
        onAuthenticated={() => { setIsAuthModalOpen(false); navigate('/dashboard'); }}
      />
    </div>
  );
}
