import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Container,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Stack,
  Alert,
  CircularProgress,
  Divider,
  MenuItem,
  Avatar,
  IconButton,
} from '@mui/material';
import { ArrowBack, Save, Lock } from '@mui/icons-material';
import { useAuth } from '../context/AuthContext';
import {
  getUserProfile,
  updateUserProfile,
  changePassword,
  type User,
} from '../services/api';

const CURRENCIES = [
  { code: 'USD', name: 'US Dollar ($)', symbol: '$' },
  { code: 'EUR', name: 'Euro (€)', symbol: '€' },
  { code: 'GBP', name: 'British Pound (£)', symbol: '£' },
  { code: 'JPY', name: 'Japanese Yen (¥)', symbol: '¥' },
  { code: 'CNY', name: 'Chinese Yuan (¥)', symbol: '¥' },
  { code: 'ILS', name: 'Israeli Shekel (₪)', symbol: '₪' },
  { code: 'CAD', name: 'Canadian Dollar ($)', symbol: '$' },
  { code: 'AUD', name: 'Australian Dollar ($)', symbol: '$' },
  { code: 'CHF', name: 'Swiss Franc (Fr)', symbol: 'Fr' },
  { code: 'INR', name: 'Indian Rupee (₹)', symbol: '₹' },
];

export default function ProfileSettings() {
  const navigate = useNavigate();
  const { user: authUser, logout, updateUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Profile form
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [preferredCurrency, setPreferredCurrency] = useState('USD');
  const [provider, setProvider] = useState('');

  // Password form
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      setLoading(true);
      setError(null);
      const profile = await getUserProfile();
      setName(profile.name || '');
      setEmail(profile.email || '');
      setPreferredCurrency(profile.preferredCurrency || 'USD');
      setProvider(profile.provider || 'email');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProfile = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      const updatedUser = await updateUserProfile({
        name,
        preferredCurrency,
      });

      // Update the auth context with the new user data
      updateUser({
        name: updatedUser.name,
        preferredCurrency: updatedUser.preferredCurrency,
      });

      setSuccess('Profile updated successfully!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    try {
      setPasswordError(null);
      setPasswordSuccess(null);

      // Validation
      if (!currentPassword || !newPassword || !confirmPassword) {
        setPasswordError('All password fields are required');
        return;
      }

      if (newPassword.length < 6) {
        setPasswordError('New password must be at least 6 characters');
        return;
      }

      if (newPassword !== confirmPassword) {
        setPasswordError('New passwords do not match');
        return;
      }

      setChangingPassword(true);
      await changePassword(currentPassword, newPassword);

      setPasswordSuccess('Password changed successfully!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setPasswordSuccess(null), 3000);
    } catch (err: any) {
      setPasswordError(
        err.response?.data?.error || 'Failed to change password'
      );
    } finally {
      setChangingPassword(false);
    }
  };

  if (loading) {
    return (
      <Container maxWidth="md">
        <Box display="flex" justifyContent="center" py={8}>
          <CircularProgress />
        </Box>
      </Container>
    );
  }

  return (
    <Container maxWidth="md">
      <Box py={4}>
        <Button
          startIcon={<ArrowBack />}
          onClick={() => navigate(-1)}
          sx={{ mb: 3 }}
        >
          Back
        </Button>

        <Typography variant="h4" fontWeight="bold" gutterBottom>
          Profile Settings
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {error}
          </Alert>
        )}

        {success && (
          <Alert severity="success" sx={{ mb: 3 }}>
            {success}
          </Alert>
        )}

        {/* Profile Information */}
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Stack direction="row" alignItems="center" spacing={2} mb={3}>
              <Avatar
                src={authUser?.picture}
                alt={name}
                sx={{ width: 64, height: 64 }}
              >
                {name.charAt(0).toUpperCase()}
              </Avatar>
              <Box>
                <Typography variant="h6">{name}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {email}
                </Typography>
                {provider === 'google' && (
                  <Typography variant="caption" color="primary">
                    Signed in with Google
                  </Typography>
                )}
              </Box>
            </Stack>

            <Divider sx={{ mb: 3 }} />

            <Stack spacing={3}>
              <TextField
                label="Full Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                fullWidth
                required
              />

              <TextField
                label="Email"
                value={email}
                fullWidth
                disabled
                helperText="Email cannot be changed"
              />

              <TextField
                select
                label="Preferred Currency"
                value={preferredCurrency}
                onChange={(e) => setPreferredCurrency(e.target.value)}
                fullWidth
                helperText="Currency used for price display in Quicket marketplace"
              >
                {CURRENCIES.map((currency) => (
                  <MenuItem key={currency.code} value={currency.code}>
                    {currency.name}
                  </MenuItem>
                ))}
              </TextField>

              <Button
                variant="contained"
                size="large"
                startIcon={<Save />}
                onClick={handleSaveProfile}
                disabled={saving || !name}
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
            </Stack>
          </CardContent>
        </Card>

        {/* Change Password - Only for email users */}
        {provider === 'email' && (
          <Card>
            <CardContent>
              <Stack direction="row" alignItems="center" spacing={1} mb={3}>
                <Lock />
                <Typography variant="h6">Change Password</Typography>
              </Stack>

              {passwordError && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {passwordError}
                </Alert>
              )}

              {passwordSuccess && (
                <Alert severity="success" sx={{ mb: 2 }}>
                  {passwordSuccess}
                </Alert>
              )}

              <Stack spacing={3}>
                <TextField
                  type="password"
                  label="Current Password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  fullWidth
                />

                <TextField
                  type="password"
                  label="New Password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  fullWidth
                  helperText="Must be at least 6 characters"
                />

                <TextField
                  type="password"
                  label="Confirm New Password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  fullWidth
                />

                <Button
                  variant="outlined"
                  size="large"
                  startIcon={<Lock />}
                  onClick={handleChangePassword}
                  disabled={changingPassword}
                >
                  {changingPassword ? 'Changing...' : 'Change Password'}
                </Button>
              </Stack>
            </CardContent>
          </Card>
        )}
      </Box>
    </Container>
  );
}
