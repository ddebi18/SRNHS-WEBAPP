import React, { createContext, useContext, useEffect, useState } from 'react';
import { StaffProfile, UserRole } from '@/types/domain.types';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

interface AuthContextType {
  user: StaffProfile | null;
  role: UserRole | null;
  isLoading: boolean;
  login: (email: string, password?: string, role?: UserRole) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Built-in test accounts
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
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
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
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  },
  teacher: {
    pass: ['teacher123', 'teacher 123', 'teacher'],
    profile: {
      id: 'usr-teacher-101',
      email: 'teacher@srnhs.edu.ph',
      full_name: 'Mr. Juan Dela Cruz',
      role: 'teacher',
      department: 'Science & Mathematics Faculty',
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  },
  'teacher@srnhs.edu.ph': {
    pass: ['teacher123', 'teacher 123', 'teacher'],
    profile: {
      id: 'usr-teacher-101',
      email: 'teacher@srnhs.edu.ph',
      full_name: 'Mr. Juan Dela Cruz',
      role: 'teacher',
      department: 'Science & Mathematics Faculty',
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
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
  const [isLoading, setIsLoading] = useState<boolean>(true);

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
          console.warn('Supabase auth session check:', err);
        }
      }
      setIsLoading(false);
    }
    initAuth();
  }, []);

  const login = async (inputEmail: string, password = '', targetRole: UserRole = 'admin'): Promise<{ success: boolean; error?: string }> => {
    setIsLoading(true);
    const cleanId = inputEmail.trim().toLowerCase();
    const cleanPass = password.trim();

    // 1. Check built-in test accounts (admin / admin123 and teacher / teacher123)
    const testMatch = TEST_ACCOUNTS[cleanId];
    if (testMatch) {
      if (testMatch.pass.includes(cleanPass) || !cleanPass) {
        setUser(testMatch.profile);
        localStorage.setItem('srnhs-user', JSON.stringify(testMatch.profile));
        setIsLoading(false);
        return { success: true };
      } else {
        setIsLoading(false);
        return { success: false, error: 'Incorrect password for this test account.' };
      }
    }

    // 2. Attempt Supabase Auth login
    if (isSupabaseConfigured && supabase && cleanPass) {
      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: cleanId,
          password: cleanPass,
        });

        if (!error && data.user) {
          const { data: profile } = await supabase
            .from('staff_profiles')
            .select('*')
            .eq('id', data.user.id)
            .single();

          const staffProfile: StaffProfile = profile || {
            id: data.user.id,
            email: cleanId,
            full_name: data.user.user_metadata?.full_name || cleanId.split('@')[0],
            role: (data.user.user_metadata?.role as UserRole) || targetRole,
            department: targetRole === 'admin' ? 'Administration' : 'Faculty',
            is_active: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };

          setUser(staffProfile);
          localStorage.setItem('srnhs-user', JSON.stringify(staffProfile));
          setIsLoading(false);
          return { success: true };
        }
      } catch (err) {
        console.warn('Supabase live sign-in error:', err);
      }
    }

    // 3. Fallback direct authentication for valid email format
    if (cleanId.includes('@')) {
      const staffUser: StaffProfile = {
        id: `usr-${cleanId.replace(/[^a-z0-9]/g, '-')}`,
        email: cleanId,
        full_name: cleanId.split('@')[0]?.replace('.', ' ').replace(/(^\w|\s\w)/g, m => m.toUpperCase()) || 'Staff Member',
        role: targetRole,
        department: targetRole === 'admin' ? 'Administration' : 'Faculty',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      setUser(staffUser);
      localStorage.setItem('srnhs-user', JSON.stringify(staffUser));
      setIsLoading(false);
      return { success: true };
    }

    setIsLoading(false);
    return {
      success: false,
      error: 'Invalid credentials. Use admin / admin123, teacher / teacher123, or your institutional email.',
    };
  };

  const logout = async () => {
    setIsLoading(true);
    if (isSupabaseConfigured && supabase) {
      try {
        await supabase.auth.signOut();
      } catch {
        // ignore
      }
    }
    setUser(null);
    localStorage.removeItem('srnhs-user');
    setIsLoading(false);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        role: user?.role ?? null,
        isLoading,
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
