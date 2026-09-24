import React, { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (t: Theme) => void;
  /** True when following the OS preference (no manual override saved) */
  followingSystem: boolean;
  resetToSystem: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

/** Returns the OS-preferred theme */
function getSystemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<Theme>(() => {
    const saved = localStorage.getItem('srnhs-theme');
    if (saved === 'dark' || saved === 'light') return saved;
    // School portals default to light mode for a clean, professional look
    return 'light';
  });

  // Track whether the user has manually overridden the theme
  const [followingSystem, setFollowingSystem] = useState<boolean>(() => {
    return !localStorage.getItem('srnhs-theme');
  });

  // Apply class to <html> and persist when user manually picks
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
  }, [theme]);

  // Listen for OS-level dark/light mode changes — only auto-apply when following system
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      if (!localStorage.getItem('srnhs-theme')) {
        setThemeState(e.matches ? 'dark' : 'light');
      }
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const setTheme = (t: Theme) => {
    setThemeState(t);
    setFollowingSystem(false);
    localStorage.setItem('srnhs-theme', t);
  };

  const toggleTheme = () => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  };

  /** Remove override and go back to tracking the OS preference */
  const resetToSystem = () => {
    localStorage.removeItem('srnhs-theme');
    setFollowingSystem(true);
    setThemeState(getSystemTheme());
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme, followingSystem, resetToSystem }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
