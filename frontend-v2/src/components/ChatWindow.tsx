import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Paper,
  Typography,
  IconButton,
  TextField,
  Avatar,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Divider,
  Chip,
  Menu,
  MenuItem,
  Badge,
  Collapse,
  Button,
} from '@mui/material';
import {
  Close as CloseIcon,
  Minimize as MinimizeIcon,
  Send as SendIcon,
  MoreVert as MoreVertIcon,
  AttachFile as AttachFileIcon,
  Info as InfoIcon,
  People as PeopleIcon,
  Lock as LockIcon,
  CheckCircle as SoldIcon,
} from '@mui/icons-material';
import Draggable from 'react-draggable';
import { useAuth } from '../context/AuthContext';
import { chatApi } from '../services/chatApi';

interface Participant {
  userId: string;
  email: string;
  name: string;
  role: 'owner' | 'member' | 'buyer' | 'seller';
  joinedAt: Date;
}

interface Message {
  _id: string;
  chatId: string;
  senderId: string;
  senderEmail: string;
  senderName: string;
  text: string;
  attachments?: Array<{
    type: 'image' | 'pdf' | 'link' | 'file';
    url: string;
    name: string;
    size?: number;
  }>;
  timestamp: Date;
  readBy?: Array<{ userId: string; readAt: Date }>;
}

interface Chat {
  _id: string;
  contextType: 'quicket_item' | 'trip' | 'friend_group';
  contextId: string;
  participants: Participant[];
  permissions: {
    canInvite: string[];
    canRemove: string[];
    canMessage: string[];
  };
  status: 'pending' | 'active' | 'archived';
  locked?: boolean;
  metadata: {
    itemId?: string;
    itemType?: string;
    itemTitle?: string;
    tripId?: string;
    tripName?: string;
    groupName?: string;
  };
  createdAt: Date;
  updatedAt: Date;
  lastMessageAt?: Date;
}

interface ChatWindowProps {
  chatId: string;
  onClose: () => void;
  initialPosition?: { x: number; y: number };
  contextType?: 'quicket_item' | 'trip' | 'friend_group';
}

