import { useState, useEffect } from 'react';
import {
  Box,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  ListItemAvatar,
  Avatar,
  Typography,
  Chip,
  CircularProgress,
  Alert,
  Badge,
  Divider,
  Paper,
} from '@mui/material';
import {
  Flight,
  Hotel,
  Attractions,
  Event,
  ShoppingBag,
  Sell,
  AccessTime,
} from '@mui/icons-material';
import { getMyChats, type QuicketChat } from '../services/quicketApi';
import { useNavigate } from 'react-router-dom';

const typeIcons: Record<string, React.ReactElement> = {
  flight: <Flight />,
  hotel: <Hotel />,
  attraction: <Attractions />,
  event: <Event />,
};

const statusColors: Record<
  string,
  'default' | 'primary' | 'success' | 'error' | 'warning'
> = {
  pending: 'warning',
  accepted: 'success',
  declined: 'error',
  completed: 'default',
};

export default function QuicketChats() {
  const navigate = useNavigate();
  const [chats, setChats] = useState<QuicketChat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadChats();
  }, []);

  const loadChats = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getMyChats();
      // Backend returns { chats: [...] }, extract the array
      setChats(Array.isArray(data) ? data : data.chats || []);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load chats');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  if (loading) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        minHeight="400px"
      >
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ mb: 2 }}>
        {error}
      </Alert>
    );
  }

  if (chats.length === 0) {
    return (
      <Box textAlign="center" py={8}>
        <Typography variant="h6" color="text.secondary" gutterBottom>
          No conversations yet
        </Typography>
        <Typography variant="body2" color="text.secondary" mb={3}>
          Like items you're interested in to start chatting with sellers
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        Your Conversations ({chats.length})
      </Typography>

      <List sx={{ bgcolor: 'background.paper' }}>
        {chats.map((chat, index) => (
          <Box key={chat._id}>
            <ListItem disablePadding>
              <ListItemButton
                onClick={() =>
                  chat.item && navigate(`/quicket/item/${chat.itemId}`)
                }
                sx={{
                  py: 2,
                  '&:hover': {
                    bgcolor: 'action.hover',
                  },
                }}
              >
                <ListItemAvatar>
                  <Avatar
                    sx={{
                      bgcolor: chat.isSeller
                        ? 'success.light'
                        : 'primary.light',
                    }}
                  >
                    {chat.isSeller ? <Sell /> : <ShoppingBag />}
                  </Avatar>
                </ListItemAvatar>

                <ListItemText
                  primary={
                    <Box display="flex" alignItems="center" gap={1} mb={0.5}>
                      {chat.item && typeIcons[chat.item.type]}
                      <Typography variant="subtitle1" component="span">
                        {chat.item?.title || 'Item not found'}
                      </Typography>
                      <Chip
                        label={chat.isSeller ? 'Selling' : 'Buying'}
                        size="small"
                        color={chat.isSeller ? 'success' : 'primary'}
                        sx={{ marginInlineStart: 'auto' }}
                      />
                    </Box>
                  }
                  secondary={
                    <Box>
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          mb: 0.5,
                        }}
                      >
                        {chat.lastMessage
                          ? `${chat.lastMessage.text}`
                          : 'No messages yet'}
                      </Typography>
                      <Box
                        display="flex"
                        alignItems="center"
                        gap={1}
                        flexWrap="wrap"
                      >
                        <Chip
                          label={chat.status}
                          size="small"
                          color={statusColors[chat.status]}
                          sx={{ textTransform: 'capitalize' }}
                        />
                        {chat.item && (
                          <Typography variant="caption" color="text.secondary">
                            ${chat.item.priceSelling} {chat.item.currency}
                          </Typography>
                        )}
                        <Box
                          display="flex"
                          alignItems="center"
                          gap={0.5}
                          ml="auto"
                        >
                          <AccessTime sx={{ fontSize: 14 }} color="action" />
                          <Typography variant="caption" color="text.secondary">
                            {formatDate(chat.updatedAt)}
                          </Typography>
                        </Box>
                      </Box>
                    </Box>
                  }
                />
              </ListItemButton>
            </ListItem>
            {index < chats.length - 1 && <Divider />}
          </Box>
        ))}
      </List>
    </Box>
  );
}
