import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';

// Mock Supabase client
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn().mockResolvedValue({ error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
    },
    from: vi.fn(),
  },
  isSupabaseConfigured: true,
}));

describe('Auth Hardening: Mock Credentials and Bypasses Eliminated', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();

    // Default: getSession returns null (unauthenticated)
    vi.mocked(supabase!.auth.getSession).mockResolvedValue({
      data: { session: null },
      error: null,
    });
  });

  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(AuthProvider, null, children);

  it('rejects legacy dummy credentials admin / admin123', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    let loginResult: { success: boolean; error?: string } = { success: true };
    await act(async () => {
      loginResult = await result.current.login('admin', 'admin123', 'admin');
    });

    expect(loginResult.success).toBe(false);
    expect(loginResult.error).toBe('Invalid credentials. Please verify and try again.');
    expect(result.current.user).toBeNull();
    expect(result.current.role).toBeNull();
  });

  it('rejects legacy dummy credentials teacher / teacher123', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    let loginResult: { success: boolean; error?: string } = { success: true };
    await act(async () => {
      loginResult = await result.current.login('teacher', 'teacher123', 'teacher');
    });

    expect(loginResult.success).toBe(false);
    expect(loginResult.error).toBe('Invalid credentials. Please verify and try again.');
    expect(result.current.user).toBeNull();
    expect(result.current.role).toBeNull();
  });

  it('fails and leaves user unauthenticated when Supabase Auth returns an error', async () => {
    vi.mocked(supabase!.auth.signInWithPassword).mockResolvedValue({
      data: { user: null, session: null },
      error: { name: 'AuthApiError', message: 'Invalid login credentials', status: 400 } as any,
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    let loginResult: { success: boolean; error?: string } = { success: true };
    await act(async () => {
      loginResult = await result.current.login('admin@srnhs.edu.ph', 'wrong-pass', 'admin');
    });

    expect(loginResult.success).toBe(false);
    expect(result.current.user).toBeNull();
    expect(result.current.role).toBeNull();
    expect(localStorage.getItem('srnhs-user')).toBeNull();
  });

  it('rejects authentication if user has no staff_profiles row in database', async () => {
    vi.mocked(supabase!.auth.signInWithPassword).mockResolvedValue({
      data: {
        user: { id: 'usr-unregistered', email: 'test@srnhs.edu.ph' } as any,
        session: { access_token: 'fake-token' } as any,
      },
      error: null,
    });

    // Mock from('staff_profiles') returning null/error
    vi.mocked(supabase!.from).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Row not found' } }),
        }),
      }),
    } as any);

    const { result } = renderHook(() => useAuth(), { wrapper });

    let loginResult: { success: boolean; error?: string } = { success: true };
    await act(async () => {
      loginResult = await result.current.login('test@srnhs.edu.ph', 'any-password', 'teacher');
    });

    expect(loginResult.success).toBe(false);
    expect(result.current.user).toBeNull();
    expect(supabase!.auth.signOut).toHaveBeenCalled();
  });

  it('clears unverified legacy localStorage fake sessions on mount', async () => {
    // Inject a fake user in localStorage as if from previous mock login
    localStorage.setItem(
      'srnhs-user',
      JSON.stringify({
        id: 'fake-id',
        email: 'admin@srnhs.edu.ph',
        role: 'admin',
        full_name: 'Fake Admin',
      })
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      // wait for initAuth to run
    });

    expect(result.current.user).toBeNull();
    expect(result.current.role).toBeNull();
    expect(localStorage.getItem('srnhs-user')).toBeNull();
  });
});
