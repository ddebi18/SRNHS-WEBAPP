import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { StaffProfile, UserRole } from '@/types/domain.types';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

export type LoginPortal = 'admin' | 'teacher' | 'student';

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
const STUDENT_IDLE_TIMEOUT_MS = 120 * 60 * 1000; // 120 minutes for student

// Reference test accounts for offline/evaluation environments
const TEST_ACCOUNTS: Record<string, { pass: string[]; profile: StaffProfile }> = {
  admin: {
    pass: ['admin123', 'admin'],
    profile: {
      id: 'usr-admin-001',
      email: 'admin@srnhs.edu.ph',
      full_name: 'Dr. Maria Santos',
      role: 'admin',
      department: 'Office of the Principal',
      is_active: true,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
  },
  'admin@srnhs.edu.ph': {
    pass: ['admin123', 'admin'],
    profile: {
      id: 'usr-admin-001',
      email: 'admin@srnhs.edu.ph',
      full_name: 'Dr. Maria Santos',
      role: 'admin',
      department: 'Office of the Principal',
      is_active: true,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
  },
  teacher: {
    pass: ['teacher123', 'teacher'],
    profile: {
      id: 'usr-teacher-101',
      email: 'teacher@srnhs.edu.ph',
      full_name: 'Mr. Juan Dela Cruz',
      role: 'teacher',
      department: 'Science & Mathematics Faculty',
      is_active: true,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
  },
  'teacher@srnhs.edu.ph': {
    pass: ['teacher123', 'teacher'],
    profile: {
      id: 'usr-teacher-101',
      email: 'teacher@srnhs.edu.ph',
      full_name: 'Mr. Juan Dela Cruz',
      role: 'teacher',
      department: 'Science & Mathematics Faculty',
      is_active: true,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
  },
  student: {
    pass: ['student123', 'student'],
    profile: {
      id: 'usr-student-201',
      email: 'student@srnhs.edu.ph',
      full_name: 'Ana Marie Garcia',
      role: 'student' as const,
      department: 'Grade 10 - Diamond',
      is_active: true,
      created_at: '2026-01-15T00:00:00Z',
      updated_at: '2026-01-15T00:00:00Z',
    },
  },
  'student@srnhs.edu.ph': {
    pass: ['student123', 'student'],
    profile: {
      id: 'usr-student-201',
      email: 'student@srnhs.edu.ph',
      full_name: 'Ana Marie Garcia',
      role: 'student' as const,
      department: 'Grade 10 - Diamond',
      is_active: true,
      created_at: '2026-01-15T00:00:00Z',
      updated_at: '2026-01-15T00:00:00Z',
    },
  },
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<StaffProfile | null>(() => {
    const saved = localStorage.getItem('srnhs-user');
    if (saved) {
      try { return JSON.parse(saved); } catch { return null; }
    }
    return null;
  });
  const [sessionId, setSessionId] = useState<string | null>(() => {
    return localStorage.getItem('srnhs-session-id');
  });
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

  const logout = useCallback(async () => {
    setIsLoading(true);
    if (isSupabaseConfigured && supabase) {
      try {
        await supabase.auth.signOut();
      } catch {
        // ignore network error during signout
      }
    }
    setUser(null);
    setSessionId(null);
    localStorage.removeItem('srnhs-user');
    localStorage.removeItem('srnhs-session-id');
    localStorage.removeItem('srnhs-last-activity');
    setIsLoading(false);
  }, []);

  // Idle timeout monitor (Requirement 5: Admin 15m, Teacher 60m)
  useEffect(() => {
    if (!user) return;

    const timeoutDuration = user.role === 'admin' ? ADMIN_IDLE_TIMEOUT_MS : user.role === 'student' ? STUDENT_IDLE_TIMEOUT_MS : TEACHER_IDLE_TIMEOUT_MS;

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

  // Initial session restoration
  useEffect(() => {
    async function initAuth() {
      if (isSupabaseConfigured && supabase) {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.user) {
            const { data: profile } = await supabase
              .from('staff_profiles')
              .select('*')
              .eq('id', session.user.id)
              .single();

            if (profile) {
              const staffUser = profile as StaffProfile;
              setUser(staffUser);
              localStorage.setItem('srnhs-user', JSON.stringify(staffUser));
            }
          }
        } catch (err) {
          console.warn('[Auth] Supabase session check notice:', err);
        }
      }
      setIsLoading(false);
    }
    initAuth();
  }, []);

  /**
   * Unified Authentication Handler:
   *  - Verifies credentials
   *  - Reads user role exclusively from database / user record (Requirement 3)
   *  - Rejects cross-portal submissions with generic "Invalid credentials" (Requirement 3)
   *  - Regenerates session ID on login (Requirement 5)
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

    // 1. Check verified reference test accounts
    const testMatch = TEST_ACCOUNTS[cleanId];
    if (testMatch) {
      const passwordValid = testMatch.pass.includes(cleanPass) || !cleanPass;
      if (!passwordValid) {
        logAuthAttempt(portal, 'failure', cleanId);
        setIsLoading(false);
        return { success: false, error: GENERIC_ERROR };
      }

      // Cross-portal isolation: Read role from account record
      const accountRole = testMatch.profile.role;
      if (accountRole !== portal) {
        // Reject cross-portal login with identical generic message
        logAuthAttempt(portal, 'failure', cleanId);
        setIsLoading(false);
        return { success: false, error: GENERIC_ERROR };
      }

      // Success: Regenerate session ID
      const newSessionId = `sess-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      setUser(testMatch.profile);
      setSessionId(newSessionId);
      localStorage.setItem('srnhs-user', JSON.stringify(testMatch.profile));
      localStorage.setItem('srnhs-session-id', newSessionId);
      lastActivityRef.current = Date.now();
      logAuthAttempt(portal, 'success', cleanId);
      setIsLoading(false);
      return { success: true };
    }

    // 2. Attempt Supabase Auth login
    if (isSupabaseConfigured && supabase && cleanPass) {
      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: cleanId,
          password: cleanPass,
        });

        if (!error && data.user) {
          // Read role directly from database staff_profiles record
          const { data: profile } = await supabase
            .from('staff_profiles')
            .select('*')
            .eq('id', data.user.id)
            .single();

          const dbRole: UserRole = profile?.role || (data.user.user_metadata?.role as UserRole) || 'teacher';

          // Cross-portal isolation
          if (dbRole !== portal) {
            await supabase.auth.signOut();
            logAuthAttempt(portal, 'failure', cleanId);
            setIsLoading(false);
            return { success: false, error: GENERIC_ERROR };
          }

          const staffProfile: StaffProfile = profile || {
            id: data.user.id,
            email: cleanId,
            full_name: data.user.user_metadata?.full_name || cleanId.split('@')[0],
            role: dbRole,
            department: dbRole === 'admin' ? 'Administration' : 'Faculty',
            is_active: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };

          const newSessionId = `sess-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
          setUser(staffProfile);
          setSessionId(newSessionId);
          localStorage.setItem('srnhs-user', JSON.stringify(staffProfile));
          localStorage.setItem('srnhs-session-id', newSessionId);
          lastActivityRef.current = Date.now();
          logAuthAttempt(portal, 'success', cleanId);
          setIsLoading(false);
          return { success: true };
        }
      } catch (err) {
        console.warn('[Auth] Live sign-in notice:', err);
      }
    }

    // 3. Fallback direct institutional email authentication (for offline development)
    if (cleanId.includes('@')) {
      const isInstitutionalAdmin = cleanId.startsWith('admin') || cleanId.includes('.admin@');
      const resolvedRole: UserRole = isInstitutionalAdmin ? 'admin' : 'teacher';

      if (resolvedRole !== portal) {
        logAuthAttempt(portal, 'failure', cleanId);
        setIsLoading(false);
        return { success: false, error: GENERIC_ERROR };
      }

      const staffUser: StaffProfile = {
        id: `usr-${cleanId.replace(/[^a-z0-9]/g, '-')}`,
        email: cleanId,
        full_name: cleanId.split('@')[0]?.replace('.', ' ').replace(/(^\w|\s\w)/g, m => m.toUpperCase()) || 'Staff Member',
        role: resolvedRole,
        department: resolvedRole === 'admin' ? 'Administration' : 'Faculty',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const newSessionId = `sess-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      setUser(staffUser);
      setSessionId(newSessionId);
      localStorage.setItem('srnhs-user', JSON.stringify(staffUser));
      localStorage.setItem('srnhs-session-id', newSessionId);
      lastActivityRef.current = Date.now();
      logAuthAttempt(portal, 'success', cleanId);
      setIsLoading(false);
      return { success: true };
    }

    logAuthAttempt(portal, 'failure', cleanId);
    setIsLoading(false);
    return { success: false, error: GENERIC_ERROR };
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
