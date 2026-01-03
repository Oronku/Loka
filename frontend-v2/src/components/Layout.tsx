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
  Badge,
  Tooltip,
} from '@mui/material';
import { ChatProvider } from '../context/ChatContext';
import {
  Flight,
  Dashboard,
  Logout,
  Menu as MenuIcon,
  LocalOffer,
  Settings,
  People as PeopleIcon,
  LocationOn,
  Language as LanguageIcon,
  AdminPanelSettings,
  BusinessCenter,
} from '@mui/icons-material';
import { useTheme } from '@mui/material/styles';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useState, useEffect } from 'react';
import CloudsBackground from './CloudsBackground';
import ChatFab from './ChatFab';
import ChatSidebar from './ChatSidebar';
import ChatWindowModern from './ChatWindowModern';
import ChatContextSelector from './ChatContextSelector';
import { friendsApi } from '../services/friendsApi';
import logo from '../svgs/logo.svg';

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const navigate = useNavigate();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [navMenuEl, setNavMenuEl] = useState<null | HTMLElement>(null);
  const [langMenuEl, setLangMenuEl] = useState<null | HTMLElement>(null);
  const [chatSidebarOpen, setChatSidebarOpen] = useState(false);
  const [chatSelectorOpen, setChatSelectorOpen] = useState(false);
  const [selectedContextType, setSelectedContextType] = useState<
    'quicket_item' | 'trip' | 'direct' | null
  >(null);
  const [openChats, setOpenChats] = useState<
    Array<{ chatId: string; contextType: string }>
  >([]);
  const [totalUnreadCount, setTotalUnreadCount] = useState(0);
  const [friendRequestCount, setFriendRequestCount] = useState(0);
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

  const handleChatSelect = (chatId: string, contextType: string = 'direct') => {
    // Close sidebar
    setChatSidebarOpen(false);

    // Check if chat is already open
    const existingChat = openChats.find((c) => c.chatId === chatId);
    if (!existingChat) {
      setOpenChats([...openChats, { chatId, contextType }]);
    }
  };

  const handleNewChat = (contextType: string) => {
    // Open the context selector modal
    setSelectedContextType(contextType as any);
    setChatSelectorOpen(true);
    setChatSidebarOpen(false);
  };

  // Fetch total unread count
  useEffect(() => {
    if (!user) return;

    const fetchUnreadCount = async () => {
      try {
        const response = await fetch('http://localhost:3001/api/chats', {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('authToken')}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          const chats = data.chats || data; // Handle both {chats: []} and [] formats
          const total = Array.isArray(chats)
            ? chats.reduce((sum: number, chat: any) => {
                const unreadCount = chat.unreadCount?.[user.id] || 0;
                return sum + unreadCount;
              }, 0)
            : 0;
          setTotalUnreadCount(total);
        }
      } catch (error) {
        console.error('Error fetching unread count:', error);
      }
    };

    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 5000); // Update every 5 seconds

    return () => clearInterval(interval);
  }, [user]);

  // Fetch friend request count
  useEffect(() => {
    if (!user) return;

    const fetchFriendRequestCount = async () => {
      try {
        const requests = await friendsApi.getFriendRequests();
        setFriendRequestCount(requests.length);
      } catch (error) {
        console.error('Error fetching friend requests:', error);
      }
    };

    fetchFriendRequestCount();
    const interval = setInterval(fetchFriendRequestCount, 10000); // Update every 10 seconds

    return () => clearInterval(interval);
  }, [user]);

  const handleCreateChat = async (
    contextType: string,
    contextId: string,
    participants: any[],
    metadata: any
  ) => {
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch('http://localhost:3001/api/chats', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          contextType,
          contextId,
          participants,
          metadata,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        // Open the new chat window
        setOpenChats([...openChats, { chatId: data.chatId, contextType }]);
      }
    } catch (err) {
      console.error('Error creating chat:', err);
    }
  };

  const handleCloseChat = (chatId: string) => {
    setOpenChats(openChats.filter((c) => c.chatId !== chatId));
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
      <ChatProvider onOpenChat={handleChatSelect}>
        <AppBar
          position="sticky"
          elevation={0}
          sx={{
            top: 0,
            zIndex: 1100,
            borderBottom: '1px solid',
            borderColor: 'rgba(0,0,0,0.05)',
          }}
        >
          <Toolbar
            sx={{ gap: { xs: 1, sm: 2 }, minHeight: { xs: 64, md: 72 } }}
          >
            <Typography
              variant="h6"
              component={Link}
              to="/"
              sx={{
                flexGrow: 0,
                mr: 4,
                textDecoration: 'none',
                color: 'primary.main',
                fontWeight: 800,
                fontSize: '1.5rem',
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                letterSpacing: '-0.02em',
              }}
            >
              <img src={logo} alt="Loka Logo" style={{ height: 40 }} />
              Meet Loka
            </Typography>
            {isMobile ? (
              <>
                <IconButton
                  edge="start"
                  onClick={handleNavMenuOpen}
                  aria-label="Open navigation"
                  sx={{ marginInlineStart: 'auto' }}
                >
                  <MenuIcon />
                </IconButton>
                <Menu
                  anchorEl={navMenuEl}
                  open={Boolean(navMenuEl)}
                  onClose={handleNavMenuClose}
                  anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                  transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                  PaperProps={{
                    elevation: 0,
                    sx: {
                      overflow: 'visible',
                      filter: 'drop-shadow(0px 2px 8px rgba(0,0,0,0.1))',
                      mt: 1.5,
                      borderRadius: 3,
                    },
                  }}
                >
                  <MenuItem onClick={() => goTo('/')} sx={{ gap: 1 }}>
                    <Dashboard fontSize="small" />
                    {t('home')}
                  </MenuItem>
                  <MenuItem onClick={() => goTo('/trip/new')} sx={{ gap: 1 }}>
                    <Flight fontSize="small" />
                    {t('newTrip')}
                  </MenuItem>
                  <MenuItem onClick={() => goTo('/quicket')} sx={{ gap: 1 }}>
                    <LocalOffer fontSize="small" />
                    Quicket
                  </MenuItem>
                  <MenuItem onClick={() => goTo('/friends')} sx={{ gap: 1 }}>
                    <Badge badgeContent={friendRequestCount} color="error">
                      <PeopleIcon fontSize="small" />
                    </Badge>
                    {t('friends')}
                  </MenuItem>
                  <MenuItem onClick={() => goTo('/check-in')} sx={{ gap: 1 }}>
                    <LocationOn fontSize="small" />
                    {t('checkIn')}
                  </MenuItem>
                  {user?.isAgent && (
                    <MenuItem onClick={() => goTo('/agent')} sx={{ gap: 1 }}>
                      <BusinessCenter fontSize="small" />
                      Agent Dashboard
                    </MenuItem>
                  )}
                  {user?.isAdmin && (
                    <MenuItem onClick={() => goTo('/admin')} sx={{ gap: 1 }}>
                      <AdminPanelSettings fontSize="small" />
                      Admin Dashboard
                    </MenuItem>
                  )}
                </Menu>
              </>
            ) : (
              <Box sx={{ display: 'flex', gap: 1 }}>
                {[
                  { to: '/', icon: <Dashboard />, label: t('home') },
                  { to: '/trip/new', icon: <Flight />, label: t('newTrip') },
                  { to: '/quicket', icon: <LocalOffer />, label: 'Quicket' },
                  {
                    to: '/friends',
                    icon: (
                      <Badge badgeContent={friendRequestCount} color="error">
                        <PeopleIcon />
                      </Badge>
                    ),
                    label: t('friends'),
                  },
                  {
                    to: '/check-in',
                    icon: <LocationOn />,
                    label: t('checkIn'),
                  },
                  ...(user?.isAgent
                    ? [
                        {
                          to: '/agent',
                          icon: <BusinessCenter />,
                          label: 'Agent',
                        },
                      ]
                    : []),
                  ...(user?.isAdmin
                    ? [
                        {
                          to: '/admin',
                          icon: <AdminPanelSettings />,
                          label: 'Admin',
                        },
                      ]
                    : []),
                ].map((item) => (
                  <Button
                    key={item.to}
                    component={NavLink}
                    to={item.to}
                    startIcon={item.icon}
                    sx={{
                      color: 'text.secondary',
                      px: 2,
                      py: 1,
                      borderRadius: 3,
                      gap: 1,
                      '& .MuiButton-startIcon': {
                        marginRight: 0,
                        marginLeft: 0,
                      },
                      '&:hover': {
                        bgcolor: 'rgba(0, 157, 133, 0.04)',
                        color: 'primary.main',
                      },
                      '&.active': {
                        color: 'primary.main',
                        bgcolor: 'rgba(0, 157, 133, 0.08)',
                        fontWeight: 700,
                      },
                      transition: 'all 0.2s ease',
                    }}
                  >
                    {item.label}
                  </Button>
                ))}
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
              <Button
                onClick={handleLangMenuOpen}
                size="small"
                sx={{
                  color: 'text.secondary',
                  minWidth: 'auto',
                  px: 1.5,
                  '&:hover': {
                    bgcolor: 'rgba(0, 157, 133, 0.04)',
                    color: 'primary.main',
                  },
                }}
              >
                {language === 'he' ? '🇮🇱' : '🇺🇸'}
              </Button>
              <Menu
                anchorEl={langMenuEl}
                open={Boolean(langMenuEl)}
                onClose={handleLangMenuClose}
                anchorOrigin={{
                  vertical: 'bottom',
                  horizontal: 'right',
                }}
                transformOrigin={{
                  vertical: 'top',
                  horizontal: 'right',
                }}
              >
                <MenuItem
                  onClick={() => handleLanguageChange('he')}
                  selected={language === 'he'}
                  sx={{ gap: 1 }}
                >
                  🇮🇱 עברית
                </MenuItem>
                <MenuItem
                  onClick={() => handleLanguageChange('en')}
                  selected={language === 'en'}
                  sx={{ gap: 1 }}
                >
                  🇺🇸 English
                </MenuItem>
              </Menu>
              <Chip
                label="v2"
                size="small"
                variant="outlined"
                color="primary"
              />
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
                    <MenuItem
                      onClick={() => {
                        handleMenuClose();
                        navigate('/profile');
                      }}
                      sx={{ gap: 1 }}
                    >
                      <Settings fontSize="small" />
                      {t('profile')}
                    </MenuItem>
                    <MenuItem onClick={handleLogout} sx={{ gap: 1 }}>
                      <Logout fontSize="small" />
                      {t('logout')}
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

        {/* Global Chat FAB */}
        {user && (
          <ChatFab
            onClick={() => setChatSidebarOpen(true)}
            unreadCount={totalUnreadCount}
          />
        )}

        {/* Chat Sidebar */}
        <ChatSidebar
          open={chatSidebarOpen}
          onClose={() => setChatSidebarOpen(false)}
          onChatSelect={handleChatSelect}
          onNewChat={handleNewChat}
        />

        {/* Chat Context Selector Modal */}
        <ChatContextSelector
          open={chatSelectorOpen}
          onClose={() => setChatSelectorOpen(false)}
          contextType={
            selectedContextType === 'direct'
              ? 'friend_group'
              : selectedContextType
          }
          onCreateChat={handleCreateChat}
        />

        {/* Open Chat Windows */}
        {openChats.map((chat, index) => (
          <ChatWindowModern
            key={chat.chatId}
            chatId={chat.chatId}
            onClose={() => handleCloseChat(chat.chatId)}
            initialPosition={{ x: 100 + index * 50, y: 100 + index * 50 }}
          />
        ))}
      </ChatProvider>
    </Box>
  );
}
