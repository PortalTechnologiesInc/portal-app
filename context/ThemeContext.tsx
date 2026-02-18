import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';
import { Appearance, AppState } from 'react-native';
import type { ThemeMode } from '@/utils/types';

export type { ThemeMode };

interface ThemeContextType {
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  currentTheme: 'light' | 'dark';
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeMode, setThemeMode] = useState<ThemeMode>('auto');
  const [systemScheme, setSystemScheme] = useState(Appearance.getColorScheme());

  // Load saved theme preference on startup
  useEffect(() => {
    const loadThemePreference = async () => {
      try {
        const savedTheme = await AsyncStorage.getItem('theme_preference');
        if (savedTheme && ['auto', 'light', 'dark'].includes(savedTheme)) {
          setThemeMode(savedTheme as ThemeMode);
        }
      } catch (_error) {}
    };
    loadThemePreference();
  }, []);

  // Listen for system theme changes
  useEffect(() => {
    const checkSystemScheme = () => {
      const currentScheme = Appearance.getColorScheme();
      setSystemScheme(currentScheme);
    };

    // Initial check
    checkSystemScheme();

    // Appearance listener
    const appearanceListener = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemScheme(colorScheme);
    });

    // AppState listener for when app becomes active
    const appStateListener = AppState.addEventListener('change', state => {
      if (state === 'active') {
        checkSystemScheme();
      }
    });

    return () => {
      appearanceListener.remove();
      appStateListener.remove();
    };
  }, []);

  // Save theme preference when it changes
  const handleSetThemeMode = async (mode: ThemeMode) => {
    try {
      setThemeMode(mode);
      await AsyncStorage.setItem('theme_preference', mode);
    } catch (_error) {}
  };

  // Determine current theme based on mode and system preference
  const currentTheme: 'light' | 'dark' =
    themeMode === 'auto' ? (systemScheme ?? 'light') : themeMode === 'dark' ? 'dark' : 'light';

  return (
    <ThemeContext.Provider
      value={{
        themeMode,
        setThemeMode: handleSetThemeMode,
        currentTheme,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
