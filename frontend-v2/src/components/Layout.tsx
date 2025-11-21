import { Link, NavLink, useNavigate } from 'react-router-dom';
import {
  AppBar,
  Toolbar,
  Typography,
  Button,
  Container,
  Box,
  Chip,
  Avatar,
  IconButton,
  Menu,
  MenuItem,
  useMediaQuery,
  Divider,
} from '@mui/material';
import {
  Flight,
  Dashboard,
  Logout,
  Menu as MenuIcon,
  LocalOffer,
} from '@mui/icons-material';
import { useTheme } from '@mui/material/styles';
import { useAuth } from '../context/AuthContext';
import { useState } from 'react';
import CloudsBackground from './CloudsBackground';
import logo from '../svgs/logo.svg';

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [navMenuEl, setNavMenuEl] = useState<null | HTMLElement>(null);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleNavMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setNavMenuEl(event.currentTarget);
  };

  const handleNavMenuClose = () => {
    setNavMenuEl(null);
  };

  const goTo = (path: string) => {
    navigate(path);
    handleNavMenuClose();
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
    handleMenuClose();
  };

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
      }}
    >
      {/* Cloud background sits behind the whole layout. You can tweak count/opacity here. */}
      <CloudsBackground count={200} />
      <AppBar
        position="static"
        elevation={0}
        sx={{ bgcolor: 'common.white', color: 'text.primary' }}
      >
        <Toolbar sx={{ gap: { xs: 1, sm: 2 } }}>
          <Typography
            variant="h6"
            component={Link}
            to="/"
            sx={{
              flexGrow: 0,
              mr: 4,
              textDecoration: 'none',
              color: 'primary.main',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <img
              src={logo}
              alt="Loka Logo"
              style={{ height: 40, marginRight: 16 }}
            />
            Meet Loka
          </Typography>
          {isMobile ? (
            <>
              <IconButton
                edge="start"
                onClick={handleNavMenuOpen}
                aria-label="Open navigation"
                sx={{ ml: 'auto' }}
              >
                <MenuIcon />
              </IconButton>
              <Menu
                anchorEl={navMenuEl}
                open={Boolean(navMenuEl)}
                onClose={handleNavMenuClose}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                transformOrigin={{ vertical: 'top', horizontal: 'right' }}
              >
                <MenuItem onClick={() => goTo('/')}>
                  <Dashboard fontSize="small" sx={{ mr: 1 }} />
                  Dashboard
                </MenuItem>
                <MenuItem onClick={() => goTo('/trip/new')}>
                  <Flight fontSize="small" sx={{ mr: 1 }} />
                  New Trip
                </MenuItem>
                <MenuItem onClick={() => goTo('/quicket')}>
                  <LocalOffer fontSize="small" sx={{ mr: 1 }} />
                  Quicket
                </MenuItem>
              </Menu>
            </>
          ) : (
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                component={NavLink}
                to="/"
                startIcon={<Dashboard />}
                sx={{
                  color: 'text.secondary',
                  '&.active': {
                    color: 'primary.main',
                    bgcolor: 'primary.50',
                    fontWeight: 600,
                  },
                }}
              >
                Dashboard
              </Button>
              <Button
                component={NavLink}
                to="/trip/new"
                startIcon={<Flight />}
                sx={{
                  color: 'text.secondary',
                  '&.active': {
                    color: 'primary.main',
                    bgcolor: 'primary.50',
                    fontWeight: 700,
                  },
                }}
              >
                New Trip
              </Button>
              <Button
                component={NavLink}
                to="/quicket"
                startIcon={<LocalOffer />}
                sx={{
                  color: 'text.secondary',
                  '&.active': {
                    color: 'primary.main',
                    bgcolor: 'primary.50',
                    fontWeight: 700,
                  },
                }}
              >
                Quicket
              </Button>
            </Box>
          )}
          <Box
            sx={{
              ml: isMobile ? 0 : 'auto',
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              flexShrink: 0,
            }}
          >
            <Chip label="v2" size="small" variant="outlined" color="primary" />
            {user && (
              <>
                {!isMobile && (
                  <Typography variant="body2" color="text.secondary" noWrap>
                    {user.name}
                  </Typography>
                )}
                <IconButton onClick={handleMenuOpen} size="small">
                  <Avatar
                    src={user.picture}
                    alt={user.name}
                    sx={{ width: 32, height: 32 }}
                  />
                </IconButton>
                <Menu
                  anchorEl={anchorEl}
                  open={Boolean(anchorEl)}
                  onClose={handleMenuClose}
                  anchorOrigin={{
                    vertical: 'bottom',
                    horizontal: 'right',
                  }}
                  transformOrigin={{
                    vertical: 'top',
                    horizontal: 'right',
                  }}
                >
                  {isMobile && [
                    <MenuItem key="user-info" disabled>
                      <Typography variant="body2" color="text.secondary">
                        {user.name}
                      </Typography>
                    </MenuItem>,
                    <Divider key="divider" sx={{ my: 0.5 }} />,
                  ]}
                  <MenuItem onClick={handleLogout}>
                    <Logout sx={{ mr: 1 }} fontSize="small" />
                    Logout
                  </MenuItem>
                </Menu>
              </>
            )}
          </Box>
        </Toolbar>
      </AppBar>
      <Container
        maxWidth="xl"
        component="main"
        sx={{
          flexGrow: 1,
          py: { xs: 0, md: 4 },
          display: 'flex',
          flexDirection: 'column',
          px: { xs: 2, sm: 3, md: 4 },
        }}
      >
        {children}
      </Container>
    </Box>
  );
}
