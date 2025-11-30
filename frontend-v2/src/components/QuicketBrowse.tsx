import { useState, useEffect } from 'react';
import {
  Box,
  Grid,
  TextField,
  MenuItem,
  Button,
  Card,
  CardContent,
  CardActions,
  Typography,
  Chip,
  IconButton,
  Stack,
  Divider,
  CircularProgress,
  Alert,
  InputAdornment,
  FormControl,
  InputLabel,
  Select,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import {
  Favorite,
  FavoriteBorder,
  Visibility,
  Flight,
  Hotel,
  Attractions,
  Event,
  Search,
  Clear,
  Bookmark,
} from '@mui/icons-material';
import {
  getQuicketItems,
  likeQuicketItem,
  unlikeQuicketItem,
  saveSearch,
  expressInterest,
  type QuicketItem,
  type QuicketFilters,
} from '../services/quicketApi';
import { useNavigate } from 'react-router-dom';
import CreateQuicketItem from './CreateQuicketItem';

const typeIcons = {
  flight: <Flight />,
  hotel: <Hotel />,
  attraction: <Attractions />,
  event: <Event />,
};

export default function QuicketBrowse() {
  const navigate = useNavigate();
  const [items, setItems] = useState<QuicketItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [likedItems, setLikedItems] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [saveSearchDialogOpen, setSaveSearchDialogOpen] = useState(false);
  const [searchName, setSearchName] = useState('');
  const [savingSearch, setSavingSearch] = useState(false);

  // Filters
  const [filters, setFilters] = useState<QuicketFilters>({
    type: '',
    minPrice: undefined,
    maxPrice: undefined,
    destination: '',
    startDate: '',
    endDate: '',
    sort: 'newest',
    page: 1,
    limit: 12,
  });

  useEffect(() => {
    loadItems();
  }, [filters.page]);

  const loadItems = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await getQuicketItems(filters);
      setItems(response.items || []);
      setTotalPages(response.pagination?.pages || 1);
      setLoading(false);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load items');
      setLoading(false);
    }
  };

  const handleFilterChange = (key: keyof QuicketFilters, value: any) => {
    setFilters((prev) => ({ ...prev, [key]: value, page: 1 }));
    setPage(1);
  };

  const handleSearch = () => {
    loadItems();
  };

  const handleClearFilters = () => {
    setFilters({
      type: '',
      minPrice: undefined,
      maxPrice: undefined,
      destination: '',
      startDate: '',
      endDate: '',
      sort: 'newest',
      page: 1,
      limit: 12,
    });
    setPage(1);
  };

  const handleLike = async (itemId: string, isLiked: boolean) => {
    try {
      if (isLiked) {
        await unlikeQuicketItem(itemId);
        setLikedItems((prev) => {
          const newSet = new Set(prev);
          newSet.delete(itemId);
          return newSet;
        });
      } else {
        // Like the item
        await likeQuicketItem(itemId);
        setLikedItems((prev) => new Set(prev).add(itemId));

        // Also express interest (create chat with seller)
        try {
          await expressInterest(itemId);
          // Show success message
          alert(
            'Item liked! A chat has been created with the seller. Check the item details to start chatting.'
          );
        } catch (interestErr: any) {
          // If chat already exists or user is the seller, just ignore the error
          console.log(
            'Interest expression result:',
            interestErr.response?.data
          );
        }
      }
      // Refresh items to update like counts
      loadItems();
    } catch (err: any) {
      console.error('Failed to like/unlike item:', err);
      alert(err.response?.data?.error || 'Failed to like item');
    }
  };

  const handleSaveSearch = async () => {
    if (!searchName.trim()) {
      return;
    }

    try {
      setSavingSearch(true);
      await saveSearch(searchName, filters);
      setSaveSearchDialogOpen(false);
      setSearchName('');
      alert(
        "Search saved successfully! You'll be notified of new matching items."
      );
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to save search');
    } finally {
      setSavingSearch(false);
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

  return (
    <Box>
      {/* Header with Create Button */}
      <Box
        display="flex"
        justifyContent="space-between"
        alignItems="center"
        mb={2}
      >
        <Typography variant="h5">Browse Marketplace</Typography>
        <Button
          variant="contained"
          startIcon={<Flight />}
          onClick={() => setCreateDialogOpen(true)}
        >
          Sell Item
        </Button>
      </Box>

      {/* Filters */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Filters
          </Typography>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6} md={3}>
              <FormControl fullWidth size="small">
                <InputLabel>Type</InputLabel>
                <Select
                  value={filters.type}
                  label="Type"
                  onChange={(e) => handleFilterChange('type', e.target.value)}
                >
                  <MenuItem value="">All Types</MenuItem>
                  <MenuItem value="flight">Flights</MenuItem>
                  <MenuItem value="hotel">Hotels</MenuItem>
                  <MenuItem value="attraction">Attractions</MenuItem>
                  <MenuItem value="event">Events</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12} sm={6} md={3}>
              <TextField
                fullWidth
                size="small"
                label="Destination"
                value={filters.destination}
                onChange={(e) =>
                  handleFilterChange('destination', e.target.value)
                }
                placeholder="City or location"
              />
            </Grid>

            <Grid item xs={12} sm={6} md={3}>
              <TextField
                fullWidth
                size="small"
                type="number"
                label="Min Price"
                value={filters.minPrice || ''}
                onChange={(e) =>
                  handleFilterChange(
                    'minPrice',
                    e.target.value ? parseFloat(e.target.value) : undefined
                  )
                }
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">$</InputAdornment>
                  ),
                }}
              />
            </Grid>

            <Grid item xs={12} sm={6} md={3}>
              <TextField
                fullWidth
                size="small"
                type="number"
                label="Max Price"
                value={filters.maxPrice || ''}
                onChange={(e) =>
                  handleFilterChange(
                    'maxPrice',
                    e.target.value ? parseFloat(e.target.value) : undefined
                  )
                }
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">$</InputAdornment>
                  ),
                }}
              />
            </Grid>

            <Grid item xs={12} sm={6} md={3}>
              <TextField
                fullWidth
                size="small"
                type="date"
                label="Start Date"
                value={filters.startDate}
                onChange={(e) =>
                  handleFilterChange('startDate', e.target.value)
                }
                InputLabelProps={{ shrink: true }}
              />
            </Grid>

            <Grid item xs={12} sm={6} md={3}>
              <TextField
                fullWidth
                size="small"
                type="date"
                label="End Date"
                value={filters.endDate}
                onChange={(e) => handleFilterChange('endDate', e.target.value)}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>

            <Grid item xs={12} sm={6} md={3}>
              <FormControl fullWidth size="small">
                <InputLabel>Sort By</InputLabel>
                <Select
                  value={filters.sort}
                  label="Sort By"
                  onChange={(e) => handleFilterChange('sort', e.target.value)}
                >
                  <MenuItem value="newest">Newest First</MenuItem>
                  <MenuItem value="oldest">Oldest First</MenuItem>
                  <MenuItem value="priceLow">Price: Low to High</MenuItem>
                  <MenuItem value="priceHigh">Price: High to Low</MenuItem>
                  <MenuItem value="popular">Most Popular</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12}>
              <Stack direction="row" spacing={1} justifyContent="flex-end">
                <Button
                  variant="contained"
                  startIcon={<Search />}
                  onClick={handleSearch}
                >
                  Search
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<Clear />}
                  onClick={handleClearFilters}
                >
                  Clear
                </Button>
                <Button
                  variant="outlined"
                  color="secondary"
                  startIcon={<Bookmark />}
                  onClick={() => setSaveSearchDialogOpen(true)}
                >
                  Save Search
                </Button>
              </Stack>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Results */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Box display="flex" justifyContent="center" py={8}>
          <CircularProgress />
        </Box>
      ) : items.length === 0 ? (
        <Alert severity="info">
          No items found. Try adjusting your filters or check back later.
        </Alert>
      ) : (
        <>
          <Grid container spacing={2}>
            {items.map((item) => (
              <Grid item xs={12} sm={6} md={4} lg={3} key={item._id}>
                <Card
                  sx={{
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    cursor: 'pointer',
                    '&:hover': {
                      boxShadow: 4,
                      transform: 'translateY(-2px)',
                      transition: 'all 0.2s',
                    },
                  }}
                  onClick={() => navigate(`/quicket/item/${item._id}`)}
                >
                  {/* Place Photo if available */}
                  {item.metadata?.photoUrl && (
                    <Box
                      component="img"
                      src={item.metadata.photoUrl}
                      alt={item.title}
                      sx={{
                        width: '100%',
                        height: 160,
                        objectFit: 'cover',
                      }}
                    />
                  )}

                  <CardContent sx={{ flexGrow: 1, pb: 1 }}>
                    <Stack
                      direction="row"
                      justifyContent="space-between"
                      alignItems="start"
                      mb={1}
                    >
                      <Chip
                        icon={typeIcons[item.type]}
                        label={item.type}
                        size="small"
                        color="primary"
                        variant="outlined"
                      />
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleLike(item._id, likedItems.has(item._id));
                        }}
                      >
                        {likedItems.has(item._id) ? (
                          <Favorite color="error" />
                        ) : (
                          <FavoriteBorder />
                        )}
                      </IconButton>
                    </Stack>

                    <Typography variant="h6" gutterBottom noWrap>
                      {item.title}
                    </Typography>

                    {item.metadata?.placeRating && (
                      <Chip
                        label={`⭐ ${item.metadata.placeRating}`}
                        size="small"
                        sx={{ mb: 1 }}
                      />
                    )}

                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        mb: 2,
                        minHeight: 40,
                      }}
                    >
                      {item.description || 'No description'}
                    </Typography>

                    {item.location && (
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        display="block"
                        mb={1}
                      >
                        📍 {item.location}
                      </Typography>
                    )}

                    {item.startDatetime && (
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        display="block"
                        mb={1}
                      >
                        📅 {formatDate(item.startDatetime)}
                      </Typography>
                    )}

                    <Divider sx={{ my: 1 }} />

                    <Stack
                      direction="row"
                      justifyContent="space-between"
                      alignItems="center"
                    >
                      <Box>
                        {item.priceOriginal &&
                          item.priceOriginal > item.priceSelling && (
                            <Typography
                              variant="caption"
                              sx={{
                                textDecoration: 'line-through',
                                color: 'text.disabled',
                              }}
                            >
                              {formatPrice(item.priceOriginal, item.currency)}
                            </Typography>
                          )}
                        <Typography
                          variant="h6"
                          color="primary.main"
                          fontWeight="bold"
                        >
                          {formatPrice(item.priceSelling, item.currency)}
                        </Typography>
                      </Box>

                      <Stack direction="row" spacing={1} alignItems="center">
                        <Visibility fontSize="small" color="action" />
                        <Typography variant="caption" color="text.secondary">
                          {item.viewsCount || 0}
                        </Typography>
                        <Favorite fontSize="small" color="action" />
                        <Typography variant="caption" color="text.secondary">
                          {item.likedCount || 0}
                        </Typography>
                      </Stack>
                    </Stack>

                    {item.metadata?.canChangeName && (
                      <Chip
                        label="Name Change Allowed"
                        size="small"
                        color="success"
                        sx={{ mt: 1 }}
                      />
                    )}
                  </CardContent>

                  <CardActions sx={{ pt: 0, px: 2, pb: 2 }}>
                    <Button
                      fullWidth
                      variant="contained"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/quicket/item/${item._id}`);
                      }}
                    >
                      View Details
                    </Button>
                  </CardActions>
                </Card>
              </Grid>
            ))}
          </Grid>

          {/* Pagination */}
          {totalPages > 1 && (
            <Box display="flex" justifyContent="center" mt={4}>
              <Button
                disabled={page === 1}
                onClick={() => {
                  const newPage = page - 1;
                  setPage(newPage);
                  handleFilterChange('page', newPage);
                }}
              >
                Previous
              </Button>
              <Typography sx={{ mx: 2, alignSelf: 'center' }}>
                Page {page} of {totalPages}
              </Typography>
              <Button
                disabled={page === totalPages}
                onClick={() => {
                  const newPage = page + 1;
                  setPage(newPage);
                  handleFilterChange('page', newPage);
                }}
              >
                Next
              </Button>
            </Box>
          )}
        </>
      )}

      {/* Create Item Dialog */}
      <CreateQuicketItem
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        onSuccess={() => {
          setCreateDialogOpen(false);
          loadItems(); // Refresh items list
        }}
      />

      {/* Save Search Dialog */}
      <Dialog
        open={saveSearchDialogOpen}
        onClose={() => !savingSearch && setSaveSearchDialogOpen(false)}
      >
        <DialogTitle>Save Search</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Give this search a name to save it and get notified when new items
            match your criteria.
          </Typography>
          <TextField
            fullWidth
            autoFocus
            margin="dense"
            label="Search Name"
            placeholder="e.g., Cheap Flights to NYC"
            value={searchName}
            onChange={(e) => setSearchName(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSaveSearch()}
          />
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setSaveSearchDialogOpen(false)}
            disabled={savingSearch}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSaveSearch}
            variant="contained"
            disabled={!searchName.trim() || savingSearch}
            startIcon={
              savingSearch ? <CircularProgress size={20} /> : <Bookmark />
            }
          >
            {savingSearch ? 'Saving...' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
