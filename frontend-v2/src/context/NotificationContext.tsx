import React, { createContext, useContext, useState, useCallback } from 'react';
import { Snackbar, Alert, AlertColor, Slide, SlideProps } from '@mui/material';
import { useLanguage } from './LanguageContext';

interface Notification {
  id: string;
  message: string;
  type: AlertColor;
  duration?: number;
}

interface NotificationContextType {
  showNotification: (
    message: string,
    type?: AlertColor,
    duration?: number
  ) => void;
  showSuccess: (message: string, duration?: number) => void;
  showError: (message: string, duration?: number) => void;
  showWarning: (message: string, duration?: number) => void;
  showInfo: (message: string, duration?: number) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(
  undefined
);

function SlideTransition(props: SlideProps) {
  return <Slide {...props} direction="down" />;
}

export function NotificationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isRTL } = useLanguage();
  const [notification, setNotification] = useState<Notification | null>(null);

  const showNotification = useCallback(
    (message: string, type: AlertColor = 'info', duration: number = 4000) => {
      const id = Date.now().toString();
      setNotification({ id, message, type, duration });
    },
    []
  );

  const showSuccess = useCallback(
    (message: string, duration?: number) => {
      showNotification(message, 'success', duration);
    },
    [showNotification]
  );

  const showError = useCallback(
    (message: string, duration?: number) => {
      showNotification(message, 'error', duration);
    },
    [showNotification]
  );

  const showWarning = useCallback(
    (message: string, duration?: number) => {
      showNotification(message, 'warning', duration);
    },
    [showNotification]
  );

  const showInfo = useCallback(
    (message: string, duration?: number) => {
      showNotification(message, 'info', duration);
    },
    [showNotification]
  );

  const handleClose = (
    event?: React.SyntheticEvent | Event,
    reason?: string
  ) => {
    if (reason === 'clickaway') {
      return;
    }
    setNotification(null);
  };

  return (
    <NotificationContext.Provider
      value={{
        showNotification,
        showSuccess,
        showError,
        showWarning,
        showInfo,
      }}
    >
      {children}
      <Snackbar
        open={!!notification}
        autoHideDuration={notification?.duration || 4000}
        onClose={handleClose}
        anchorOrigin={{
          vertical: 'top',
          horizontal: 'center',
        }}
        TransitionComponent={SlideTransition}
        sx={{
          top: { xs: 16, sm: 24 },
          left: isRTL ? 'auto' : undefined,
          right: isRTL ? undefined : 'auto',
        }}
      >
        <Alert
          onClose={handleClose}
          severity={notification?.type || 'info'}
          variant="filled"
          elevation={6}
          sx={{
            width: '100%',
            minWidth: { xs: 280, sm: 400 },
            borderRadius: 3,
            fontWeight: 600,
            fontSize: '0.95rem',
            boxShadow: 4,
            '& .MuiAlert-icon': {
              fontSize: 28,
            },
          }}
        >
          {notification?.message}
        </Alert>
      </Snackbar>
    </NotificationContext.Provider>
  );
}

export function useNotification() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within NotificationProvider');
  }
  return context;
}
