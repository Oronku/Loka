import { Routes, Route } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { AuthProvider } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';
import ErrorBoundary from './components/ErrorBoundary';
import { Layout } from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import AdminRoute from './components/AdminRoute';
import AgentRoute from './components/AgentRoute';
import Home from './pages/Home';
import NewTripWizard from './pages/NewTripWizard';
import SimpleCreateTrip from './pages/SimpleCreateTrip';
import TripDetails from './pages/TripDetails';
import Login from './pages/Login';
import Quicket from './pages/Quicket';
import QuicketItemDetail from './pages/QuicketItemDetail';
import ProfileSettings from './pages/ProfileSettings';
import Friends from './pages/Friends';
import CheckIn from './pages/CheckIn';
import AdminDashboard from './pages/AdminDashboard';
import AgentDashboard from './pages/AgentDashboard';
import AgencyDashboard from './pages/AgencyDashboard';
import CreateOrganizedTrip from './pages/CreateOrganizedTrip';
import ManageOrganizedTrip from './pages/ManageOrganizedTrip';
import PublicTripsPage from './pages/PublicTripsPage';
import PublicTripView from './pages/PublicTripView';
import ParticipantDashboard from './pages/ParticipantDashboard';
import { useLanguage } from './context/LanguageContext';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

if (!GOOGLE_CLIENT_ID) {
  console.warn(
    'VITE_GOOGLE_CLIENT_ID is not set. Google OAuth sign-in will not work until configured.'
  );
}

function AppRoutes() {
  const { language } = useLanguage();

  return (
    <ErrorBoundary language={language}>
      <NotificationProvider>
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
                  <SimpleCreateTrip />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/trip/new/wizard"
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
                      console.log('Starting chat with friend:', friendId);
                    }}
                  />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/check-in"
            element={
              <ProtectedRoute>
                <Layout>
                  <CheckIn />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <AdminRoute>
                <Layout>
                  <AdminDashboard />
                </Layout>
              </AdminRoute>
            }
          />
          <Route
            path="/agent"
            element={
              <AgentRoute>
                <Layout>
                  <AgentDashboard />
                </Layout>
              </AgentRoute>
            }
          />
          <Route
            path="/agency"
            element={
              <AgentRoute>
                <Layout>
                  <AgencyDashboard />
                </Layout>
              </AgentRoute>
            }
          />
          <Route
            path="/agency/trips/new"
            element={
              <AgentRoute>
                <Layout>
                  <CreateOrganizedTrip />
                </Layout>
              </AgentRoute>
            }
          />
          <Route
            path="/agent/trips/:tripId"
            element={
              <AgentRoute>
                <Layout>
                  <ManageOrganizedTrip />
                </Layout>
              </AgentRoute>
            }
          />
          <Route
            path="/organized-trips"
            element={
              <Layout>
                <PublicTripsPage />
              </Layout>
            }
          />
          <Route
            path="/organized-trips/:tripId"
            element={
              <Layout>
                <PublicTripView />
              </Layout>
            }
          />
          <Route
            path="/my-trips"
            element={
              <Layout>
                <ParticipantDashboard />
              </Layout>
            }
          />
        </Routes>
      </NotificationProvider>
    </ErrorBoundary>
  );
}

export default function App() {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </GoogleOAuthProvider>
  );
}
