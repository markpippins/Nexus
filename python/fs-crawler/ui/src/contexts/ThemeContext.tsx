import React, { createContext, useContext, useEffect, useState } from 'react'
import { ThemeProvider as MuiThemeProvider, createTheme } from '@mui/material/styles'
import { CssBaseline } from '@mui/material'

type ThemeMode = 'light' | 'dark'

interface ThemeContextType {
  mode: ThemeMode
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

export const useTheme = () => {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}

interface ThemeProviderProps {
  children: React.ReactNode
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const [mode, setMode] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem('theme-mode')
    return (saved as ThemeMode) || 'light'
  })

  const toggleTheme = () => {
    setMode(prev => prev === 'light' ? 'dark' : 'light')
  }

  useEffect(() => {
    localStorage.setItem('theme-mode', mode)
    document.documentElement.setAttribute('data-theme', mode)
  }, [mode])

  const theme = createTheme({
    palette: {
      mode,
      primary: {
        main: mode === 'light' ? '#3f51b5' : '#9fa8da', // Enhanced indigo
        light: mode === 'light' ? '#7986cb' : '#536dfe',
        dark: mode === 'light' ? '#303f9f' : '#5c6bc0',
      },
      secondary: {
        main: mode === 'light' ? '#f50057' : '#ff4081', // Enhanced pink
        light: mode === 'light' ? '#ff4081' : '#f50057',
        dark: mode === 'light' ? '#c51162' : '#e040fb',
      },
      success: {
        main: mode === 'light' ? '#4caf50' : '#81c784',
        light: mode === 'light' ? '#81c784' : '#a5d6a7',
        dark: mode === 'light' ? '#388e3c' : '#66bb6a',
      },
      warning: {
        main: mode === 'light' ? '#ff9800' : '#ffb74d',
        light: mode === 'light' ? '#ffa726' : '#ffcc80',
        dark: mode === 'light' ? '#f57c00' : '#ff8a65',
      },
      error: {
        main: mode === 'light' ? '#f44336' : '#ef9a9a',
        light: mode === 'light' ? '#ef9a9a' : '#ffcdd2',
        dark: mode === 'light' ? '#d32f2f' : '#e57373',
      },
      info: {
        main: mode === 'light' ? '#2196f3' : '#64b5f6',
        light: mode === 'light' ? '#64b5f6' : '#90caf9',
        dark: mode === 'light' ? '#1976d2' : '#42a5f5',
      },
      background: {
        default: mode === 'light' ? '#f8f9fa' : '#121212', // Softer light background
        paper: mode === 'light' ? '#ffffff' : '#1e1e1e',
      },
      text: {
        primary: mode === 'light' ? 'rgba(0, 0, 0, 0.87)' : 'rgba(255, 255, 255, 0.87)',
        secondary: mode === 'light' ? 'rgba(0, 0, 0, 0.6)' : 'rgba(255, 255, 255, 0.6)',
      },
    },
    typography: {
      fontFamily: '"Inter", "Roboto", "Arial", sans-serif',
      h4: {
        fontWeight: 600,
        letterSpacing: '-0.02em',
      },
      h6: {
        fontWeight: 600,
      },
      button: {
        textTransform: 'none',
        fontWeight: 500,
      },
    },
    shape: {
      borderRadius: 12, // More rounded corners for modern look
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            scrollbarColor: mode === 'light' ? '#bfbfbf #f5f5f5' : '#6b6b6b #2b2b2b',
            '&::-webkit-scrollbar, & *::-webkit-scrollbar': {
              width: 8,
              height: 8,
            },
            '&::-webkit-scrollbar-thumb, & *::-webkit-scrollbar-thumb': {
              borderRadius: 8,
              backgroundColor: mode === 'light' ? '#bfbfbf' : '#6b6b6b',
              minHeight: 24,
            },
            '&::-webkit-scrollbar-track, & *::-webkit-scrollbar-track': {
              backgroundColor: mode === 'light' ? '#f5f5f5' : '#2b2b2b',
            },
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            backgroundImage: 'none',
            boxShadow: mode === 'light'
              ? '0px 2px 10px rgba(0, 0, 0, 0.08), 0px 1px 3px rgba(0, 0, 0, 0.04)'
              : '0px 2px 10px rgba(0, 0, 0, 0.2), 0px 1px 3px rgba(0, 0, 0, 0.1)',
            transition: 'box-shadow 0.3s ease',
            '&:hover': {
              boxShadow: mode === 'light'
                ? '0px 4px 16px rgba(0, 0, 0, 0.12), 0px 2px 6px rgba(0, 0, 0, 0.08)'
                : '0px 4px 16px rgba(0, 0, 0, 0.3), 0px 2px 6px rgba(0, 0, 0, 0.2)',
            },
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            fontWeight: 500,
            textTransform: 'none',
            padding: '8px 16px',
          },
          contained: {
            boxShadow: 'none',
            '&:hover': {
              boxShadow: 'none',
            },
          },
        },
      },
      MuiAppBar: {
        styleOverrides: {
          root: {
            boxShadow: 'none',
            borderBottom: `1px solid ${mode === 'light' ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.1)'}`,
          },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            borderRight: `1px solid ${mode === 'light' ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.1)'}`,
          },
        },
      },
    },
  })

  return (
    <ThemeContext.Provider value={{ mode, toggleTheme }}>
      <MuiThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </MuiThemeProvider>
    </ThemeContext.Provider>
  )
}