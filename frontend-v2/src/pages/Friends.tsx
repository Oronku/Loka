import React, { useState, useEffect } from 'react';
import {
  Box,
  Container,
  Typography,
  TextField,
  InputAdornment,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  ListItemButton,
  Avatar,
  Button,
  Badge,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  Alert,
  Tabs,
  Tab,
  Paper,
  Chip,
  Divider,
} from '@mui/material';
import {
  Search as SearchIcon,
  PersonAdd as PersonAddIcon,
  Message as MessageIcon,
  Check as CheckIcon,
  Close as CloseIcon,
  PersonRemove as PersonRemoveIcon,
} from '@mui/icons-material';
import {
  friendsApi,
  Friend,
  UserSearchResult,
  FriendRequest,
} from '../services/friendsApi';
import { chatApi } from '../services/chatApi';
import { useAuth } from '../context/AuthContext';
import { useChat } from '../context/ChatContext';

interface FriendsProps {
  onStartChat?: (friendId: string) => void;
}

const Friends: React.FC<FriendsProps> = ({ onStartChat }) => {
  const { user } = useAuth();
  const { openChat } = useChat();
  const [activeTab, setActiveTab] = useState(0); // 0 = My Friends, 1 = Requests
  const [friends, setFriends] = useState<Friend[]>([]);
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add friend dialog
  const [addFriendOpen, setAddFriendOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    loadData();
    // Update status every 30 seconds
    const interval = setInterval(() => {
      friendsApi.updateStatus();
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [friendsData, requestsData] = await Promise.all([
        friendsApi.getFriends(),
        friendsApi.getFriendRequests(),
      ]);
      setFriends(friendsData);
      setFriendRequests(requestsData);
      setError(null);
    } catch (err: any) {
      console.error('Error loading friends data:', err);
      setError(err.response?.data?.error || 'Failed to load friends');
    } finally {
      setLoading(false);
    }
  };

  const handleSearchUsers = async (query: string) => {
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }

    try {
      setSearching(true);
      const results = await friendsApi.searchUsers(query);
      setSearchResults(results);
    } catch (err: any) {
      console.error('Error searching users:', err);
      setError(err.response?.data?.error || 'Failed to search users');
    } finally {
      setSearching(false);
    }
  };

  const handleSendRequest = async (userId: string) => {
    try {
      await friendsApi.sendFriendRequest(userId);
      setSuccessMessage('Friend request sent!');
      setTimeout(() => setSuccessMessage(null), 3000);
      // Refresh search to update status
      handleSearchUsers(searchQuery);
    } catch (err: any) {
      console.error('Error sending friend request:', err);
      setError(err.response?.data?.error || 'Failed to send friend request');
    }
  };

  const handleAcceptRequest = async (requestId: string) => {
    try {
      await friendsApi.acceptFriendRequest(requestId);
      setSuccessMessage('Friend request accepted!');
      setTimeout(() => setSuccessMessage(null), 3000);
      loadData();
    } catch (err: any) {
      console.error('Error accepting request:', err);
      setError(err.response?.data?.error || 'Failed to accept request');
    }
  };

  const handleRejectRequest = async (requestId: string) => {
    try {
      await friendsApi.rejectFriendRequest(requestId);
      loadData();
    } catch (err: any) {
      console.error('Error rejecting request:', err);
      setError(err.response?.data?.error || 'Failed to reject request');
    }
  };

  const handleRemoveFriend = async (friendId: string) => {
    if (!confirm('Are you sure you want to remove this friend?')) return;

    try {
      await friendsApi.removeFriend(friendId);
      loadData();
    } catch (err: any) {
      console.error('Error removing friend:', err);
      setError(err.response?.data?.error || 'Failed to remove friend');
    }
  };

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 3,
        }}
      >
        <Typography variant="h4" component="h1">
          Friends
        </Typography>
        <Button
          variant="contained"
          startIcon={<PersonAddIcon />}
          onClick={() => setAddFriendOpen(true)}
        >
          Add Friend
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {successMessage && (
        <Alert
          severity="success"
          sx={{ mb: 2 }}
          onClose={() => setSuccessMessage(null)}
        >
          {successMessage}
        </Alert>
      )}

      <Paper sx={{ mb: 3 }}>
        <Tabs
          value={activeTab}
          onChange={(_, newValue) => setActiveTab(newValue)}
          indicatorColor="primary"
          textColor="primary"
        >
          <Tab
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                My Friends
                <Chip label={friends.length} size="small" color="primary" />
              </Box>
            }
          />
          <Tab
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                Requests
                {friendRequests.length > 0 && (
                  <Badge badgeContent={friendRequests.length} color="error" />
                )}
              </Box>
            }
          />
        </Tabs>
      </Paper>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      ) : (
        <>
          {/* My Friends Tab */}
          {activeTab === 0 && (
            <Paper>
              {friends.length === 0 ? (
                <Box sx={{ p: 4, textAlign: 'center' }}>
                  <Typography variant="body1" color="text.secondary">
                    No friends yet. Add some friends to start chatting!
                  </Typography>
                </Box>
              ) : (
                <List>
                  {friends.map((friend, index) => (
                    <React.Fragment key={friend._id}>
                      {index > 0 && <Divider />}
                      <ListItem
                        secondaryAction={
                          <Box sx={{ display: 'flex', gap: 1 }}>
                            <Button
                              variant="contained"
                              size="small"
                              startIcon={<MessageIcon />}
                              onClick={async () => {
                                try {
                                  // Create or find existing direct chat
                                  const result = await chatApi.createOrFindChat(
                                    {
                                      contextType: 'direct',
                                      contextId: [user?.id, friend._id]
                                        .sort()
                                        .join('_'),
                                      participants: [
                                        {
                                          userId: user!.id,
                                          email: user!.email,
                                          name: user!.name,
                                          role: 'friend',
                                        },
                                        {
                                          userId: friend._id,
                                          email: friend.email,
                                          name: friend.name,
                                          role: 'friend',
                                        },
                                      ],
                                    }
                                  );
                                  // Open the chat using the context
                                  openChat(result.chatId, 'direct');
                                  // Also call the optional callback if provided
                                  onStartChat?.(result.chatId);
                                } catch (err) {
                                  console.error('Error starting chat:', err);
                                  alert('Failed to start chat');
                                }
                              }}
                            >
                              Message
                            </Button>
                            <IconButton
                              edge="end"
                              aria-label="remove"
                              onClick={() => handleRemoveFriend(friend._id)}
                              color="error"
                            >
                              <PersonRemoveIcon />
                            </IconButton>
                          </Box>
                        }
                      >
                        <ListItemAvatar>
                          <Badge
                            overlap="circular"
                            anchorOrigin={{
                              vertical: 'bottom',
                              horizontal: 'right',
                            }}
                            variant="dot"
                            color={friend.isOnline ? 'success' : 'default'}
                          >
                            <Avatar src={friend.picture} alt={friend.name}>
                              {friend.name.charAt(0).toUpperCase()}
                            </Avatar>
                          </Badge>
                        </ListItemAvatar>
                        <ListItemText
                          primary={friend.name}
                          secondary={
                            friend.isOnline
                              ? 'Online'
                              : friend.lastSeen
                                ? `Last seen ${new Date(friend.lastSeen).toLocaleString()}`
                                : 'Offline'
                          }
                        />
                      </ListItem>
                    </React.Fragment>
                  ))}
                </List>
              )}
            </Paper>
          )}

          {/* Friend Requests Tab */}
          {activeTab === 1 && (
            <Paper>
              {friendRequests.length === 0 ? (
                <Box sx={{ p: 4, textAlign: 'center' }}>
                  <Typography variant="body1" color="text.secondary">
                    No pending friend requests
                  </Typography>
                </Box>
              ) : (
                <List>
                  {friendRequests.map((request, index) => (
                    <React.Fragment key={request._id}>
                      {index > 0 && <Divider />}
                      <ListItem
                        secondaryAction={
                          <Box sx={{ display: 'flex', gap: 1 }}>
                            <IconButton
                              edge="end"
                              aria-label="accept"
                              color="success"
                              onClick={() => handleAcceptRequest(request._id)}
                            >
                              <CheckIcon />
                            </IconButton>
                            <IconButton
                              edge="end"
                              aria-label="reject"
                              color="error"
                              onClick={() => handleRejectRequest(request._id)}
                            >
                              <CloseIcon />
                            </IconButton>
                          </Box>
                        }
                      >
                        <ListItemAvatar>
                          <Avatar
                            src={request.sender.picture}
                            alt={request.sender.name}
                          >
                            {request.sender.name.charAt(0).toUpperCase()}
                          </Avatar>
                        </ListItemAvatar>
                        <ListItemText
                          primary={request.sender.name}
                          secondary={`Sent ${new Date(request.createdAt).toLocaleDateString()}`}
                        />
                      </ListItem>
                    </React.Fragment>
                  ))}
                </List>
              )}
            </Paper>
          )}
        </>
      )}

      {/* Add Friend Dialog */}
      <Dialog
        open={addFriendOpen}
        onClose={() => setAddFriendOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Add Friend</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label="Search by name or email"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              handleSearchUsers(e.target.value);
            }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
              endAdornment: searching && (
                <InputAdornment position="end">
                  <CircularProgress size={20} />
                </InputAdornment>
              ),
            }}
            sx={{ mt: 2 }}
          />

          <List sx={{ mt: 2 }}>
            {searchResults.map((user) => (
              <ListItemButton key={user._id}>
                <ListItemAvatar>
                  <Avatar src={user.picture} alt={user.name}>
                    {user.name.charAt(0).toUpperCase()}
                  </Avatar>
                </ListItemAvatar>
                <ListItemText primary={user.name} secondary={user.email} />
                <Box>
                  {user.friendshipStatus === 'none' && (
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<PersonAddIcon />}
                      onClick={() => handleSendRequest(user._id)}
                    >
                      Add
                    </Button>
                  )}
                  {user.friendshipStatus === 'pending' && (
                    <Chip label="Request Sent" size="small" color="default" />
                  )}
                  {user.friendshipStatus === 'accepted' && (
                    <Chip label="Friends" size="small" color="success" />
                  )}
                </Box>
              </ListItemButton>
            ))}
          </List>

          {searchQuery.length >= 2 &&
            searchResults.length === 0 &&
            !searching && (
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ mt: 2, textAlign: 'center' }}
              >
                No users found
              </Typography>
            )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddFriendOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default Friends;
