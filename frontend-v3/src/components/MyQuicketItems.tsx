import { useState, useEffect } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  CardActions,
  Typography,
  Chip,
  Button,
  IconButton,
  Alert,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Stack,
  Divider,
} from '@mui/material';
import {
  Edit,
  Delete,
  Visibility,
  Favorite,
  Chat,
  CheckCircle,
  Flight,
  Hotel,
  Attractions,
  Event,
} from '@mui/icons-material';
import {
  getMyItems,
  deleteQuicketItem,
  type QuicketItem,
} from '../services/quicketApi';
import { useNavigate } from 'react-router-dom';

const typeIcons: Record<string, React.ReactElement> = {
  flight: <Flight />,
  hotel: <Hotel />,
  attraction: <Attractions />,
  event: <Event />,
};

export default function MyQuicketItems() {
  const navigate = useNavigate();
  const [items, setItems] = useState<QuicketItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    loadMyItems();
  }, []);

  const loadMyItems = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getMyItems();
      // Backend returns { items: [...] }, extract the array
      setItems(Array.isArray(data) ? data : data.items || []);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load your items');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClick = (itemId: string) => {
    setItemToDelete(itemId);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!itemToDelete) return;

    try {
      setDeleting(true);
      await deleteQuicketItem(itemToDelete);
      setDeleteDialogOpen(false);
      setItemToDelete(null);
      loadMyItems(); // Refresh list
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to delete item');
    } finally {
      setDeleting(false);
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
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
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

  if (items.length === 0) {
    return (
      <Box textAlign="center" py={8}>
        <Typography variant="h6" color="text.secondary" gutterBottom>
          You haven't listed any items yet
        </Typography>
        <Typography variant="body2" color="text.secondary" mb={3}>
          Start selling by clicking the "Sell Item" button in the Browse tab
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Box
        display="flex"
        justifyContent="space-between"
        alignItems="center"
        mb={2}
      >
        <Typography variant="h6">My Items ({items.length})</Typography>
      </Box>

      <Grid container spacing={2}>
        {items.map((item) => {
          const savings = item.priceOriginal
            ? Math.round(
                ((item.priceOriginal - item.priceSelling) /
                  item.priceOriginal) *
                  100
              )
            : 0;

          return (
            <Grid item xs={12} sm={6} md={4} key={item._id}>
              <Card
                sx={{
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  position: 'relative',
                  '&:hover': {
                    boxShadow: 4,
                  },
                }}
              >
                {/* Status Indicator */}
                {!item.isActive && (
                  <Chip
                    label="Inactive"
                    size="small"
                    color="default"
                    sx={{ position: 'absolute', top: 8, right: 8, zIndex: 1 }}
                  />
                )}

                <CardContent sx={{ flexGrow: 1 }}>
                  {/* Type Chip */}
                  <Chip
                    label={item.type}
                    size="small"
                    color="primary"
                    sx={{ mb: 1, textTransform: 'capitalize' }}
                  />

                  {/* Title */}
                  <Typography variant="h6" gutterBottom noWrap>
                    {item.title}
                  </Typography>

                  {/* Description */}
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{
                      mb: 2,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                    }}
                  >
                    {item.description || 'No description'}
                  </Typography>

                  {/* Location & Date */}
                  {item.location && (
                    <Typography
                      variant="caption"
                      display="block"
                      color="text.secondary"
                    >
                      📍 {item.location}
                    </Typography>
                  )}
                  {item.startDatetime && (
                    <Typography
                      variant="caption"
                      display="block"
                      color="text.secondary"
                      mb={1}
                    >
                      📅 {formatDate(item.startDatetime)}
                    </Typography>
                  )}

                  <Divider sx={{ my: 1 }} />

                  {/* Price */}
                  <Box mb={1} display="flex" alignItems="center" gap={1}>
                    {item.priceOriginal &&
                      item.priceOriginal > item.priceSelling && (
                        <Typography
                          variant="caption"
                          sx={{
                            textDecoration: 'line-through',
                            color: 'text.secondary',
                          }}
                        >
                          {formatPrice(item.priceOriginal, item.currency)}
                        </Typography>
                      )}
                    <Typography
                      variant="h6"
                      component="span"
                      color="success.main"
                    >
                      {formatPrice(item.priceSelling, item.currency)}
                    </Typography>
                    {savings > 0 && (
                      <Chip
                        label={`${savings}% off`}
                        size="small"
                        color="success"
                      />
                    )}
                  </Box>

                  {/* Stats */}
                  <Stack direction="row" spacing={2} mt={2}>
                    <Box display="flex" alignItems="center" gap={0.5}>
                      <Visibility fontSize="small" color="action" />
                      <Typography variant="caption">
                        {item.viewsCount || 0}
                      </Typography>
                    </Box>
                    <Box display="flex" alignItems="center" gap={0.5}>
                      <Favorite fontSize="small" color="action" />
                      <Typography variant="caption">
                        {item.likedCount || 0}
                      </Typography>
                    </Box>
                    <Box display="flex" alignItems="center" gap={0.5}>
                      <Chat fontSize="small" color="action" />
                      <Typography variant="caption">
                        {item.chatCount || 0}
                      </Typography>
                    </Box>
                  </Stack>
                </CardContent>

                <CardActions
                  sx={{ justifyContent: 'space-between', px: 2, pb: 2 }}
                >
                  <Box>
                    <Button
                      size="small"
                      startIcon={<Edit />}
                      onClick={() => navigate(`/quicket/item/${item._id}`)}
                    >
                      View
                    </Button>
                  </Box>
                  <IconButton
                    size="small"
                    color="error"
                    onClick={() => handleDeleteClick(item._id)}
                  >
                    <Delete />
                  </IconButton>
                </CardActions>
              </Card>
            </Grid>
          );
        })}
      </Grid>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => !deleting && setDeleteDialogOpen(false)}
      >
        <DialogTitle>Delete Item?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete this item? This action cannot be
            undone. Any active chats will be closed.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setDeleteDialogOpen(false)}
            disabled={deleting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleDeleteConfirm}
            color="error"
            variant="contained"
            disabled={deleting}
            startIcon={deleting ? <CircularProgress size={20} /> : <Delete />}
          >
            {deleting ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
