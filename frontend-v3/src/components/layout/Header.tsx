import { Link, NavLink, useNavigate } from 'react-router-dom';
import {
  AppBar,
  Toolbar,
  Typography,
  Button,
  Box,
  Avatar,
  IconButton,
  Menu,
  MenuItem,
  useMediaQuery,
  Badge,
  Tooltip,
  Divider,
} from '@mui/material';
import {
  FlightTakeoff,
  Dashboard,
  Logout,
  Menu as MenuIcon,
  People as PeopleIcon,
  Language as LanguageIcon,
  AdminPanelSettings,
  Business,
  BusinessCenter,
  AddCircleOutline,
  Explore,
  Notifications,
  Person,
} from '@mui/icons-material';
import { useTheme } from '@mui/material/styles';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useState, useEffect } from 'react';
import logo from '../../svgs/logo.svg';
import { motion } from 'framer-motion';
import { chatApi } from '../../services/chatApi';

interface HeaderProps {
  totalUnreadCount: number;
}

export function Header({ totalUnreadCount }: HeaderProps) {
  const { user, logout } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const navigate = useNavigate();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [navMenuEl, setNavMenuEl] = useState<null | HTMLElement>(null);
  const [langMenuEl, setLangMenuEl] = useState<null | HTMLElement>(null);
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

  const handleLangMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setLangMenuEl(event.currentTarget);
  };

  const handleLangMenuClose = () => {
    setLangMenuEl(null);
  };

  const handleLanguageChange = (lang: 'he' | 'en') => {
    setLanguage(lang);
    handleLangMenuClose();
  };

  const navItems = [
    { path: '/', label: t('home'), icon: <Dashboard /> },
    { path: '/organized-trips', label: t('trips'), icon: <Explore /> },
    { path: '/quicket', label: t('quicket'), icon: <FlightTakeoff /> },
  ];

  const agentNavItems = [
    { path: '/agent', label: t('agentDashboard'), icon: <BusinessCenter /> },
    { path: '/agency/trips/new', label: t('createTrip'), icon: <AddCircleOutline /> },
  ];

  const adminNavItems = [
    { path: '/admin', label: t('admin'), icon: <AdminPanelSettings /> },
    { path: '/agency', label: t('agency'), icon: <Business /> },
  ];

  return (
    <>
      <AppBar
        position="sticky"
        elevation={0}
        sx={{
          background: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(14, 165, 233, 0.1)',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.05)',
          width: '100%',
          borderRadius: 0,
        }}
      >
        <Box sx={{ width: '100%', px: 3 }}>
          <Toolbar
            disableGutters
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              py: 1,
              direction: 'ltr',
            }}
          >
            {/* Logo */}
            <Box
              component={Link}
              to="/"
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                textDecoration: 'none',
                color: 'inherit',
              }}
            >
              <motion.img
                src={logo}
                alt="Meet Loka"
                style={{ height: 44 }}
                whileHover={{ scale: 1.08, rotate: 5 }}
                whileTap={{ scale: 0.95 }}
                transition={{ type: 'spring', stiffness: 400, damping: 17 }}
              />
              <Typography
                variant="h6"
                sx={{
                  fontWeight: 800,
                  fontSize: '1.5rem',
                  background: 'linear-gradient(135deg, #0EA5E9 0%, #3B82F6 50%, #F97316 100%)',
                  backgroundClip: 'text',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  display: { xs: 'none', sm: 'block' },
                  letterSpacing: '-0.02em',
                }}
              >
                Meet Loka
              </Typography>
            </Box>

            {/* Desktop Navigation */}
            {!isMobile && (
              <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                {navItems.map((item) => (
                  <Button
                    key={item.path}
                    component={NavLink}
                    to={item.path}
                    startIcon={item.icon}
                    sx={{
                      color: 'text.primary',
                      fontWeight: 600,
                      borderRadius: 2,
                      px: 2.5,
                      py: 1,
                      transition: 'all 0.2s ease',
                      display: 'inline-flex',
                      gap: 1,
                      '& .MuiButton-startIcon': {
                        margin: 0,
                      },
                      '&.active': {
                        background: 'linear-gradient(135deg, rgba(14, 165, 233, 0.15) 0%, rgba(249, 115, 22, 0.1) 100%)',
                        color: 'primary.main',
                        boxShadow: '0 2px 8px rgba(14, 165, 233, 0.15)',
                      },
                      '&:hover': {
                        background: 'rgba(14, 165, 233, 0.08)',
                        transform: 'translateY(-1px)',
                      },
                    }}
                  >
                    {item.label}
                  </Button>
                ))}
                {user?.isAgent && (
                  <>
                    {agentNavItems.map((item) => (
                      <Button
                        key={item.path}
                        component={NavLink}
                        to={item.path}
                        startIcon={item.icon}
                        sx={{
                          color: 'text.primary',
                          fontWeight: 600,
                          borderRadius: 2,
                          px: 2.5,
                          py: 1,
                          transition: 'all 0.2s ease',
                          display: 'inline-flex',
                          gap: 1,
                          '& .MuiButton-startIcon': {
                            margin: 0,
                          },
                          '&.active': {
                            background: 'linear-gradient(135deg, rgba(14, 165, 233, 0.15) 0%, rgba(249, 115, 22, 0.1) 100%)',
                            color: 'primary.main',
                            boxShadow: '0 2px 8px rgba(14, 165, 233, 0.15)',
                          },
                          '&:hover': {
                            background: 'rgba(14, 165, 233, 0.08)',
                            transform: 'translateY(-1px)',
                          },
                        }}
                      >
                        {item.label}
                      </Button>
                    ))}
                  </>
                )}
              </Box>
            )}

            {/* Right Side Actions */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {/* Language Selector */}
              <Tooltip title="Change Language" arrow>
                <IconButton
                  onClick={handleLangMenuOpen}
                  sx={{
                    color: 'text.primary',
                    transition: 'all 0.2s ease',
                    '&:hover': { 
                      background: 'rgba(14, 165, 233, 0.1)',
                      transform: 'scale(1.05)',
                    },
                  }}
                >
                  <LanguageIcon />
                </IconButton>
              </Tooltip>

              {/* Mobile Menu */}
              {isMobile && (
                <IconButton
                  onClick={handleNavMenuOpen}
                  sx={{
                    color: 'text.primary',
                    '&:hover': { background: 'rgba(14, 165, 233, 0.1)' },
                  }}
                >
                  <MenuIcon />
                </IconButton>
              )}

              {/* User Menu */}
              {user && (
                <>
                  <Tooltip title="Notifications">
                    <IconButton
                      sx={{
                        color: 'text.primary',
                        '&:hover': { background: 'rgba(14, 165, 233, 0.1)' },
                      }}
                    >
                      <Badge badgeContent={totalUnreadCount} color="error">
                        <Notifications />
                      </Badge>
                    </IconButton>
                  </Tooltip>

                  <Tooltip title="Account">
                    <IconButton onClick={handleMenuOpen} sx={{ p: 0 }}>
                      <Avatar
                        src={user.picture}
                        sx={{
                          width: 40,
                          height: 40,
                          border: '2px solid',
                          borderColor: 'primary.main',
                        }}
                      >
                        {user.name?.[0]?.toUpperCase()}
                      </Avatar>
                    </IconButton>
                  </Tooltip>
                </>
              )}
            </Box>
          </Toolbar>
        </Box>
      </AppBar>

      {/* Mobile Navigation Menu */}
      <Menu
        anchorEl={navMenuEl}
        open={Boolean(navMenuEl)}
        onClose={handleNavMenuClose}
        PaperProps={{
          sx: {
            mt: 1.5,
            borderRadius: 3,
            minWidth: 200,
            boxShadow: '0 10px 40px rgba(0, 0, 0, 0.1)',
          },
        }}
      >
        {navItems.map((item) => (
          <MenuItem
            key={item.path}
            onClick={() => goTo(item.path)}
            sx={{
              py: 1.5,
              px: 2,
              '&:hover': {
                background: 'rgba(14, 165, 233, 0.1)',
              },
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              {item.icon}
              {item.label}
            </Box>
          </MenuItem>
        ))}
        {user?.isAgent && (
          <>
            {agentNavItems.map((item) => (
              <MenuItem
                key={item.path}
                onClick={() => goTo(item.path)}
                sx={{
                  py: 1.5,
                  px: 2,
                  '&:hover': {
                    background: 'rgba(14, 165, 233, 0.1)',
                  },
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  {item.icon}
                  {item.label}
                </Box>
              </MenuItem>
            ))}
          </>
        )}
      </Menu>

      {/* Language Menu */}
      <Menu
        anchorEl={langMenuEl}
        open={Boolean(langMenuEl)}
        onClose={handleLangMenuClose}
        PaperProps={{
          sx: {
            mt: 1.5,
            borderRadius: 1,
            minWidth: 160,
            boxShadow: '0 10px 40px rgba(0, 0, 0, 0.1)',
            border: '1px solid rgba(14, 165, 233, 0.1)',
            overflow: 'visible',
            '&::before': {
              content: '""',
              display: 'block',
              position: 'absolute',
              top: 0,
              right: 14,
              width: 10,
              height: 10,
              bgcolor: 'background.paper',
              transform: 'translateY(-50%) rotate(45deg)',
              zIndex: 0,
              borderTop: '1px solid rgba(14, 165, 233, 0.1)',
              borderLeft: '1px solid rgba(14, 165, 233, 0.1)',
            },
          },
        }}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
      >
        <MenuItem
          onClick={() => handleLanguageChange('he')}
          selected={language === 'he'}
          sx={{
            py: 1.5,
            px: 2.5,
            gap: 2,
            fontSize: '0.95rem',
            fontWeight: language === 'he' ? 600 : 400,
            '&.Mui-selected': {
              background: 'linear-gradient(135deg, rgba(14, 165, 233, 0.08) 0%, rgba(249, 115, 22, 0.05) 100%)',
              color: 'primary.main',
              '&:hover': {
                background: 'linear-gradient(135deg, rgba(14, 165, 233, 0.12) 0%, rgba(249, 115, 22, 0.08) 100%)',
              },
            },
            '&:hover': {
              background: 'rgba(14, 165, 233, 0.05)',
            },
          }}
        >
          🇮🇱 עברית
        </MenuItem>
        <MenuItem
          onClick={() => handleLanguageChange('en')}
          selected={language === 'en'}
          sx={{
            py: 1.5,
            px: 2.5,
            gap: 2,
            fontSize: '0.95rem',
            fontWeight: language === 'en' ? 600 : 400,
            '&.Mui-selected': {
              background: 'linear-gradient(135deg, rgba(14, 165, 233, 0.08) 0%, rgba(249, 115, 22, 0.05) 100%)',
              color: 'primary.main',
              '&:hover': {
                background: 'linear-gradient(135deg, rgba(14, 165, 233, 0.12) 0%, rgba(249, 115, 22, 0.08) 100%)',
              },
            },
            '&:hover': {
              background: 'rgba(14, 165, 233, 0.05)',
            },
          }}
        >
          🇺🇸 English
        </MenuItem>
      </Menu>

      {/* User Menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
        PaperProps={{
          sx: {
            mt: 1,
            borderRadius: 3,
            minWidth: 200,
            boxShadow: '0 10px 40px rgba(0, 0, 0, 0.1)',
          },
        }}
      >
        <MenuItem onClick={() => { goTo('/profile'); handleMenuClose(); }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Person fontSize="small" />
            Account
          </Box>
        </MenuItem>
        {user?.isAdmin && (
          <MenuItem onClick={() => { goTo('/profile?tab=admin'); handleMenuClose(); }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <AdminPanelSettings fontSize="small" />
              Admin
            </Box>
          </MenuItem>
        )}
        {(user?.isAgencyAdmin || user?.isAdmin) && (
          <MenuItem onClick={() => { goTo('/profile?tab=agency'); handleMenuClose(); }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Business fontSize="small" />
              Agency
            </Box>
          </MenuItem>
        )}
        <Divider sx={{ my: 1 }} />
        <MenuItem onClick={() => { goTo('/friends'); handleMenuClose(); }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <PeopleIcon fontSize="small" />
            {t('friends')}
          </Box>
        </MenuItem>
        <MenuItem onClick={handleLogout}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Logout fontSize="small" />
            {t('logout')}
          </Box>
        </MenuItem>
      </Menu>
    </>
  );
}
