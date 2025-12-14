import React, { useState, useEffect } from 'react';
import {
  Drawer,
  Box,
  Typography,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Avatar,
  Badge,
  IconButton,
  Divider,
  TextField,
  InputAdornment,
  Chip,
  CircularProgress,
  Tabs,
  Tab,
} from '@mui/material';
import {
  Close as CloseIcon,
  Search as SearchIcon,
  LocalOffer as QuicketIcon,
  Flight as TripIcon,
  People as FriendsIcon,
} from '@mui/icons-material';
import { useAuth } from '../context/AuthContext';
import { format } from 'date-fns';

interface Chat {
  _id: string;
  contextType: 'quicket_item' | 'trip' | 'direct';
  contextId: string;
  participants: Array<{
    userId: string;
    email: string;
    name: string;
    role: string;
  }>;
  status: string;
  metadata: {
    itemId?: string;
    itemTitle?: string;
    itemType?: string;
    itemImage?: string;
    itemDate?: string;
    itemPrice?: { original: number; selling: number };
    tripId?: string;
    tripName?: string;
    tripDates?: string;
    tripImage?: string;
  };
  unreadCount?: { [key: string]: number };
  lastMessage?: string;
  lastMessageAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

interface ChatSidebarProps {
  open: boolean;
  onClose: () => void;
  onChatSelect: (chatId: string, contextType: string) => void;
  onNewChat: (contextType: string) => void;
}

export default function ChatSidebar({
  open,
  onClose,
  onChatSelect,
  onNewChat,
}: ChatSidebarProps) {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState(0); // 0: Friends, 1: Trips, 2: Quicket
  const [searchQuery, setSearchQuery] = useState('');
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);
  const [filteredChats, setFilteredChats] = useState<Chat[]>([]);

  useEffect(() => {
    if (open) {
      fetchChats();
      const interval = setInterval(fetchChats, 5000); // Refresh every 5 seconds
      return () => clearInterval(interval);
    }
  }, [open]);

  useEffect(() => {
    filterChats();
  }, [chats, searchQuery, activeTab]);

