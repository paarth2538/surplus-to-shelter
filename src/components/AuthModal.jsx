import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

function friendlyAuthError(error) {
  const message = error?.message?.toLowerCase() ?? '';
  const code = error?.code?.toLowerCase() ?? '';
  if (message.includes('invalid login credentials')) return 'Invalid email or password.';
  if (message.includes('already registered') || message.includes('already exists')) {
    return 'An account with this email already exists.';
  }
  if (code === 'user_already_exists' || code === 'email_exists') {
    return 'An account with this email already exists.';
  }
  if (message.includes('database error saving new user') || message.includes('profiles')) {
    return 'Account setup is incomplete. Run the latest supabase/schema.sql migration, then try again.';
  }
  if (message.includes('password') && (message.includes('weak') || message.includes('short')) || code === 'weak_password') {
    return 'Password must meet the required security requirements.';
  }
  if (message.includes('rate limit') || code === 'over_request_rate_limit') {
    return 'Too many attempts. Please wait a moment and try again.';
  }
  if (message.includes('email not confirmed')) return 'Please confirm your email before signing in.';
  if (code === 'profile_missing') return 'Account created, but profile setup failed. Run the latest database migration.';
  return 'Something went wrong. Please try again.';
}

export default function AuthModal({ isOpen, onClose, onAuthenticated }) {
  const { signIn, signUp, refreshProfile } = useAuth();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({
    name: '',
    phone: '',
    role: 'donor',
    email: '',
    password: ''
  });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRateLimited, setIsRateLimited] = useState(false);

  if (!isOpen) return null;

  const updateField = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (isRateLimited) return;
    setError('');
    setMessage('');
    setIsSubmitting(true);

    try {
      if (mode === 'login') {
        const { data, error: authError } = await signIn({ email: form.email, password: form.password });
        if (authError) throw authError;
        const profile = await refreshProfile(data.user.id);
        if (!profile) {
          const profileError = new Error('Profile missing after authentication');
          profileError.code = 'profile_missing';
          throw profileError;
        }
        onAuthenticated(data.user);
      } else {
        const { data, error: authError } = await signUp(form);
        if (authError) throw authError;
        if (data.user && data.user.identities?.length === 0) {
          const existingAccountError = new Error('User already registered');
          existingAccountError.code = 'user_already_exists';
          throw existingAccountError;
        }
        if (data.session) {
          const profile = await refreshProfile(data.user.id);
          if (!profile) {
            const profileError = new Error('Profile missing after signup');
            profileError.code = 'profile_missing';
            throw profileError;
          }
          onAuthenticated(data.user);
        } else {
          setMessage('Account created. Check your email to confirm your account before signing in.');
        }
      }
    } catch (authError) {
      if (authError?.code === 'over_email_send_rate_limit' || authError?.code === 'over_request_rate_limit') {
        setIsRateLimited(true);
        window.setTimeout(() => setIsRateLimited(false), 60000);
      }
      console.error('[auth]', {
        message: authError?.message,
        code: authError?.code,
        status: authError?.status,
        name: authError?.name,
        details: authError?.details
      });
      setError(friendlyAuthError(authError));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-window auth-modal-window" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-wrap">
            <span className="kicker-badge">
              <span className="kicker-dot"></span>
              <span>SECURE NETWORK ACCESS</span>
            </span>
            <h3 className="modal-heading">{mode === 'login' ? 'Welcome back' : 'Join the care network'}</h3>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close authentication dialog">✕</button>
        </div>

        <div className="auth-mode-switcher" role="tablist" aria-label="Authentication mode">
          <button className={mode === 'login' ? 'auth-mode-active' : ''} onClick={() => setMode('login')} role="tab" aria-selected={mode === 'login'}>
            Log in
          </button>
          <button className={mode === 'signup' ? 'auth-mode-active' : ''} onClick={() => setMode('signup')} role="tab" aria-selected={mode === 'signup'}>
            Create account
          </button>
        </div>

        {message ? <p className="auth-success-message" role="status">{message}</p> : null}
        {error ? <p className="form-error" role="alert">{error}</p> : null}

        <form onSubmit={handleSubmit} className="modal-form">
          {mode === 'signup' ? (
            <>
              <div className="form-group">
                <label htmlFor="auth-name">Name</label>
                <input id="auth-name" required value={form.name} onChange={(event) => updateField('name', event.target.value)} autoComplete="name" />
              </div>
              <div className="form-row-2">
                <div className="form-group">
                  <label htmlFor="auth-phone">Phone</label>
                  <input id="auth-phone" value={form.phone} onChange={(event) => updateField('phone', event.target.value)} autoComplete="tel" />
                </div>
                <div className="form-group">
                  <label htmlFor="auth-role">I am joining as</label>
                  <select id="auth-role" value={form.role} onChange={(event) => updateField('role', event.target.value)}>
                    <option value="donor">Donor</option>
                    <option value="shelter">Shelter</option>
                    <option value="driver">Driver</option>
                  </select>
                </div>
              </div>
            </>
          ) : null}

          <div className="form-group">
            <label htmlFor="auth-email">Email</label>
            <input id="auth-email" type="email" required value={form.email} onChange={(event) => updateField('email', event.target.value)} autoComplete="email" />
          </div>
          <div className="form-group">
            <label htmlFor="auth-password">Password</label>
            <input id="auth-password" type="password" required minLength="8" value={form.password} onChange={(event) => updateField('password', event.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
          </div>

          <div className="modal-actions-row">
            <button type="button" className="btn-modal-cancel" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-pill-hero-primary" disabled={isSubmitting || isRateLimited}>
              {isSubmitting ? 'Working...' : isRateLimited ? 'Try again shortly' : mode === 'login' ? 'Log in →' : 'Create account →'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}