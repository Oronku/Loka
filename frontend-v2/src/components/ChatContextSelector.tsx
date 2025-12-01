import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Autocomplete,
  Box,
  Typography,
  Chip,
  CircularProgress,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import { useAuth } from '../context/AuthContext';

interface Participant {
  userId: string;
  email: string;
  name: string;
  role: 'owner' | 'member' | 'buyer' | 'seller';
}

interface Trip {
  _id: string;
  name: string;
  destination: string;
}

interface QuicketItem {
  _id: string;
  title?: string;
  name?: string;
  type: string;
}

interface ChatContextSelectorProps {
  open: boolean;
  onClose: () => void;
  contextType: 'quicket_item' | 'trip' | 'friend_group' | 'direct' | null;
  onCreateChat: (
    contextType: string,
    contextId: string,
    participants: Participant[],
    metadata: any
  ) => void;
}

export default function ChatContextSelector({
  open,
  onClose,
  contextType,
  onCreateChat,
}: ChatContextSelectorProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedContext, setSelectedContext] = useState<any>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [groupName, setGroupName] = useState('');

  // For contextType-specific data
  const [trips, setTrips] = useState<Trip[]>([]);
  const [quicketItems, setQuicketItems] = useState<QuicketItem[]>([]);
  const [availableUsers, setAvailableUsers] = useState<any[]>([]);

  useEffect(() => {
    if (open && contextType) {
      fetchContextData();
    }
  }, [open, contextType]);

  const fetchContextData = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('authToken');

      if (contextType === 'trip') {
        // Fetch user's trips
        const response = await fetch('http://localhost:3001/api/trips', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          setTrips(data.trips || []);
        }
      } else if (contextType === 'quicket_item') {
        // Fetch user's quicket items (as seller)
        const response = await fetch(
          'http://localhost:3001/api/quicket/my-items',
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (response.ok) {
          const data = await response.json();
          setQuicketItems(data.items || []);
        }
      } else if (contextType === 'friend_group' || contextType === 'direct') {
        // In a real app, fetch friends list
        // For now, we'll just allow manual email entry
        setAvailableUsers([]);
      }

      setError('');
    } catch (err) {
      console.error('Error fetching context data:', err);
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleContextSelect = async (context: any) => {
    setSelectedContext(context);

    if (contextType === 'trip' && context) {
      // Fetch trip details to get participants
      try {
        const token = localStorage.getItem('authToken');
        const response = await fetch(
          `http://localhost:3001/api/trips/${context._id}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (response.ok) {
          const data = await response.json();
          const trip = data.trip;

          // Set participants from trip members
          const tripParticipants: Participant[] = [
            {
              userId: trip.userId,
              email: trip.userEmail || '',
              name:
                trip.userName ||
                trip.userEmail?.split('@')[0] ||
                'Trip Creator',
              role: 'owner',
            },
            ...(trip.sharedWith || []).map((memberId: string) => ({
              userId: memberId,
              email: `member${memberId.slice(-4)}@example.com`, // Placeholder
              name: `Member ${memberId.slice(-4)}`,
              role: 'member' as const,
            })),
          ];

          setParticipants(tripParticipants);
        }
      } catch (err) {
        console.error('Error fetching trip details:', err);
      }
    }
  };

  const handleAddParticipant = (email: string) => {
    if (!email || participants.some((p) => p.email === email)) {
      return;
    }

    const newParticipant: Participant = {
      userId: email, // In real app, would lookup user by email
      email,
      name: email.split('@')[0],
      role: 'member',
    };

    setParticipants([...participants, newParticipant]);
  };

  const handleRemoveParticipant = (email: string) => {
    setParticipants(participants.filter((p) => p.email !== email));
  };

  const handleCreateChat = async () => {
    if (!contextType || !selectedContext) {
      setError('Please select a context');
      return;
    }

    if (
      (contextType === 'friend_group' || contextType === 'direct') &&
      !groupName.trim()
    ) {
      setError('Please enter a group name');
      return;
    }

    if (participants.length === 0) {
      setError('Please add at least one participant');
      return;
    }

    try {
      setLoading(true);

      // Add current user if not already included
      let finalParticipants = [...participants];
      if (!finalParticipants.some((p) => p.userId === user?.id)) {
        finalParticipants = [
          {
            userId: user!.id,
            email: user!.email,
            name: user!.name || user!.email.split('@')[0],
            role: 'owner',
          },
          ...finalParticipants,
        ];
      }

      const metadata: any = {};

      if (contextType === 'trip') {
        metadata.tripId = selectedContext._id;
        metadata.tripName = selectedContext.name;
      } else if (contextType === 'quicket_item') {
        metadata.itemId = selectedContext._id;
        metadata.itemTitle = selectedContext.title || selectedContext.name;
        metadata.itemType = selectedContext.type;
      } else if (contextType === 'friend_group' || contextType === 'direct') {
        metadata.groupName = groupName;
      }

      onCreateChat(
        contextType,
        selectedContext._id || 'new',
        finalParticipants,
        metadata
      );

      onClose();
    } catch (err) {
      console.error('Error creating chat:', err);
      setError('Failed to create chat');
    } finally {
      setLoading(false);
    }
  };

  const getContextLabel = () => {
    switch (contextType) {
      case 'trip':
        return 'Select Trip';
      case 'quicket_item':
        return 'Select Quicket Item';
      case 'friend_group':
      case 'direct':
        return 'Group Name';
      default:
        return 'Select Context';
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        Start New Chat
        {contextType && (
          <Typography variant="caption" display="block" color="text.secondary">
            {contextType.replace('_', ' ').toUpperCase()}
          </Typography>
        )}
      </DialogTitle>

      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {loading && !selectedContext ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {contextType === 'trip' && (
              <Autocomplete
                options={trips}
                getOptionLabel={(option) =>
                  `${option.name} - ${option.destination}`
                }
                value={selectedContext}
                onChange={(_, newValue) => handleContextSelect(newValue)}
                renderInput={(params) => (
                  <TextField {...params} label={getContextLabel()} />
                )}
              />
            )}

            {contextType === 'quicket_item' && (
              <Autocomplete
                options={quicketItems}
                getOptionLabel={(option) =>
                  `${option.title || option.name} (${option.type})`
                }
                value={selectedContext}
                onChange={(_, newValue) => setSelectedContext(newValue)}
                renderInput={(params) => (
                  <TextField {...params} label={getContextLabel()} />
                )}
              />
            )}

            {(contextType === 'friend_group' || contextType === 'direct') && (
              <TextField
                label="Group Name"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                fullWidth
              />
            )}

            <Box>
              <Typography variant="subtitle2" gutterBottom>
                Participants
              </Typography>

              {contextType === 'trip' && selectedContext && (
                <Alert severity="info" sx={{ mb: 1 }}>
                  All trip members will be added to this chat
                </Alert>
              )}

              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1 }}>
                {participants.map((p) => (
                  <Chip
                    key={p.email}
                    label={`${p.name} (${p.role})`}
                    onDelete={
                      p.userId !== user?.id && contextType !== 'trip'
                        ? () => handleRemoveParticipant(p.email)
                        : undefined
                    }
                    size="small"
                    color={p.userId === user?.id ? 'primary' : 'default'}
                  />
                ))}
              </Box>

              {(contextType === 'friend_group' || contextType === 'direct') && (
                <Autocomplete
                  freeSolo
                  options={availableUsers.map((u) => u.email)}
                  onInputChange={(_, value) => {
                    if (value && value.includes('@')) {
                      handleAddParticipant(value);
                    }
                  }}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Add participant by email"
                      helperText="Press Enter to add"
                      size="small"
                    />
                  )}
                />
              )}
            </Box>
          </Box>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          onClick={handleCreateChat}
          variant="contained"
          disabled={loading || !selectedContext}
        >
          Create Chat
        </Button>
      </DialogActions>
    </Dialog>
  );
}
