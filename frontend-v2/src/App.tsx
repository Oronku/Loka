import { Routes, Route } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { AuthProvider } from './context/AuthContext';
import { Layout } from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import Home from './pages/Home';
import NewTripWizard from './pages/NewTripWizard';
import TripDetails from './pages/TripDetails';
import Login from './pages/Login';
import Quicket from './pages/Quicket';
import QuicketItemDetail from './pages/QuicketItemDetail';
import ProfileSettings from './pages/ProfileSettings';
import Friends from './pages/Friends';

// Read Google OAuth client ID from environment for flexibility across dev/staging/prod
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

if (!GOOGLE_CLIENT_ID) {
  // The client ID is public, but missing it will disable Google sign-in flows.
  // Keep this warning to help developers configure their local env.
  // Set VITE_GOOGLE_CLIENT_ID in `.env.local` (do not commit secrets) or in CI.
  // Example: VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
  // This mirrors how VITE_GOOGLE_MAPS_API_KEY is consumed in `src/services/api.ts`.
  // eslint-disable-next-line no-console
  console.warn(
    'VITE_GOOGLE_CLIENT_ID is not set. Google OAuth sign-in will not work until configured.'
  );
}

export default function App() {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout>
                  <Home />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/trip/new"
            element={
              <ProtectedRoute>
                <Layout>
                  <NewTripWizard />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/trips/:id"
            element={
              <ProtectedRoute>
                <Layout>
                  <TripDetails />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/quicket"
            element={
              <ProtectedRoute>
                <Layout>
                  <Quicket />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/quicket/item/:id"
            element={
              <ProtectedRoute>
                <Layout>
                  <QuicketItemDetail />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <Layout>
                  <ProfileSettings />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/friends"
            element={
              <ProtectedRoute>
                <Layout>
                  <Friends
                    onStartChat={(friendId) => {
                      // This will be handled by the Layout's chat system
                      console.log('Starting chat with friend:', friendId);
                    }}
                  />
                </Layout>
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </GoogleOAuthProvider>
  );
}
