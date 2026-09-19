import React, { useEffect, useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { AuthProvider } from '@/context/AuthContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { AppRouter } from '@/routes/AppRouter';
import { checkAndApplyUrlSync } from '@/features/sync/syncService';
import { CheckCircle2 } from 'lucide-react';

export const App: React.FC = () => {
  const [syncToast, setSyncToast] = useState<string | null>(null);

  useEffect(() => {
    const syncRes = checkAndApplyUrlSync();
    if (syncRes.synced) {
      setSyncToast(`✓ Successfully synced ${syncRes.studentCount ?? 1} student(s) and sections to this device!`);
      const timer = setTimeout(() => setSyncToast(null), 5000);
      return () => clearTimeout(timer);
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          {syncToast && (
            <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-emerald-600 text-white font-bold text-xs shadow-2xl animate-bounce">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{syncToast}</span>
            </div>
          )}
          <AppRouter />
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
};

export default App;
