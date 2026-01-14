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
import ChatWindow from '../components/ChatWindow';

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
              {/* Place Photo if available */}
              {item.metadata?.photoUrl && (
                <Box
                  component="img"
                  src={item.metadata.photoUrl}
                  alt={item.title}
                  sx={{
                    width: '100%',
                    height: 300,
                    objectFit: 'cover',
                  }}
                />
              )}

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

                {item.metadata?.placeRating && (
                  <Chip
                    label={`⭐ ${item.metadata.placeRating}`}
                    size="small"
                    color="primary"
                    variant="outlined"
                    sx={{ mb: 2 }}
                  />
                )}

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
                      <Stack
                        direction="row"
                        spacing={1}
                        flexWrap="wrap"
                        sx={{ gap: 1 }}
                      >
                        {item.metadata.canChangeName && (
                          <Chip
                            label="✓ Name Change Allowed"
                            color="success"
                            size="small"
                          />
                        )}
                        {item.metadata.mealPlan && (
                          <Chip
                            label={`Meal Plan: ${item.metadata.mealPlan}`}
                            size="small"
                          />
                        )}
                      </Stack>
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

                {!item.isSeller && !showChat && (
                  <Button
                    fullWidth
                    variant="contained"
                    size="large"
                    onClick={handleExpressInterest}
                  >
                    I'm Interested
                  </Button>
                )}

                {item.isSeller && (
                  <Alert severity="info">This is your listing</Alert>
                )}
              </CardContent>
            </Card>

            {/* Chat Window - Now using reusable draggable component */}
            {showChat && chat && (
              <ChatWindow
                chatId={chat._id}
                onClose={() => setShowChat(false)}
                initialPosition={{ x: window.innerWidth - 450, y: 100 }}
                contextType="quicket_item"
              />
            )}
          </Grid>
        </Grid>
      </Box>
    </Container>
  );
}