  const fetchChats = async () => {
    try {
      const token = localStorage.getItem('authToken');
      const url = 'http://localhost:3001/api/chats';

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setChats(data.chats || []);
      }
      setLoading(false);
    } catch (err) {
      console.error('Error fetching chats:', err);
      setLoading(false);
    }
  };

  const filterChats = () => {
    let filtered = chats;

    // Filter by active tab
    if (activeTab === 0) {
      // Friends tab
      filtered = filtered.filter((chat) => chat.contextType === 'direct');
    } else if (activeTab === 1) {
      // Trips tab
      filtered = filtered.filter((chat) => chat.contextType === 'trip');
    } else if (activeTab === 2) {
      // Quicket tab
      filtered = filtered.filter((chat) => chat.contextType === 'quicket_item');
    }

    if (searchQuery) {
      filtered = filtered.filter((chat) => {
        const searchLower = searchQuery.toLowerCase();

        // Search in participant names
        const participantMatch = chat.participants.some(
          (p) =>
            p.name.toLowerCase().includes(searchLower) ||
            p.email.toLowerCase().includes(searchLower)
        );

        // Search in metadata
        const metadataMatch =
          chat.metadata.itemTitle?.toLowerCase().includes(searchLower) ||
          chat.metadata.tripName?.toLowerCase().includes(searchLower);

        return participantMatch || metadataMatch;
      });
    }

    setFilteredChats(filtered);
  };

  const getOtherParticipant = (chat: Chat) => {
    return chat.participants.find((p) => p.userId !== user?.id);
  };

  const getChatTitle = (chat: Chat) => {
    if (chat.contextType === 'quicket_item') {
      return chat.metadata.itemTitle || 'Quicket Item';
    } else if (chat.contextType === 'trip') {
      return chat.metadata.tripName || 'Trip Chat';
    } else if (chat.contextType === 'direct') {
      const other = getOtherParticipant(chat);
      return other?.name || 'Direct Chat';
    }
    return 'Chat';
  };

  const getChatSubtitle = (chat: Chat) => {
    if (chat.contextType === 'quicket_item') {
      const other = getOtherParticipant(chat);
      return `${other?.name || 'User'} • ${chat.metadata.itemType || ''}`;
    } else if (chat.contextType === 'trip') {
      return `${chat.participants.length} members`;
    } else if (chat.contextType === 'direct') {
      return chat.lastMessage || 'Start a conversation';
    }
    return '';
  };

  const getChatImage = (chat: Chat) => {
    if (chat.contextType === 'quicket_item' && chat.metadata.itemImage) {
      return chat.metadata.itemImage;
    } else if (chat.contextType === 'trip' && chat.metadata.tripImage) {
      return chat.metadata.tripImage;
    }
    return null;
  };

  const getUnreadCount = (chat: Chat) => {
    return chat.unreadCount?.[user?.id || ''] || 0;
  };

  // Calculate unread counts per tab
  const getTabUnreadCount = (
    contextType: 'direct' | 'trip' | 'quicket_item'
  ) => {
    return chats
      .filter((chat) => chat.contextType === contextType)
      .reduce((sum, chat) => sum + getUnreadCount(chat), 0);
  };

  const friendsUnread = getTabUnreadCount('direct');
  const tripsUnread = getTabUnreadCount('trip');
  const quicketUnread = getTabUnreadCount('quicket_item');

  const formatTimestamp = (date?: Date) => {
    if (!date) return '';
    const d = new Date(date);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return format(d, 'MMM d');
  };

  return (
    <Drawer
      anchor="left"
      open={open}
      onClose={onClose}
      sx={{
        '& .MuiDrawer-paper': {
          width: { xs: '100%', sm: 400 },
          maxWidth: '100%',
        },
      }}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Header */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            p: 2,
            borderBottom: 1,
            borderColor: 'divider',
          }}
        >
          <Typography variant="h6">Messages</Typography>
          <IconButton onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </Box>

        {/* Tabs */}
        <Tabs
          value={activeTab}
          onChange={(_, newValue) => setActiveTab(newValue)}
          variant="fullWidth"
          sx={{ borderBottom: 1, borderColor: 'divider' }}
        >
          <Tab
            icon={
              <Badge badgeContent={friendsUnread} color="error">
                <FriendsIcon />
              </Badge>
            }
            label="Friends"
            iconPosition="start"
            sx={{ minHeight: 56 }}
          />
          <Tab
            icon={
              <Badge badgeContent={tripsUnread} color="error">
                <TripIcon />
              </Badge>
            }
            label="Trips"
            iconPosition="start"
            sx={{ minHeight: 56 }}
          />
          <Tab
            icon={
              <Badge badgeContent={quicketUnread} color="error">
                <QuicketIcon />
              </Badge>
            }
            label="Quicket"
            iconPosition="start"
            sx={{ minHeight: 56 }}
          />
        </Tabs>

        {/* Search */}
        <Box sx={{ p: 2 }}>
          <TextField
            fullWidth
            size="small"
            placeholder="Search chats..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
            }}
          />
        </Box>

        {/* Chat List */}
        <Box sx={{ flex: 1, overflow: 'auto' }}>
          {loading ? (
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                height: 200,
              }}
            >
              <CircularProgress />
            </Box>
          ) : filteredChats.length === 0 ? (
            <Box sx={{ p: 4, textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                {searchQuery
                  ? 'No chats found'
                  : activeTab === 0
                    ? 'No friend chats yet. Add friends to start chatting!'
                    : activeTab === 1
                      ? 'No trip chats yet. Share a trip with friends!'
                      : 'No Quicket chats yet. Express interest in an item to start!'}
              </Typography>
            </Box>
          ) : (
            <List sx={{ p: 0 }}>
              {filteredChats.map((chat) => {
                const unreadCount = getUnreadCount(chat);
                const chatImage = getChatImage(chat);

                return (
                  <React.Fragment key={chat._id}>
                    <ListItem
                      button
                      onClick={() => onChatSelect(chat._id, chat.contextType)}
                      sx={{
                        py: 2,
                        bgcolor:
                          unreadCount > 0 ? 'action.hover' : 'transparent',
                        '&:hover': { bgcolor: 'action.selected' },
                      }}
                    >
                      <ListItemAvatar>
                        <Badge
                          badgeContent={unreadCount}
                          color="error"
                          overlap="circular"
                        >
                          <Avatar
                            src={chatImage || undefined}
                            sx={{ width: 50, height: 50 }}
                          >
                            {chat.contextType === 'quicket_item' && (
                              <QuicketIcon />
                            )}
                            {chat.contextType === 'trip' && <TripIcon />}
                            {chat.contextType === 'direct' &&
                              getOtherParticipant(chat)?.name[0]?.toUpperCase()}
                          </Avatar>
                        </Badge>
                      </ListItemAvatar>

                      <ListItemText
                        primaryTypographyProps={{ component: 'div' }}
                        secondaryTypographyProps={{ component: 'div' }}
                        primary={
                          <Box
                            sx={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                            }}
                          >
                            <Box
                              sx={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 0.5,
                                flex: 1,
                                minWidth: 0,
                              }}
                            >
                              <Typography
                                variant="subtitle2"
                                sx={{
                                  fontWeight: unreadCount > 0 ? 700 : 400,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {getChatTitle(chat)}
                              </Typography>
                              <Chip
                                size="small"
                                label={
                                  chat.contextType === 'quicket_item'
                                    ? 'Quicket'
                                    : chat.contextType === 'trip'
                                      ? 'Trip'
                                      : 'Friend'
                                }
                                color={
                                  chat.contextType === 'quicket_item'
                                    ? 'primary'
                                    : chat.contextType === 'trip'
                                      ? 'info'
                                      : 'default'
                                }
                                sx={{ height: 18, fontSize: '0.65rem' }}
                              />
                            </Box>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                            >
                              {formatTimestamp(chat.lastMessageAt)}
                            </Typography>
                          </Box>
                        }
                        secondary={
                          <Box>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{ display: 'block' }}
                            >
                              {getChatSubtitle(chat)}
                            </Typography>
                            {chat.lastMessage && (
                              <Typography
                                variant="body2"
                                color="text.secondary"
                                sx={{
                                  mt: 0.5,
                                  fontWeight: unreadCount > 0 ? 600 : 400,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {chat.lastMessage}
                              </Typography>
                            )}
                            {chat.contextType === 'quicket_item' &&
                              chat.status === 'pending' && (
                                <Chip
                                  label="Pending"
                                  size="small"
                                  color="warning"
                                  sx={{ mt: 0.5, height: 20 }}
                                />
                              )}
                          </Box>
                        }
                      />
                    </ListItem>
                    <Divider variant="inset" component="li" />
                  </React.Fragment>
                );
              })}
            </List>
          )}
        </Box>
      </Box>
    </Drawer>
  );
}
