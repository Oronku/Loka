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
import { ChatProvider } from '../context/ChatContext';
import {
  Flight,
  Dashboard,
  Logout,
  Menu as MenuIcon,
  LocalOffer,
  Settings,
  People as PeopleIcon,
} from '@mui/icons-material';
import { useTheme } from '@mui/material/styles';
import { useAuth } from '../context/AuthContext';
import { useState, useEffect } from 'react';
import CloudsBackground from './CloudsBackground';
import ChatFab from './ChatFab';
import ChatSidebar from './ChatSidebar';
import ChatWindowModern from './ChatWindowModern';
import ChatContextSelector from './ChatContextSelector';
import logo from '../svgs/logo.svg';

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [navMenuEl, setNavMenuEl] = useState<null | HTMLElement>(null);
  const [chatSidebarOpen, setChatSidebarOpen] = useState(false);
  const [chatSelectorOpen, setChatSelectorOpen] = useState(false);
  const [selectedContextType, setSelectedContextType] = useState<
    'quicket_item' | 'trip' | 'direct' | null
  >(null);
  const [openChats, setOpenChats] = useState<
    Array<{ chatId: string; contextType: string }>
  >([]);
  const [totalUnreadCount, setTotalUnreadCount] = useState(0);
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
                <MenuItem onClick={() => goTo('/friends')}>
                  <PeopleIcon fontSize="small" sx={{ mr: 1 }} />
                  Friends
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
              <Button
                component={NavLink}
                to="/friends"
                startIcon={<PeopleIcon />}
                sx={{
                  color: 'text.secondary',
                  '&.active': {
                    color: 'primary.main',
                    bgcolor: 'primary.50',
                    fontWeight: 700,
                  },
                }}
              >
                Friends
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
                  <MenuItem
                    onClick={() => {
                      handleMenuClose();
                      navigate('/profile');
                    }}
                  >
                    <Settings sx={{ mr: 1 }} fontSize="small" />
                    Profile Settings
                  </MenuItem>
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
        <ChatProvider onOpenChat={handleChatSelect}>{children}</ChatProvider>
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
    </Box>
  );
}