export default function ChatWindow({
  chatId,
  onClose,
  initialPosition = { x: 100, y: 100 },
  contextType,
}: ChatWindowProps) {
  const { user } = useAuth();
  const [chat, setChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isMinimized, setIsMinimized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [showParticipants, setShowParticipants] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const nodeRef = useRef(null);

  // Fetch chat and messages
  useEffect(() => {
    fetchChat();
    const interval = setInterval(fetchMessages, 3000); // Poll every 3 seconds
    return () => clearInterval(interval);
  }, [chatId]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const fetchChat = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('authToken');

      // Use appropriate endpoint based on context
      const endpoint =
        contextType === 'quicket_item'
          ? `/api/quicket/chat/${chatId}`
          : `/api/chats/${chatId}`;

      const response = await fetch(`http://localhost:3001${endpoint}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch chat');
      }

      const data = await response.json();
      setChat(data.chat);

      if (data.messages) {
        setMessages(data.messages);
      }

      setError('');
    } catch (err) {
      console.error('Error fetching chat:', err);
      setError('Failed to load chat');
    } finally {
      setLoading(false);
    }
  };

  const fetchMessages = async () => {
    try {
      const token = localStorage.getItem('authToken');

      // Use unified chat endpoint for all chats
      const endpoint = `/api/chats/${chatId}/messages`;

      console.log('Fetching messages from:', endpoint);
      const response = await fetch(`http://localhost:3001${endpoint}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Failed to fetch messages:', errorData);
        throw new Error(errorData.error || 'Failed to fetch messages');
      }

      const data = await response.json();
      console.log('Messages received:', data.messages);
      setMessages(data.messages || []);
    } catch (err) {
      console.error('Error fetching messages:', err);
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || chat?.locked) return;

    try {
      const token = localStorage.getItem('authToken');

      // Use unified chat endpoint for all chats
      const endpoint = `/api/chats/${chatId}/messages`;

      const response = await fetch(`http://localhost:3001${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          text: newMessage,
          attachments: [],
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to send message');
      }

      const data = await response.json();
      setMessages([...messages, data.data]);
      setNewMessage('');
    } catch (err) {
      console.error('Error sending message:', err);
      setError('Failed to send message');
    }
  };

  const handleMarkAsSold = async () => {
    if (
      !confirm(
        'Are you sure you want to mark this item as sold? This will lock the chat.'
      )
    )
      return;

    try {
      await chatApi.markItemAsSold(chatId);
      await fetchChat();
      await fetchMessages();
      alert('Item marked as sold successfully!');
    } catch (err: any) {
      console.error('Error marking as sold:', err);
      alert(err.response?.data?.error || 'Failed to mark item as sold');
    }
  };

  const isSellerInQuicketChat = (): boolean => {
    if (!chat || !user) return false;
    if (chat.contextType !== 'quicket_item') return false;

    const currentUserParticipant = chat.participants?.find(
      (p) => p.userId === user.id
    );
    return currentUserParticipant?.role === 'seller';
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const getParticipantRole = (userId: string): string => {
    if (!chat || !chat.participants) return '';
    const participant = chat.participants.find((p) => p.userId === userId);
    return participant?.role || '';
  };

  const getOtherParticipantName = (): string => {
    if (!chat) return 'Chat';

    // For Quicket items, show the other person's name
    if (chat.contextType === 'quicket_item' && chat.participants) {
      const otherParticipant = chat.participants.find(
        (p) => p.userId !== user?.id
      );
      return otherParticipant?.name || 'Chat';
    }

    // For trips, show trip name
    if (chat.contextType === 'trip' && chat.metadata.tripName) {
      return chat.metadata.tripName;
    }

    // For friend groups, show group name
    if (chat.contextType === 'friend_group' && chat.metadata.groupName) {
      return chat.metadata.groupName;
    }

    // Default: show participant count
    return `Chat (${chat.participants?.length || 0} members)`;
  };

  const getChatSubtitle = (): string => {
    if (!chat) return '';

    if (chat.contextType === 'quicket_item' && chat.metadata?.itemTitle) {
      return `About: ${chat.metadata.itemTitle}`;
    }

    return chat.contextType?.replace('_', ' ').toUpperCase() || '';
  };

  if (loading && !chat) {
    return (
      <Draggable nodeRef={nodeRef} defaultPosition={initialPosition}>
        <Paper
          ref={nodeRef}
          sx={{
            position: 'fixed',
            width: 400,
            height: 500,
            zIndex: 1300,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Typography>Loading chat...</Typography>
        </Paper>
      </Draggable>
    );
  }

  if (error && !chat) {
    return (
      <Draggable nodeRef={nodeRef} defaultPosition={initialPosition}>
        <Paper
          ref={nodeRef}
          sx={{
            position: 'fixed',
            width: 400,
            height: 500,
            zIndex: 1300,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            p: 2,
          }}
        >
          <Typography color="error" gutterBottom>
            {error}
          </Typography>
          <Button variant="contained" onClick={onClose}>
            Close
          </Button>
        </Paper>
      </Draggable>
    );
  }

  return (
    <Draggable
      nodeRef={nodeRef}
      defaultPosition={initialPosition}
      handle=".chat-header"
    >
      <Paper
        ref={nodeRef}
        sx={{
          position: 'fixed',
          width: 400,
          height: isMinimized ? 'auto' : 500,
          zIndex: 1300,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: 4,
        }}
      >
        {/* Header */}
        <Box
          className="chat-header"
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            p: 1.5,
            bgcolor: 'primary.main',
            color: 'white',
            cursor: 'move',
          }}
        >
          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle1" noWrap>
              {getOtherParticipantName()}
            </Typography>
            <Typography variant="caption" noWrap>
              {getChatSubtitle()}
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', gap: 0.5 }}>
            <IconButton
              size="small"
              onClick={() => setShowParticipants(!showParticipants)}
              sx={{ color: 'white' }}
            >
              <Badge
                badgeContent={chat?.participants?.length || 0}
                color="secondary"
              >
                <PeopleIcon fontSize="small" />
              </Badge>
            </IconButton>

            <IconButton
              size="small"
              onClick={() => setIsMinimized(!isMinimized)}
              sx={{ color: 'white' }}
            >
              <MinimizeIcon fontSize="small" />
            </IconButton>

            <IconButton size="small" onClick={onClose} sx={{ color: 'white' }}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>
        </Box>

        {!isMinimized && (
          <>
            {/* Participants List */}
            <Collapse in={showParticipants}>
              <Box
                sx={{
                  bgcolor: 'grey.100',
                  p: 1,
                  maxHeight: 150,
                  overflow: 'auto',
                }}
              >
                <Typography
                  variant="caption"
                  sx={{ fontWeight: 'bold', px: 1 }}
                >
                  Participants
                </Typography>
                <List dense>
                  {chat?.participants?.map((participant) => (
                    <ListItem key={participant.userId}>
                      <ListItemAvatar>
                        <Avatar sx={{ width: 24, height: 24 }}>
                          {participant.name[0]?.toUpperCase()}
                        </Avatar>
                      </ListItemAvatar>
                      <ListItemText
                        primary={participant.name}
                        secondary={
                          <Chip
                            label={participant.role}
                            size="small"
                            color={
                              participant.userId === user?.id
                                ? 'primary'
                                : 'default'
                            }
                            sx={{ height: 16, fontSize: '0.65rem' }}
                          />
                        }
                      />
                    </ListItem>
                  ))}
                </List>
              </Box>
              <Divider />
            </Collapse>

            {/* Messages */}
            <Box
              sx={{
                flex: 1,
                overflow: 'auto',
                p: 2,
                bgcolor: 'grey.50',
                display: 'flex',
                flexDirection: 'column',
                gap: 1,
              }}
            >
              {messages.map((msg) => {
                const isOwnMessage = msg.senderId === user?.id;
                return (
                  <Box
                    key={msg._id}
                    sx={{
                      display: 'flex',
                      flexDirection: isOwnMessage ? 'row-reverse' : 'row',
                      gap: 1,
                      alignItems: 'flex-start',
                    }}
                  >
                    <Avatar sx={{ width: 32, height: 32 }}>
                      {msg.senderName[0]?.toUpperCase()}
                    </Avatar>

                    <Box sx={{ maxWidth: '70%' }}>
                      {!isOwnMessage && (
                        <Typography
                          variant="caption"
                          sx={{ ml: 1, color: 'text.secondary' }}
                        >
                          {msg.senderName}
                        </Typography>
                      )}
                      <Paper
                        sx={{
                          p: 1,
                          bgcolor: isOwnMessage ? 'primary.main' : 'white',
                          color: isOwnMessage ? 'white' : 'text.primary',
                          borderRadius: 2,
                        }}
                      >
                        <Typography variant="body2">{msg.text}</Typography>
                      </Paper>
                      <Typography
                        variant="caption"
                        sx={{
                          ml: 1,
                          color: 'text.secondary',
                          fontSize: '0.65rem',
                        }}
                      >
                        {new Date(msg.timestamp).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </Typography>
                    </Box>
                  </Box>
                );
              })}
              <div ref={messagesEndRef} />
            </Box>

            {/* Input */}
            <Box
              sx={{
                p: 1,
                bgcolor: 'white',
                borderTop: 1,
                borderColor: 'divider',
              }}
            >
              {chat?.status === 'pending' &&
                getParticipantRole(user?.id || '') === 'buyer' && (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: 'block', mb: 1, px: 1 }}
                  >
                    Waiting for seller to accept...
                  </Typography>
                )}

              {/* Locked Chat Alert */}
              {chat?.locked && (
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    mb: 1,
                    px: 1,
                    py: 0.5,
                    bgcolor: 'warning.light',
                    borderRadius: 1,
                  }}
                >
                  <LockIcon fontSize="small" />
                  <Typography variant="caption">
                    This chat is locked. The item has been sold.
                  </Typography>
                </Box>
              )}

              {/* Mark as Sold Button (Seller only, before item is sold) */}
              {isSellerInQuicketChat() && !chat?.locked && (
                <Button
                  variant="contained"
                  color="success"
                  size="small"
                  startIcon={<SoldIcon />}
                  onClick={handleMarkAsSold}
                  sx={{ mb: 1, width: '100%' }}
                >
                  Mark as Sold
                </Button>
              )}

              <Box sx={{ display: 'flex', gap: 1 }}>
                <IconButton size="small" disabled>
                  <AttachFileIcon fontSize="small" />
                </IconButton>

                <TextField
                  fullWidth
                  size="small"
                  placeholder={
                    chat?.locked ? 'Chat is locked' : 'Type a message...'
                  }
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyPress={handleKeyPress}
                  multiline
                  maxRows={3}
                  disabled={
                    chat?.locked ||
                    (chat?.status === 'pending' &&
                      getParticipantRole(user?.id || '') === 'buyer')
                  }
                />

                <IconButton
                  color="primary"
                  onClick={sendMessage}
                  disabled={!newMessage.trim() || chat?.locked}
                >
                  <SendIcon />
                </IconButton>
              </Box>
            </Box>
          </>
        )}
      </Paper>
    </Draggable>
  );
}
