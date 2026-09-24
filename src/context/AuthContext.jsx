import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(Boolean(supabase));

  const refreshProfile = async (userId = user?.id) => {
    if (!supabase || !userId) {
      setProfile(null);
      return null;
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('id, name, email, phone, role, created_at')
      .eq('id', userId)
      .maybeSingle();

    if (error) throw error;
    setProfile(data);
    return data;
  };

  useEffect(() => {
    let isMounted = true;

    if (!supabase) {
      return undefined;
    }

    const loadSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!isMounted) return;

      setUser(session?.user ?? null);
      if (session?.user) {
        try {
          await refreshProfile(session.user.id);
        } catch {
          setProfile(null);
        }
      }
      setLoading(false);
    };

    void loadSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) return;

      setUser(session?.user ?? null);
      if (!session?.user) {
        setProfile(null);
        setLoading(false);
        return;
      }

      window.setTimeout(async () => {
        if (!isMounted) return;
        try {
          await refreshProfile(session.user.id);
        } catch {
          setProfile(null);
        } finally {
          if (isMounted) setLoading(false);
        }
      }, 0);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signUp = async ({ email, password, name, phone, role }) => {
    if (!supabase) throw new Error('Supabase is not configured.');

    return supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name, phone, role }
      }
    });
  };

  const signIn = async ({ email, password }) => {
    if (!supabase) throw new Error('Supabase is not configured.');
    return supabase.auth.signInWithPassword({ email, password });
  };

  const signOut = async () => {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  return (
    <AuthContext.Provider value={{
      user,
      profile,
      loading,
      signUp,
      signIn,
      signOut,
      refreshProfile
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}