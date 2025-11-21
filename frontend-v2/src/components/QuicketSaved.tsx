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
  Tabs,
  Tab,
  List,
  ListItem,
  ListItemText,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Stack,
  Divider,
} from '@mui/material';
import {
  Favorite,
  Visibility,
  Delete,
  Search,
  Flight,
  Hotel,
  Attractions,
  Event,
} from '@mui/icons-material';
import {
  getLikedItems,
  getSavedSearches,
  deleteSavedSearch,
  unlikeQuicketItem,
  type QuicketItem,
  type SavedSearch,
} from '../services/quicketApi';
import { useNavigate } from 'react-router-dom';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`saved-tabpanel-${index}`}
      aria-labelledby={`saved-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ py: 2 }}>{children}</Box>}
    </div>
  );
}

export default function QuicketSaved() {
  const navigate = useNavigate();
  const [currentTab, setCurrentTab] = useState(0);
  const [likedItems, setLikedItems] = useState<QuicketItem[]>([]);
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{
    type: 'item' | 'search';
    id: string;
  } | null>(null);

  useEffect(() => {
    loadData();
  }, [currentTab]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      if (currentTab === 0) {
        const data = await getLikedItems();
        // Backend returns { items: [...] }, extract the array
        setLikedItems(Array.isArray(data) ? data : data.items || []);
      } else {
        const data = await getSavedSearches();
        // Backend returns { searches: [...] }, extract the array
        setSavedSearches(Array.isArray(data) ? data : data.searches || []);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClick = (type: 'item' | 'search', id: string) => {
    setItemToDelete({ type, id });
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!itemToDelete) return;

    try {
      if (itemToDelete.type === 'item') {
        await unlikeQuicketItem(itemToDelete.id);
        setLikedItems((prev) =>
          prev.filter((item) => item._id !== itemToDelete.id)
        );
      } else {
        await deleteSavedSearch(itemToDelete.id);
        setSavedSearches((prev) =>
          prev.filter((search) => search._id !== itemToDelete.id)
        );
      }
      setDeleteDialogOpen(false);
      setItemToDelete(null);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to delete');
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
      <Tabs
        value={currentTab}
        onChange={(_, newValue) => setCurrentTab(newValue)}
        sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}
      >
        <Tab
          icon={<Favorite />}
          iconPosition="start"
          label={`Liked Items (${likedItems.length})`}
        />
        <Tab
          icon={<Search />}
          iconPosition="start"
          label={`Saved Searches (${savedSearches.length})`}
        />
      </Tabs>

      {/* Liked Items Tab */}
      <TabPanel value={currentTab} index={0}>
        {loading ? (
          <Box display="flex" justifyContent="center" py={4}>
            <CircularProgress />
          </Box>
        ) : error ? (
          <Alert severity="error">{error}</Alert>
        ) : likedItems.length === 0 ? (
          <Box textAlign="center" py={8}>
            <Typography variant="h6" color="text.secondary" gutterBottom>
              No liked items yet
            </Typography>
            <Typography variant="body2" color="text.secondary" mb={3}>
              Start exploring items in the Browse tab and like the ones you're
              interested in
            </Typography>
            <Button variant="contained" onClick={() => navigate('/quicket')}>
              Browse Items
            </Button>
          </Box>
        ) : (
          <Grid container spacing={2}>
            {likedItems.map((item) => {
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
                      cursor: 'pointer',
                      '&:hover': {
                        boxShadow: 4,
                      },
                    }}
                    onClick={() => navigate(`/quicket/item/${item._id}`)}
                  >
                    <CardContent sx={{ flexGrow: 1 }}>
                      <Chip
                        label={item.type}
                        size="small"
                        color="primary"
                        sx={{ mb: 1, textTransform: 'capitalize' }}
                      />

                      <Typography variant="h6" gutterBottom noWrap>
                        {item.title}
                      </Typography>

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

                      <Box mb={1}>
                        {item.priceOriginal &&
                          item.priceOriginal > item.priceSelling && (
                            <Typography
                              variant="caption"
                              sx={{
                                textDecoration: 'line-through',
                                color: 'text.secondary',
                                mr: 1,
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
                            sx={{ ml: 1 }}
                          />
                        )}
                      </Box>

                      <Stack direction="row" spacing={2} mt={2}>
                        <Box display="flex" alignItems="center" gap={0.5}>
                          <Visibility fontSize="small" color="action" />
                          <Typography variant="caption">
                            {item.viewsCount || 0}
                          </Typography>
                        </Box>
                        <Box display="flex" alignItems="center" gap={0.5}>
                          <Favorite fontSize="small" color="error" />
                          <Typography variant="caption">
                            {item.likedCount || 0}
                          </Typography>
                        </Box>
                      </Stack>
                    </CardContent>

                    <CardActions
                      sx={{ justifyContent: 'space-between', px: 2, pb: 2 }}
                    >
                      <Button
                        size="small"
                        onClick={() => navigate(`/quicket/item/${item._id}`)}
                      >
                        View Details
                      </Button>
                      <IconButton
                        size="small"
                        color="error"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteClick('item', item._id);
                        }}
                      >
                        <Delete />
                      </IconButton>
                    </CardActions>
                  </Card>
                </Grid>
              );
            })}
          </Grid>
        )}
      </TabPanel>

      {/* Saved Searches Tab */}
      <TabPanel value={currentTab} index={1}>
        {loading ? (
          <Box display="flex" justifyContent="center" py={4}>
            <CircularProgress />
          </Box>
        ) : error ? (
          <Alert severity="error">{error}</Alert>
        ) : savedSearches.length === 0 ? (
          <Box textAlign="center" py={8}>
            <Typography variant="h6" color="text.secondary" gutterBottom>
              No saved searches yet
            </Typography>
            <Typography variant="body2" color="text.secondary" mb={3}>
              Save your search criteria from the Browse tab to get notified of
              new matching items
            </Typography>
            <Button variant="contained" onClick={() => navigate('/quicket')}>
              Browse & Save Searches
            </Button>
          </Box>
        ) : (
          <List>
            {savedSearches.map((search) => (
              <Card key={search._id} sx={{ mb: 2 }}>
                <ListItem
                  secondaryAction={
                    <IconButton
                      edge="end"
                      color="error"
                      onClick={() => handleDeleteClick('search', search._id)}
                    >
                      <Delete />
                    </IconButton>
                  }
                >
                  <ListItemText
                    primary={
                      <Box display="flex" alignItems="center" gap={1}>
                        <Search color="primary" />
                        <Typography variant="h6">{search.name}</Typography>
                      </Box>
                    }
                    secondary={
                      <Box mt={1}>
                        <Stack direction="row" spacing={1} flexWrap="wrap">
                          {search.filters.type && (
                            <Chip
                              label={`Type: ${search.filters.type}`}
                              size="small"
                              sx={{ textTransform: 'capitalize' }}
                            />
                          )}
                          {search.filters.destination && (
                            <Chip
                              label={`Dest: ${search.filters.destination}`}
                              size="small"
                            />
                          )}
                          {search.filters.minPrice && (
                            <Chip
                              label={`Min: $${search.filters.minPrice}`}
                              size="small"
                            />
                          )}
                          {search.filters.maxPrice && (
                            <Chip
                              label={`Max: $${search.filters.maxPrice}`}
                              size="small"
                            />
                          )}
                        </Stack>
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          display="block"
                          mt={1}
                        >
                          Saved {formatDate(search.createdAt)}
                        </Typography>
                      </Box>
                    }
                  />
                </ListItem>
              </Card>
            ))}
          </List>
        )}
      </TabPanel>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
      >
        <DialogTitle>
          {itemToDelete?.type === 'item'
            ? 'Remove from Liked Items?'
            : 'Delete Saved Search?'}
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            {itemToDelete?.type === 'item'
              ? 'This will remove the item from your liked list.'
              : 'This will permanently delete this saved search and stop notifications.'}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={handleDeleteConfirm}
            color="error"
            variant="contained"
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
