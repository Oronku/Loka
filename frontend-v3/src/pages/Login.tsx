import {
  Box,
  Card,
  CardContent,
  Typography,
  Container,
  TextField,
  Button,
  Divider,
  Alert,
  Tabs,
  Tab,
} from '@mui/material';
import { GoogleLogin } from '@react-oauth/google';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useLanguage } from '../context/LanguageContext';
import AnimatedLogo from '../components/AnimatedLogo';

export default function Login() {
  const { login, loginWithEmail, register, isAuthenticated, error } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState(0);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/');
    }
  }, [isAuthenticated, navigate]);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setLocalError(null);
    try {
      await loginWithEmail(email, password);
    } catch (err: any) {
      setLocalError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setLocalError(null);
    try {
      await register(email, password, name);
    } catch (err: any) {
      setLocalError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #F8FAFC 0%, #E0F2FE 30%, #DBEAFE 60%, #E0E7FF 100%)',
        backgroundAttachment: 'fixed',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        py: 4,
        position: 'relative',
        '&::before': {
          content: '""',
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'radial-gradient(circle at 20% 30%, rgba(14, 165, 233, 0.1) 0%, transparent 50%), radial-gradient(circle at 80% 70%, rgba(249, 115, 22, 0.1) 0%, transparent 50%)',
        },
      }}
    >
      <Container maxWidth="sm">
        <Card
          sx={{
            width: '100%',
            borderRadius: 5,
            boxShadow: '0 24px 80px rgba(14, 165, 233, 0.15)',
            background: 'linear-gradient(to bottom, rgba(255, 255, 255, 0.98) 0%, rgba(255, 255, 255, 0.95) 100%)',
            backdropFilter: 'blur(30px) saturate(180%)',
            border: '1px solid rgba(255, 255, 255, 0.5)',
            position: 'relative',
            overflow: 'hidden',
            '&::before': {
              content: '""',
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 4,
              background: 'linear-gradient(90deg, #0EA5E9 0%, #3B82F6 50%, #F97316 100%)',
            },
          }}
        >
          <CardContent sx={{ p: 4 }}>
            <Box 
              sx={{ 
                mb: 3, 
                textAlign: 'center',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <AnimatedLogo width="clamp(140px, 25vw, 220px)" />
              <Typography
                variant="h4"
                gutterBottom
                fontWeight={800}
                sx={{
                  mt: 2,
                  background: 'linear-gradient(135deg, #0EA5E9 0%, #F97316 100%)',
                  backgroundClip: 'text',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                Meet Loca
              </Typography>
              <Typography
                fontWeight={900}
                variant="body1"
                color="text.secondary"
                gutterBottom
              >
                {t('planYourNextTrip')}
              </Typography>
            </Box>

            {(error || localError) && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error || localError}
              </Alert>
            )}

            <Tabs
              value={activeTab}
              onChange={(_, v) => setActiveTab(v)}
              centered
              sx={{ 
                mb: 4,
                '& .MuiTab-root': {
                  textTransform: 'none',
                  fontSize: '1rem',
                  fontWeight: 600,
                  minHeight: 56,
                  px: 4,
                  transition: 'all 0.3s ease',
                  '&.Mui-selected': {
                    color: 'primary.main',
                    fontWeight: 700,
                  },
                },
                '& .MuiTabs-indicator': {
                  height: 3,
                  borderRadius: '3px 3px 0 0',
                  background: 'linear-gradient(90deg, #0EA5E9 0%, #3B82F6 100%)',
                },
              }}
            >
              <Tab label={t('login')} />
              <Tab label={t('register')} />
            </Tabs>

            {activeTab === 0 && (
              <Box component="form" onSubmit={handleEmailLogin}>
                <TextField
                  fullWidth
                  label={t('email')}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  margin="normal"
                  required
                  sx={{
                    mb: 2,
                    '& .MuiOutlinedInput-root': {
                      borderRadius: 2,
                      transition: 'all 0.3s ease',
                      '&:hover': {
                        transform: 'translateY(-2px)',
                        boxShadow: '0 4px 12px rgba(14, 165, 233, 0.1)',
                      },
                    },
                  }}
                />
                <TextField
                  fullWidth
                  label={t('password')}
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  margin="normal"
                  required
                  sx={{
                    mb: 3,
                    '& .MuiOutlinedInput-root': {
                      borderRadius: 2,
                      transition: 'all 0.3s ease',
                      '&:hover': {
                        transform: 'translateY(-2px)',
                        boxShadow: '0 4px 12px rgba(14, 165, 233, 0.1)',
                      },
                    },
                  }}
                />
                <Button
                  fullWidth
                  variant="contained"
                  type="submit"
                  size="large"
                  disabled={loading}
                  sx={{ 
                    mt: 1,
                    mb: 2,
                    py: 1.5,
                    borderRadius: 2.5,
                    fontSize: '1.1rem',
                    fontWeight: 700,
                    textTransform: 'none',
                    background: 'linear-gradient(135deg, #0EA5E9 0%, #3B82F6 100%)',
                    boxShadow: '0 8px 24px rgba(14, 165, 233, 0.3)',
                    '&:hover': {
                      background: 'linear-gradient(135deg, #0284C7 0%, #2563EB 100%)',
                      transform: 'translateY(-2px)',
                      boxShadow: '0 12px 32px rgba(14, 165, 233, 0.4)',
                    },
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  }}
                >
                  {loading ? t('signingIn') : t('signIn')}
                </Button>
              </Box>
            )}

            {activeTab === 1 && (
              <Box component="form" onSubmit={handleRegister}>
                <TextField
                  fullWidth
                  label={t('name')}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  margin="normal"
                  required
                  sx={{
                    mb: 2,
                    '& .MuiOutlinedInput-root': {
                      borderRadius: 2,
                      transition: 'all 0.3s ease',
                      '&:hover': {
                        transform: 'translateY(-2px)',
                        boxShadow: '0 4px 12px rgba(14, 165, 233, 0.1)',
                      },
                    },
                  }}
                />
                <TextField
                  fullWidth
                  label={t('email')}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  margin="normal"
                  required
                  sx={{
                    mb: 2,
                    '& .MuiOutlinedInput-root': {
                      borderRadius: 2,
                      transition: 'all 0.3s ease',
                      '&:hover': {
                        transform: 'translateY(-2px)',
                        boxShadow: '0 4px 12px rgba(14, 165, 233, 0.1)',
                      },
                    },
                  }}
                />
                <TextField
                  fullWidth
                  label={t('password')}
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  margin="normal"
                  required
                  helperText={t('minimumCharacters')}
                  sx={{
                    mb: 3,
                    '& .MuiOutlinedInput-root': {
                      borderRadius: 2,
                      transition: 'all 0.3s ease',
                      '&:hover': {
                        transform: 'translateY(-2px)',
                        boxShadow: '0 4px 12px rgba(14, 165, 233, 0.1)',
                      },
                    },
                  }}
                />
                <Button
                  fullWidth
                  variant="contained"
                  type="submit"
                  size="large"
                  disabled={loading}
                  sx={{ 
                    mt: 1,
                    mb: 2,
                    py: 1.5,
                    borderRadius: 2.5,
                    fontSize: '1.1rem',
                    fontWeight: 700,
                    textTransform: 'none',
                    background: 'linear-gradient(135deg, #0EA5E9 0%, #3B82F6 100%)',
                    boxShadow: '0 8px 24px rgba(14, 165, 233, 0.3)',
                    '&:hover': {
                      background: 'linear-gradient(135deg, #0284C7 0%, #2563EB 100%)',
                      transform: 'translateY(-2px)',
                      boxShadow: '0 12px 32px rgba(14, 165, 233, 0.4)',
                    },
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  }}
                >
                  {loading ? t('creatingAccount') : t('createAccount')}
                </Button>
              </Box>
            )}

            <Divider sx={{ my: 4 }}>
              <Typography variant="body2" color="text.secondary" sx={{ px: 2 }}>
                {t('or')}
              </Typography>
            </Divider>

            <Box sx={{ display: 'flex', justifyContent: 'center' }}>
              <GoogleLogin
                onSuccess={login}
                onError={() => {
                  setLocalError(t('googleLoginFailed'));
                }}
              />
            </Box>

            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ mt: 3, display: 'block', textAlign: 'center' }}
            >
              {t('bySigningIn')} {t('termsOfService')} {t('and')} {t('privacyPolicy')}
            </Typography>
          </CardContent>
        </Card>
      </Container>
    </Box>
  );
}
