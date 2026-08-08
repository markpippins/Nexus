import React, { createContext, useContext, useState, useEffect } from 'react';
import { ThemeMode } from '../types';

interface ThemeContextType {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem('ops_theme') as ThemeMode;
    return saved || 'dark';
  });

  useEffect(() => {
    localStorage.setItem('ops_theme', theme);
    const root = document.documentElement;

    root.classList.remove('theme-dark', 'theme-light', 'theme-steel', 'dark');

    if (theme === 'dark') {
      root.classList.add('dark', 'theme-dark');
      root.style.colorScheme = 'dark';
    } else if (theme === 'steel') {
      root.classList.add('dark', 'theme-steel');
      root.style.colorScheme = 'dark';
    } else {
      root.classList.add('theme-light');
      root.style.colorScheme = 'light';
    }
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
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
