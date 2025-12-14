import { createTheme, alpha } from '@mui/material/styles';

// Loka design tokens
const LOKA_PRIMARY = '#009D85';
const LOKA_SECONDARY = '#FF7D54'; // Coral accent for contrast
const LOKA_BLACK = '#001A16';
const LOKA_WHITE = '#FFFFFF';
const LOKA_BG = '#F8FDfc'; // Slightly more neutral mint-white

export const theme = createTheme({
  palette: {
    primary: {
      main: LOKA_PRIMARY,
      light: '#33B09D',
      dark: '#006E5D',
      contrastText: '#FFFFFF',
    },
    secondary: {
      main: LOKA_SECONDARY,
      light: '#FF9776',
      dark: '#E65A2E',
      contrastText: '#FFFFFF',
    },
    background: {
      default: LOKA_BG,
      paper: LOKA_WHITE,
    },
    text: {
      primary: LOKA_BLACK,
      secondary: alpha(LOKA_BLACK, 0.6),
    },
    success: {
      main: '#00C853',
    },
    error: {
      main: '#FF3D00',
    },
  },
  typography: {
    fontFamily: [
      'Nunito',
      'Varela Round',
      '-apple-system',
      'BlinkMacSystemFont',
      'sans-serif',
    ].join(','),
    h1: { fontWeight: 800, fontSize: '3.5rem' },
    h2: { fontWeight: 800, fontSize: '2.5rem' },
    h3: { fontWeight: 800, fontSize: '2rem' },
    h4: { fontWeight: 700, fontSize: '1.75rem' },
    h5: { fontWeight: 700, fontSize: '1.5rem' },
    h6: { fontWeight: 700, fontSize: '1.25rem' },
    subtitle1: { fontWeight: 600 },
    button: { fontWeight: 700, textTransform: 'none' },
  },
  shape: {
    borderRadius: 16,
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
          borderRadius: 50, // Pill shape
          padding: '10px 24px',
          boxShadow: 'none',
          '&:hover': {
            boxShadow: '0 4px 12px rgba(0, 157, 133, 0.2)',
            transform: 'translateY(-1px)',
          },
          transition: 'all 0.2s ease-in-out',
        },
        containedPrimary: {
          background: `linear-gradient(45deg, ${LOKA_PRIMARY}, #00BFA5)`,
        },
        sizeLarge: {
          padding: '12px 32px',
          fontSize: '1.1rem',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 24,
          boxShadow: '0 8px 24px rgba(0, 26, 22, 0.06)',
          backgroundImage: 'none',
          overflow: 'visible', // For hover effects that might pop out
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
        elevation1: {
          boxShadow: '0 4px 20px rgba(0, 26, 22, 0.05)',
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          background: alpha(LOKA_WHITE, 0.8),
          backdropFilter: 'blur(12px)',
          boxShadow: '0 1px 0 rgba(0,0,0,0.05)',
          color: LOKA_BLACK,
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          fontWeight: 600,
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
            borderRadius: 16,
            backgroundColor: alpha(LOKA_PRIMARY, 0.02),
            '& fieldset': {
              borderColor: alpha(LOKA_BLACK, 0.1),
            },
            '&:hover fieldset': {
              borderColor: LOKA_PRIMARY,
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
