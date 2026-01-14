import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Typography,
  Box,
  Chip,
  Alert,
  CircularProgress,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from '@mui/material';
import {
  Close as CloseIcon,
  PersonRemove as RemoveIcon,
  Share as ShareIcon,
} from '@mui/icons-material';
import { shareTrip, revokeAccess } from '../services/api';

interface SharedUser {
  userId: string;
  email: string;
  name: string;
  sharedAt: string;
}

interface ShareTripDialogProps {
  open: boolean;
  onClose: () => void;
  tripId: string;
  tripName: string;
  sharedWith: SharedUser[];
  onUpdate: () => void;
}

export default function ShareTripDialog({
  open,
  onClose,
  tripId,
  tripName,
  sharedWith = [],
  onUpdate,
}: ShareTripDialogProps) {
  const [email, setEmail] = useState('');
  const [emails, setEmails] = useState<string[]>([]);
  const [expensePermissions, setExpensePermissions] = useState<
    Record<string, 'disable' | 'view' | 'edit'>
  >({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleAddEmail = () => {
    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedEmail) return;

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      setError('Please enter a valid email address');
      return;
    }

    if (emails.includes(trimmedEmail)) {
      setError('Email already added');
      return;
    }

    setEmails([...emails, trimmedEmail]);
    // Set default permission to 'edit' for new users
    setExpensePermissions({
      ...expensePermissions,
      [trimmedEmail]: 'edit',
    });
    setEmail('');
    setError('');
  };

  const handleRemoveEmail = (emailToRemove: string) => {
    setEmails(emails.filter((e) => e !== emailToRemove));
    const newPermissions = { ...expensePermissions };
    delete newPermissions[emailToRemove];
    setExpensePermissions(newPermissions);
  };

  const handleShare = async () => {
    if (emails.length === 0) {
      setError('Please add at least one email address');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const result = await shareTrip(tripId, emails, expensePermissions);
      setSuccess(result.message);
      setEmails([]);
      setExpensePermissions({});
      onUpdate();

      // Close dialog after 2 seconds
      setTimeout(() => {
        setSuccess('');
        onClose();
      }, 2000);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to share trip');
    } finally {
      setLoading(false);
    }
  };

  const handleRevoke = async (userId: string, userName: string) => {
    if (!confirm(`Remove access for ${userName}?`)) return;

    setLoading(true);
    setError('');

    try {
      await revokeAccess(tripId, userId);
      setSuccess('Access revoked successfully');
      onUpdate();

      setTimeout(() => {
        setSuccess('');
      }, 2000);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to revoke access');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddEmail();
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Box display="flex" alignItems="center" justifyContent="space-between">
          <Box display="flex" alignItems="center" gap={1}>
            <ShareIcon />
            <span>Share Trip</span>
          </Box>
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent dividers>
        <Typography variant="subtitle2" gutterBottom>
          Trip: <strong>{tripName}</strong>
        </Typography>

        {error && (
          <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {success && (
          <Alert severity="success" sx={{ mb: 2 }}>
            {success}
          </Alert>
        )}

        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" gutterBottom>
            Add people by email
          </Typography>
          <Box display="flex" gap={1}>
            <TextField
              fullWidth
              size="small"
              placeholder="Enter email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={loading}
            />
            <Button
              variant="contained"
              onClick={handleAddEmail}
              disabled={loading || !email.trim()}
            >
              Add
            </Button>
          </Box>

          {emails.length > 0 && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="caption" color="text.secondary" gutterBottom>
                Pending invitations with expense permissions:
              </Typography>
              {emails.map((e) => (
                <Box
                  key={e}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 2,
                    py: 1,
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                  }}
                >
                  <Chip
                    label={e}
                    size="small"
                    onDelete={() => handleRemoveEmail(e)}
                    color="primary"
                    variant="outlined"
                    sx={{ minWidth: 200 }}
                  />
                  <FormControl size="small" sx={{ minWidth: 150 }}>
                    <InputLabel>Expense Permission</InputLabel>
                    <Select
                      value={expensePermissions[e] || 'edit'}
                      label="Expense Permission"
                      onChange={(event) => {
                        setExpensePermissions({
                          ...expensePermissions,
                          [e]: event.target.value as
                            | 'disable'
                            | 'view'
                            | 'edit',
                        });
                      }}
                    >
                      <MenuItem value="disable">Disable</MenuItem>
                      <MenuItem value="view">View Only</MenuItem>
                      <MenuItem value="edit">View + Add</MenuItem>
                    </Select>
                  </FormControl>
                </Box>
              ))}
            </Box>
          )}
        </Box>

        {sharedWith.length > 0 && (
          <Box>
            <Typography variant="subtitle2" gutterBottom>
              People with access ({sharedWith.length})
            </Typography>
            <List dense>
              {sharedWith.map((user) => (
                <ListItem key={user.userId} divider>
                  <ListItemText
                    primary={user.name || user.email}
                    secondary={
                      <>
                        {user.email}
                        <Typography
                          variant="caption"
                          display="block"
                          color="text.secondary"
                        >
                          Shared {new Date(user.sharedAt).toLocaleDateString()}
                        </Typography>
                      </>
                    }
                  />
                  <ListItemSecondaryAction>
                    <IconButton
                      edge="end"
                      onClick={() =>
                        handleRevoke(user.userId, user.name || user.email)
                      }
                      disabled={loading}
                      color="error"
                      size="small"
                    >
                      <RemoveIcon />
                    </IconButton>
                  </ListItemSecondaryAction>
                </ListItem>
              ))}
            </List>
          </Box>
        )}

        {sharedWith.length === 0 && (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ fontStyle: 'italic' }}
          >
            No one has access yet. Add emails above to share this trip.
          </Typography>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} disabled={loading}>
          Close
        </Button>
        {emails.length > 0 && (
          <Button
            onClick={handleShare}
            variant="contained"
            disabled={loading}
            startIcon={loading ? <CircularProgress size={16} /> : <ShareIcon />}
          >
            Share with {emails.length}{' '}
            {emails.length === 1 ? 'person' : 'people'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
