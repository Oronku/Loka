import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Container,
  Card,
  CardContent,
  Typography,
  Button,
  Chip,
  Grid,
  Stack,
  Divider,
  CircularProgress,
  Alert,
  Paper,
  TextField,
  IconButton,
  Avatar,
  Rating,
} from '@mui/material';
import {
  ArrowBack,
  Favorite,
  FavoriteBorder,
  Flight,
  Hotel,
  Attractions,
  Event,
  Person,
  Star,
  Send,
  Close,
  Check,
} from '@mui/icons-material';
import {
  getQuicketItem,
  expressInterest,
  getChat,
  sendMessage,
  updateChatStatus,
  likeQuicketItem,
  unlikeQuicketItem,
  getMyChats,
  type QuicketItem,
  type QuicketChat,
  type QuicketMessage,
} from '../services/quicketApi';
import { useAuth } from '../context/AuthContext';

const typeIcons: Record<string, React.ReactNode> = {
  flight: <Flight />,
  hotel: <Hotel />,
  attraction: <Attractions />,
  event: <Event />,
};

export default function QuicketItemDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [item, setItem] = useState<QuicketItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isLiked, setIsLiked] = useState(false);

  // Chat state
  const [showChat, setShowChat] = useState(false);
  const [chat, setChat] = useState<QuicketChat | null>(null);
  const [messages, setMessages] = useState<QuicketMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);

  useEffect(() => {
    if (id) {
      loadItem();
    }
  }, [id]);

  const loadItem = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getQuicketItem(id!);
      setItem(data);

      // Check if user has an existing chat for this item
      await checkExistingChat();

      setLoading(false);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load item');
      setLoading(false);
    }
  };

  const checkExistingChat = async () => {
    try {
      // Get all user's chats and find one for this item
      const response = await getMyChats();
      const allChats = Array.isArray(response)
        ? response
        : response.chats || [];
      const existingChat = allChats.find((c: any) => c.itemId === id);

      if (existingChat) {
        // Load the chat and show it
        setChat(existingChat);
        setShowChat(true);
        loadChatMessages(existingChat._id);
      }
    } catch (err: any) {
      // If there's no chat or error, just continue without showing chat
      console.log('No existing chat found or error:', err);
    }
  };

  const handleExpressInterest = async () => {
    try {
      const response = await expressInterest(id!);
      setChat(response.chat);
      setShowChat(true);
      // Load chat messages
      loadChatMessages(response.chatId);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to express interest');
    }
  };

  const loadChatMessages = async (chatId: string) => {
    try {
      const response = await getChat(chatId);
      setChat(response.chat);
      setMessages(response.messages || []);
    } catch (err: any) {
      console.error('Failed to load chat:', err);
    }
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !chat) return;

    try {
      setSendingMessage(true);
      await sendMessage(chat._id, newMessage);
      setNewMessage('');
      // Reload messages
      loadChatMessages(chat._id);
      setSendingMessage(false);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to send message');
      setSendingMessage(false);
    }
  };

  const handleChatStatusChange = async (status: QuicketChat['status']) => {
    if (!chat) return;

    try {
      await updateChatStatus(chat._id, status);
      setChat({ ...chat, status });
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to update chat status');
    }
  };

  const handleLike = async () => {
    try {
      if (isLiked) {
        await unlikeQuicketItem(id!);
        setIsLiked(false);
      } else {
        await likeQuicketItem(id!);
        setIsLiked(true);

        // Also express interest (create chat with seller)
        if (!chat) {
          try {
            const response = await expressInterest(id!);
            setChat(response.chat);
            setShowChat(true);
            loadChatMessages(response.chatId);
          } catch (interestErr: any) {
            // If chat already exists or user is the seller, just log it
            console.log(
              'Interest expression result:',
              interestErr.response?.data
            );
          }
        }
      }
      loadItem();
    } catch (err: any) {
      console.error('Failed to like/unlike:', err);
    }
  };

  const formatPrice = (price: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
    }).format(price);
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getDisplayName = (email: string) => {
    // Extract first name from email (before @ or before any numbers)
    const beforeAt = email.split('@')[0];
    // Remove numbers and special characters, keep only letters
    const firstName = beforeAt.replace(/[0-9_\-\.]/g, '');
    // Capitalize first letter
    return firstName.charAt(0).toUpperCase() + firstName.slice(1);
  };

  if (loading) {
    return (
      <Container maxWidth="lg">
        <Box display="flex" justifyContent="center" py={8}>
          <CircularProgress />
        </Box>
      </Container>
    );
  }

  if (error || !item) {
    return (
      <Container maxWidth="lg">
        <Box py={4}>
          <Alert severity="error">{error || 'Item not found'}</Alert>
          <Button
            startIcon={<ArrowBack />}
            onClick={() => navigate('/quicket')}
            sx={{ mt: 2 }}
          >
            Back to Quicket
          </Button>
        </Box>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg">
      <Box py={4}>
        <Button
          startIcon={<ArrowBack />}
          onClick={() => navigate('/quicket')}
          sx={{ mb: 3 }}
        >
          Back to Browse
        </Button>

        <Grid container spacing={3}>
          {/* Main Item Details */}
          <Grid item xs={12} md={8}>
            <Card>
              <CardContent>
                <Stack
                  direction="row"
                  justifyContent="space-between"
                  alignItems="start"
                  mb={2}
                >
                  <Chip label={item.type} color="primary" />
                  <IconButton onClick={handleLike}>
                    {isLiked ? <Favorite color="error" /> : <FavoriteBorder />}
                  </IconButton>
                </Stack>

                <Typography variant="h4" fontWeight="bold" gutterBottom>
                  {item.title}
                </Typography>

                <Stack direction="row" spacing={2} mb={3}>
                  <Chip
                    icon={<Person />}
                    label={`${item.viewsCount || 0} views`}
                    size="small"
                  />
                  <Chip
                    icon={<Favorite />}
                    label={`${item.likedCount || 0} likes`}
                    size="small"
                  />
                </Stack>

                <Typography variant="body1" paragraph>
                  {item.description}
                </Typography>

                <Divider sx={{ my: 3 }} />

                <Typography variant="h6" gutterBottom>
                  Details
                </Typography>

                <Stack spacing={2}>
                  {item.location && (
                    <Box>
                      <Typography variant="subtitle2" color="text.secondary">
                        Location
                      </Typography>
                      <Typography variant="body1">
                        📍 {item.location}
                      </Typography>
                    </Box>
                  )}

                  {item.startDatetime && (
                    <Box>
                      <Typography variant="subtitle2" color="text.secondary">
                        {item.type === 'hotel' ? 'Check-in' : 'Start Date'}
                      </Typography>
                      <Typography variant="body1">
                        📅 {formatDate(item.startDatetime)}
                      </Typography>
                    </Box>
                  )}

                  {item.endDatetime && (
                    <Box>
                      <Typography variant="subtitle2" color="text.secondary">
                        {item.type === 'hotel' ? 'Check-out' : 'End Date'}
                      </Typography>
                      <Typography variant="body1">
                        📅 {formatDate(item.endDatetime)}
                      </Typography>
                    </Box>
                  )}

                  {item.metadata && Object.keys(item.metadata).length > 0 && (
                    <Box>
                      <Typography
                        variant="subtitle2"
                        color="text.secondary"
                        gutterBottom
                      >
                        Additional Information
                      </Typography>
                      {item.metadata.canChangeName && (
                        <Chip
                          label="✓ Name Change Allowed"
                          color="success"
                          size="small"
                          sx={{ mr: 1, mb: 1 }}
                        />
                      )}
                      {item.metadata.mealPlan && (
                        <Chip
                          label={`Meal Plan: ${item.metadata.mealPlan}`}
                          size="small"
                          sx={{ mr: 1, mb: 1 }}
                        />
                      )}
                      {item.metadata.flightNumber && (
                        <Typography variant="body2">
                          Flight: {item.metadata.flightNumber}
                        </Typography>
                      )}
                      {item.metadata.airline && (
                        <Typography variant="body2">
                          Airline: {item.metadata.airline}
                        </Typography>
                      )}
                    </Box>
                  )}
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          {/* Sidebar - Price & Action */}
          <Grid item xs={12} md={4}>
            <Card sx={{ position: 'sticky', top: 20 }}>
              <CardContent>
                <Box mb={3}>
                  {item.priceOriginal &&
                    item.priceOriginal > item.priceSelling && (
                      <Typography
                        variant="h6"
                        sx={{
                          textDecoration: 'line-through',
                          color: 'text.disabled',
                        }}
                      >
                        {formatPrice(item.priceOriginal, item.currency)}
                      </Typography>
                    )}
                  <Typography
                    variant="h3"
                    color="primary.main"
                    fontWeight="bold"
                  >
                    {formatPrice(item.priceSelling, item.currency)}
                  </Typography>
                  {item.priceOriginal &&
                    item.priceOriginal > item.priceSelling && (
                      <Typography variant="body2" color="success.main">
                        Save{' '}
                        {Math.round(
                          ((item.priceOriginal - item.priceSelling) /
                            item.priceOriginal) *
                            100
                        )}
                        %
                      </Typography>
                    )}
                </Box>

                <Divider sx={{ my: 2 }} />

                {/* Seller Info */}
                <Box mb={3}>
                  <Typography
                    variant="subtitle2"
                    color="text.secondary"
                    gutterBottom
                  >
                    Seller
                  </Typography>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Avatar sx={{ width: 32, height: 32 }}>
                      <Person />
                    </Avatar>
                    <Box>
                      {item.isSeller ? (
                        <Typography variant="body2">You (Owner)</Typography>
                      ) : (
                        <>
                          <Typography variant="body2">
                            Anonymous Seller
                          </Typography>
                          {item.seller?.rating !== undefined && (
                            <Stack
                              direction="row"
                              spacing={0.5}
                              alignItems="center"
                            >
                              <Rating
                                value={item.seller.rating}
                                readOnly
                                size="small"
                                precision={0.5}
                              />
                              <Typography
                                variant="caption"
                                color="text.secondary"
                              >
                                ({item.seller.itemsSold || 0} sold)
                              </Typography>
                            </Stack>
                          )}
                        </>
                      )}
                    </Box>
                  </Stack>
                </Box>

                {!item.isSeller && (
                  <Button
                    fullWidth
                    variant="contained"
                    size="large"
                    onClick={handleExpressInterest}
                    disabled={showChat}
                  >
                    {showChat ? 'Chat Open' : "I'm Interested"}
                  </Button>
                )}

                {item.isSeller && (
                  <Alert severity="info">This is your listing</Alert>
                )}
              </CardContent>
            </Card>

            {/* Chat Panel */}
            {showChat && chat && (
              <Paper sx={{ mt: 2, p: 2 }}>
                <Stack
                  direction="row"
                  justifyContent="space-between"
                  alignItems="center"
                  mb={2}
                >
                  <Typography variant="h6">Chat</Typography>
                  <IconButton size="small" onClick={() => setShowChat(false)}>
                    <Close />
                  </IconButton>
                </Stack>

                {chat.status === 'pending' &&
                  chat.sellerId === (user as any)?.sub && (
                    <Stack direction="row" spacing={1} mb={2}>
                      <Button
                        size="small"
                        variant="contained"
                        color="success"
                        startIcon={<Check />}
                        onClick={() => handleChatStatusChange('accepted')}
                      >
                        Accept
                      </Button>
                      <Button
                        size="small"
                        variant="outlined"
                        color="error"
                        startIcon={<Close />}
                        onClick={() => handleChatStatusChange('declined')}
                      >
                        Decline
                      </Button>
                    </Stack>
                  )}

                {chat.status === 'accepted' && (
                  <Alert severity="success" sx={{ mb: 2 }}>
                    Chat accepted! You can now exchange details.
                  </Alert>
                )}

                {chat.status === 'declined' && (
                  <Alert severity="error" sx={{ mb: 2 }}>
                    This chat request was declined.
                  </Alert>
                )}

                {/* Messages */}
                <Box sx={{ maxHeight: 300, overflowY: 'auto', mb: 2 }}>
                  {messages.map((msg) => (
                    <Box
                      key={msg._id}
                      sx={{
                        mb: 1,
                        p: 1,
                        bgcolor:
                          msg.senderId === (user as any)?.sub
                            ? 'primary.50'
                            : 'grey.100',
                        borderRadius: 1,
                      }}
                    >
                      <Typography variant="caption" color="text.secondary">
                        {chat.status === 'accepted'
                          ? msg.senderEmail
                          : getDisplayName(msg.senderEmail)}{' '}
                        - {new Date(msg.timestamp).toLocaleTimeString()}
                      </Typography>
                      <Typography variant="body2">{msg.text}</Typography>
                    </Box>
                  ))}
                </Box>

                {/* Message Input */}
                {chat.status !== 'declined' && (
                  <Stack direction="row" spacing={1}>
                    <TextField
                      fullWidth
                      size="small"
                      placeholder="Type a message..."
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      onKeyPress={(e) =>
                        e.key === 'Enter' && handleSendMessage()
                      }
                      disabled={sendingMessage}
                    />
                    <IconButton
                      color="primary"
                      onClick={handleSendMessage}
                      disabled={!newMessage.trim() || sendingMessage}
                    >
                      <Send />
                    </IconButton>
                  </Stack>
                )}
              </Paper>
            )}
          </Grid>
        </Grid>
      </Box>
    </Container>
  );
}
