import { createTheme, alpha } from '@mui/material/styles';

// MeetLoca Professional Design - Clean Blue Theme
const LOKA_PRIMARY = '#1976D2'; // Professional Blue
const LOKA_SECONDARY = '#42A5F5'; // Light Blue accent
const LOKA_ACCENT = '#FF6B6B'; // Coral for important actions
const LOKA_BLACK = '#1A1A1A';
const LOKA_WHITE = '#FFFFFF';
const LOKA_BG = '#F8FAFC'; // Very light gray-blue background
const LOKA_GRAY = '#64748B'; // Modern gray for secondary text

export const theme = createTheme({
  palette: {
    primary: {
      main: LOKA_PRIMARY,
      light: '#42A5F5',
      dark: '#1565C0',
      contrastText: '#FFFFFF',
    },
    secondary: {
      main: LOKA_SECONDARY,
      light: '#64B5F6',
      dark: '#1976D2',
      contrastText: '#FFFFFF',
    },
    background: {
      default: LOKA_BG,
      paper: LOKA_WHITE,
    },
    text: {
      primary: LOKA_BLACK,
      secondary: LOKA_GRAY,
    },
    success: {
      main: '#10B981',
    },
    error: {
      main: '#EF4444',
    },
    warning: {
      main: '#F59E0B',
    },
    info: {
      main: LOKA_SECONDARY,
    },
  },
  typography: {
    fontFamily: [
      'Inter',
      'Roboto',
      '-apple-system',
      'BlinkMacSystemFont',
      'Segoe UI',
      'sans-serif',
    ].join(','),
    h1: { fontWeight: 700, fontSize: '3rem', letterSpacing: '-0.02em' },
    h2: { fontWeight: 700, fontSize: '2.25rem', letterSpacing: '-0.01em' },
    h3: { fontWeight: 600, fontSize: '1.875rem' },
    h4: { fontWeight: 600, fontSize: '1.5rem' },
    h5: { fontWeight: 600, fontSize: '1.25rem' },
    h6: { fontWeight: 600, fontSize: '1.125rem' },
    subtitle1: { fontWeight: 500, fontSize: '1rem', lineHeight: 1.6 },
    subtitle2: { fontWeight: 500, fontSize: '0.875rem', lineHeight: 1.6 },
    body1: { fontSize: '1rem', lineHeight: 1.6 },
    body2: { fontSize: '0.875rem', lineHeight: 1.6 },
    button: { fontWeight: 600, textTransform: 'none', letterSpacing: '0.02em' },
  },
  shape: {
    borderRadius: 12,
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          scrollbarColor: `${LOKA_PRIMARY} transparent`,
          '&::-webkit-scrollbar, & *::-webkit-scrollbar': {
            backgroundColor: 'transparent',
            width: '8px',
            height: '8px',
          },
          '&::-webkit-scrollbar-thumb, & *::-webkit-scrollbar-thumb': {
            borderRadius: 8,
            backgroundColor: alpha(LOKA_PRIMARY, 0.3),
            minHeight: 24,
          },
          '&::-webkit-scrollbar-thumb:focus, & *::-webkit-scrollbar-thumb:focus':
            {
              backgroundColor: alpha(LOKA_PRIMARY, 0.5),
            },
          '&::-webkit-scrollbar-thumb:active, & *::-webkit-scrollbar-thumb:active':
            {
              backgroundColor: alpha(LOKA_PRIMARY, 0.5),
            },
          '&::-webkit-scrollbar-thumb:hover, & *::-webkit-scrollbar-thumb:hover':
            {
              backgroundColor: alpha(LOKA_PRIMARY, 0.5),
            },
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          padding: '10px 20px',
          boxShadow: 'none',
          fontWeight: 600,
          '&:hover': {
            boxShadow: '0 4px 12px rgba(25, 118, 210, 0.15)',
            transform: 'translateY(-1px)',
          },
          transition: 'all 0.2s ease-in-out',
        },
        containedPrimary: {
          background: LOKA_PRIMARY,
          '&:hover': {
            background: '#1565C0',
          },
        },
        sizeLarge: {
          padding: '12px 28px',
          fontSize: '1rem',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          boxShadow:
            '0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.06)',
          backgroundImage: 'none',
          border: `1px solid ${alpha(LOKA_GRAY, 0.1)}`,
          '&:hover': {
            boxShadow:
              '0 4px 6px rgba(0, 0, 0, 0.07), 0 2px 4px rgba(0, 0, 0, 0.05)',
          },
          transition: 'box-shadow 0.2s ease-in-out',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
        elevation1: {
          boxShadow:
            '0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.06)',
        },
        elevation2: {
          boxShadow:
            '0 4px 6px rgba(0, 0, 0, 0.07), 0 2px 4px rgba(0, 0, 0, 0.05)',
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          background: LOKA_WHITE,
          backdropFilter: 'blur(10px)',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.08)',
          color: LOKA_BLACK,
          borderBottom: `1px solid ${alpha(LOKA_GRAY, 0.1)}`,
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          fontWeight: 500,
        },
        filled: {
          backgroundColor: alpha(LOKA_PRIMARY, 0.1),
          color: LOKA_PRIMARY,
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 8,
            backgroundColor: LOKA_WHITE,
            '& fieldset': {
              borderColor: alpha(LOKA_GRAY, 0.2),
            },
            '&:hover fieldset': {
              borderColor: alpha(LOKA_PRIMARY, 0.5),
            },
            '&.Mui-focused fieldset': {
              borderColor: LOKA_PRIMARY,
              borderWidth: 2,
            },
          },
        },
      },
    },
  },
});

export default theme;
