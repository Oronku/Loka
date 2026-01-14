import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ReactNode } from 'react';
import { Box, Alert, Container } from '@mui/material';

interface AgentRouteProps {
  children: ReactNode;
}

export default function AgentRoute({ children }: AgentRouteProps) {
  const { isAuthenticated, user } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (!user?.isAgent && !user?.isAdmin) {
    return (
      <Container maxWidth="sm" sx={{ mt: 8 }}>
        <Alert severity="error">
          🔒 Access Denied - Travel Agent privileges required
        </Alert>
      </Container>
    );
  }

  return <>{children}</>;
}
