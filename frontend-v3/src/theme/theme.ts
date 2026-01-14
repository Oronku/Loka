import { createTheme, alpha } from '@mui/material/styles';

// Meet Loca V3 - Modern Design System
// Vibrant Blue & Orange Theme with Glass Morphism

const PRIMARY_BLUE = '#0EA5E9'; // Sky Blue 500
const PRIMARY_DARK = '#0284C7'; // Sky Blue 600
const ACCENT_ORANGE = '#F97316'; // Orange 500
const ACCENT_DARK = '#EA580C'; // Orange 600

const BACKGROUND_LIGHT = '#F8FAFC'; // Slate 50
const BACKGROUND_GRADIENT = 'linear-gradient(135deg, #F8FAFC 0%, #E0F2FE 50%, #E0E7FF 100%)';

const TEXT_PRIMARY = '#0F172A'; // Slate 900
const TEXT_SECONDARY = '#64748B'; // Slate 500

export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: PRIMARY_BLUE,
      light: '#38BDF8',
      dark: PRIMARY_DARK,
      contrastText: '#FFFFFF',
    },
    secondary: {
      main: ACCENT_ORANGE,
      light: '#FB923C',
      dark: ACCENT_DARK,
      contrastText: '#FFFFFF',
    },
    background: {
      default: BACKGROUND_LIGHT,
      paper: '#FFFFFF',
    },
    text: {
      primary: TEXT_PRIMARY,
      secondary: TEXT_SECONDARY,
    },
    success: {
      main: '#10B981',
      light: '#34D399',
      dark: '#059669',
    },
    error: {
      main: '#EF4444',
      light: '#F87171',
      dark: '#DC2626',
    },
    warning: {
      main: '#F59E0B',
      light: '#FBBF24',
      dark: '#D97706',
    },
    info: {
      main: PRIMARY_BLUE,
      light: '#38BDF8',
      dark: PRIMARY_DARK,
    },
  },
  typography: {
    fontFamily: [
      'Inter',
      'Poppins',
      '-apple-system',
      'BlinkMacSystemFont',
      'Segoe UI',
      'sans-serif',
    ].join(','),
    h1: {
      fontWeight: 800,
      fontSize: '3.5rem',
      letterSpacing: '-0.03em',
      lineHeight: 1.1,
    },
    h2: {
      fontWeight: 700,
      fontSize: '2.75rem',
      letterSpacing: '-0.02em',
      lineHeight: 1.2,
    },
    h3: {
      fontWeight: 700,
      fontSize: '2rem',
      letterSpacing: '-0.01em',
      lineHeight: 1.3,
    },
    h4: {
      fontWeight: 600,
      fontSize: '1.5rem',
      lineHeight: 1.4,
    },
    h5: {
      fontWeight: 600,
      fontSize: '1.25rem',
      lineHeight: 1.5,
    },
    h6: {
      fontWeight: 600,
      fontSize: '1.125rem',
      lineHeight: 1.5,
    },
    subtitle1: {
      fontWeight: 500,
      fontSize: '1rem',
      lineHeight: 1.6,
    },
    subtitle2: {
      fontWeight: 500,
      fontSize: '0.875rem',
      lineHeight: 1.6,
    },
    body1: {
      fontSize: '1rem',
      lineHeight: 1.7,
    },
    body2: {
      fontSize: '0.875rem',
      lineHeight: 1.6,
    },
    button: {
      fontWeight: 600,
      textTransform: 'none',
      letterSpacing: '0.02em',
    },
  },
  shape: {
    borderRadius: 16,
  },
  shadows: [
    'none',
    '0 1px 3px rgba(0, 0, 0, 0.05), 0 1px 2px rgba(0, 0, 0, 0.1)',
    '0 4px 6px rgba(0, 0, 0, 0.05), 0 2px 4px rgba(0, 0, 0, 0.06)',
    '0 10px 15px rgba(0, 0, 0, 0.1), 0 4px 6px rgba(0, 0, 0, 0.05)',
    '0 20px 25px rgba(0, 0, 0, 0.1), 0 10px 10px rgba(0, 0, 0, 0.04)',
    '0 25px 50px rgba(0, 0, 0, 0.15)',
    '0 25px 50px rgba(0, 0, 0, 0.15)',
    '0 25px 50px rgba(0, 0, 0, 0.15)',
    '0 25px 50px rgba(0, 0, 0, 0.15)',
    '0 25px 50px rgba(0, 0, 0, 0.15)',
    '0 25px 50px rgba(0, 0, 0, 0.15)',
    '0 25px 50px rgba(0, 0, 0, 0.15)',
    '0 25px 50px rgba(0, 0, 0, 0.15)',
    '0 25px 50px rgba(0, 0, 0, 0.15)',
    '0 25px 50px rgba(0, 0, 0, 0.15)',
    '0 25px 50px rgba(0, 0, 0, 0.15)',
    '0 25px 50px rgba(0, 0, 0, 0.15)',
    '0 25px 50px rgba(0, 0, 0, 0.15)',
    '0 25px 50px rgba(0, 0, 0, 0.15)',
    '0 25px 50px rgba(0, 0, 0, 0.15)',
    '0 25px 50px rgba(0, 0, 0, 0.15)',
    '0 25px 50px rgba(0, 0, 0, 0.15)',
    '0 25px 50px rgba(0, 0, 0, 0.15)',
    '0 25px 50px rgba(0, 0, 0, 0.15)',
    '0 25px 50px rgba(0, 0, 0, 0.15)',
  ],
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          background: BACKGROUND_GRADIENT,
          backgroundAttachment: 'fixed',
          scrollbarColor: `${PRIMARY_BLUE} transparent`,
          '&::-webkit-scrollbar, & *::-webkit-scrollbar': {
            backgroundColor: 'transparent',
            width: '10px',
            height: '10px',
          },
          '&::-webkit-scrollbar-thumb, & *::-webkit-scrollbar-thumb': {
            borderRadius: 10,
            backgroundColor: alpha(PRIMARY_BLUE, 0.3),
            minHeight: 24,
            '&:hover': {
              backgroundColor: alpha(PRIMARY_BLUE, 0.5),
            },
          },
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          padding: '12px 24px',
          fontWeight: 600,
          textTransform: 'none',
          boxShadow: 'none',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          '&:hover': {
            boxShadow: '0 10px 20px rgba(14, 165, 233, 0.2)',
            transform: 'translateY(-2px)',
          },
        },
        containedPrimary: {
          background: `linear-gradient(135deg, ${PRIMARY_BLUE} 0%, ${PRIMARY_DARK} 100%)`,
          '&:hover': {
            background: `linear-gradient(135deg, ${PRIMARY_DARK} 0%, #0369A1 100%)`,
          },
        },
        containedSecondary: {
          background: `linear-gradient(135deg, ${ACCENT_ORANGE} 0%, ${ACCENT_DARK} 100%)`,
          '&:hover': {
            background: `linear-gradient(135deg, ${ACCENT_DARK} 0%, #C2410C 100%)`,
          },
        },
        sizeLarge: {
          padding: '14px 32px',
          fontSize: '1rem',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 20,
          background: 'rgba(255, 255, 255, 0.9)',
          backdropFilter: 'blur(20px)',
          border: `1px solid ${alpha('#FFFFFF', 0.2)}`,
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.08)',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          '&:hover': {
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.12)',
            transform: 'translateY(-4px)',
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          borderRadius: 20,
        },
        elevation1: {
          background: 'rgba(255, 255, 255, 0.9)',
          backdropFilter: 'blur(20px)',
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)',
        },
        elevation2: {
          background: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(20px)',
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.1)',
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          background: 'rgba(255, 255, 255, 0.9)',
          backdropFilter: 'blur(20px)',
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)',
          borderBottom: `1px solid ${alpha(PRIMARY_BLUE, 0.1)}`,
          color: TEXT_PRIMARY,
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          fontWeight: 500,
          padding: '4px 12px',
        },
        filled: {
          background: `linear-gradient(135deg, ${alpha(PRIMARY_BLUE, 0.1)} 0%, ${alpha(PRIMARY_BLUE, 0.15)} 100%)`,
          color: PRIMARY_DARK,
          border: `1px solid ${alpha(PRIMARY_BLUE, 0.2)}`,
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 12,
            background: 'rgba(255, 255, 255, 0.8)',
            backdropFilter: 'blur(10px)',
            transition: 'all 0.3s ease',
            '& fieldset': {
              borderColor: alpha(TEXT_SECONDARY, 0.2),
              borderWidth: 2,
            },
            '&:hover fieldset': {
              borderColor: alpha(PRIMARY_BLUE, 0.4),
            },
            '&.Mui-focused fieldset': {
              borderColor: PRIMARY_BLUE,
              borderWidth: 2,
            },
          },
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 24,
          background: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(30px)',
          boxShadow: '0 25px 50px rgba(0, 0, 0, 0.15)',
        },
      },
    },
  },
});

export default theme;
