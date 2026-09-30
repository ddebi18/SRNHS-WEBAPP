import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { StaffProfile, UserRole } from '@/types/domain.types';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

export type LoginPortal = 'admin' | 'teacher';

interface AuthContextType {
  user: StaffProfile | null;
  role: UserRole | null;
  isLoading: boolean;
  sessionId: string | null;
  login: (identifier: string, password: string, portal: LoginPortal) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Inactive session timeout thresholds (Requirement 5)
const ADMIN_IDLE_TIMEOUT_MS = 15 * 60 * 1000;  // 15 minutes for admin
const TEACHER_IDLE_TIMEOUT_MS = 60 * 60 * 1000; // 60 minutes for teacher


export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<StaffProfile | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const lastActivityRef = useRef<number>(Date.now());

  // Log authentication outcomes safely (Requirement 5: Never log passwords)
  const logAuthAttempt = (portal: LoginPortal, outcome: 'success' | 'failure', identifier: string) => {
    try {
      const auditKey = 'srnhs_auth_audit_logs';
      const existing = JSON.parse(localStorage.getItem(auditKey) || '[]');
      const sanitizedId = identifier.length > 3 ? `${identifier.slice(0, 3)}***` : '***';
      const entry = {
        timestamp: new Date().toISOString(),
        portal,
        outcome,
        user: sanitizedId,
      };
      existing.unshift(entry);
      localStorage.setItem(auditKey, JSON.stringify(existing.slice(0, 100)));
    } catch {
      // ignore logging errors
    }
  };

  const clearSession = useCallback(() => {
    setUser(null);
    setSessionId(null);
    localStorage.removeItem('srnhs-user');
    localStorage.removeItem('srnhs-session-id');
    localStorage.removeItem('srnhs-last-activity');
  }, []);

  const logout = useCallback(async () => {
    setIsLoading(true);
    if (isSupabaseConfigured && supabase) {
      try {
        await supabase.auth.signOut();
      } catch {
        // ignore network error during signout
      }
    }
    clearSession();
    setIsLoading(false);
  }, [clearSession]);

  // Idle timeout monitor (Requirement 5: Admin 15m, Teacher 60m)
  useEffect(() => {
    if (!user) return;

    const timeoutDuration = user.role === 'admin' ? ADMIN_IDLE_TIMEOUT_MS : TEACHER_IDLE_TIMEOUT_MS;

    const handleUserActivity = () => {
      lastActivityRef.current = Date.now();
      localStorage.setItem('srnhs-last-activity', String(Date.now()));
    };

    window.addEventListener('mousemove', handleUserActivity, { passive: true });
    window.addEventListener('keydown', handleUserActivity, { passive: true });
    window.addEventListener('click', handleUserActivity, { passive: true });
    window.addEventListener('touchstart', handleUserActivity, { passive: true });

    const interval = setInterval(() => {
      const now = Date.now();
      if (now - lastActivityRef.current >= timeoutDuration) {
        console.warn(`[Auth] Session timed out due to ${timeoutDuration / 60000}m inactivity.`);
        logout();
      }
    }, 15000);

    return () => {
      window.removeEventListener('mousemove', handleUserActivity);
      window.removeEventListener('keydown', handleUserActivity);
      window.removeEventListener('click', handleUserActivity);
      window.removeEventListener('touchstart', handleUserActivity);
      clearInterval(interval);
    };
  }, [user, logout]);

  // Session verification on mount — only trusted if confirmed by Supabase
  useEffect(() => {
    let isMounted = true;

    async function initAuth() {
      if (!isSupabaseConfigured || !supabase) {
        clearSession();
        if (isMounted) setIsLoading(false);
        return;
      }

      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error || !session?.user) {
          clearSession();
          if (isMounted) setIsLoading(false);
          return;
        }

        const { data: profile, error: profileErr } = await supabase
          .from('staff_profiles')
          .select('*')
          .eq('id', session.user.id)
          .single();

        if (profileErr || !profile || !profile.is_active) {
          await supabase.auth.signOut().catch(() => {});
          clearSession();
        } else if (isMounted) {
          const staffUser = profile as StaffProfile;
          setUser(staffUser);
          setSessionId(session.access_token.slice(-16));
          localStorage.setItem('srnhs-user', JSON.stringify(staffUser));
        }
      } catch (err) {
        console.warn('[Auth] Supabase session check notice:', err);
        clearSession();
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    initAuth();

    // Subscribe to auth state changes to keep client in sync with server
    const { data: { subscription } } = supabase
      ? supabase.auth.onAuthStateChange(async (event, session) => {
          if (event === 'SIGNED_OUT' || !session?.user) {
            clearSession();
          }
        })
      : { data: { subscription: { unsubscribe: () => {} } } };

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [clearSession]);

  /**
   * Unified Authentication Handler:
   *  - Verifies credentials via Supabase Auth
   *  - Rejects plain usernames (must be valid email)
   *  - Reads user role exclusively from database staff_profiles record
   *  - Rejects cross-portal submissions with generic error
   *  - Regenerates session ID on login
   */
  const login = async (
    identifier: string,
    password = '',
    portal: LoginPortal
  ): Promise<{ success: boolean; error?: string }> => {
    setIsLoading(true);
    const cleanId = identifier.trim().toLowerCase();
    const cleanPass = password.trim();
    const GENERIC_ERROR = 'Invalid credentials. Please verify and try again.';

    // Email format sanity check — reject plain usernames immediately
    if (!cleanId.includes('@') || !cleanPass) {
      logAuthAttempt(portal, 'failure', cleanId);
      setIsLoading(false);
      return { success: false, error: GENERIC_ERROR };
    }

    if (!isSupabaseConfigured || !supabase) {
      logAuthAttempt(portal, 'failure', cleanId);
      setIsLoading(false);
      return { success: false, error: 'Authentication service unavailable.' };
    }

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanId,
        password: cleanPass,
      });

      if (error || !data.user) {
        logAuthAttempt(portal, 'failure', cleanId);
        setIsLoading(false);
        return { success: false, error: GENERIC_ERROR };
      }

      // Fetch role strictly from database staff_profiles record
      const { data: profile, error: profileErr } = await supabase
        .from('staff_profiles')
        .select('*')
        .eq('id', data.user.id)
        .single();

      if (profileErr || !profile || !profile.is_active) {
        await supabase.auth.signOut().catch(() => {});
        clearSession();
        logAuthAttempt(portal, 'failure', cleanId);
        setIsLoading(false);
        return { success: false, error: GENERIC_ERROR };
      }

      const dbRole: UserRole = profile.role;

      // Cross-portal isolation
      if (dbRole !== portal) {
        await supabase.auth.signOut().catch(() => {});
        clearSession();
        logAuthAttempt(portal, 'failure', cleanId);
        setIsLoading(false);
        return { success: false, error: GENERIC_ERROR };
      }

      const staffProfile: StaffProfile = profile as StaffProfile;
      const newSessionId = `sess-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      setUser(staffProfile);
      setSessionId(newSessionId);
      localStorage.setItem('srnhs-user', JSON.stringify(staffProfile));
      localStorage.setItem('srnhs-session-id', newSessionId);
      lastActivityRef.current = Date.now();
      logAuthAttempt(portal, 'success', cleanId);
      setIsLoading(false);
      return { success: true };
    } catch {
      await supabase.auth.signOut().catch(() => {});
      clearSession();
      logAuthAttempt(portal, 'failure', cleanId);
      setIsLoading(false);
      return { success: false, error: GENERIC_ERROR };
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        role: user?.role ?? null,
        isLoading,
        sessionId,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
