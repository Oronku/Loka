import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import App from './App';
import './index.css';
import baseTheme from './theme/theme';
import { LanguageProvider, useLanguage } from './context/LanguageContext';

function ThemedApp() {
  const { isRTL } = useLanguage();

  // Create theme with RTL support
  const theme = createTheme({
    ...baseTheme,
    direction: isRTL ? 'rtl' : 'ltr',
  });

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ThemeProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LanguageProvider>
      <ThemedApp />
    </LanguageProvider>
  </StrictMode>
);
