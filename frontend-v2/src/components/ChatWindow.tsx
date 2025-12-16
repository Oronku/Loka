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
  contextType?: 'quicket_item' | 'trip' | 'friend_group' | 'ai_assistant';
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
  const [isTyping, setIsTyping] = useState(false); // For AI typing indicator
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const nodeRef = useRef(null);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const prevMessagesLengthRef = useRef(0);
  const userScrolledRef = useRef(false);

  // Special handling for Loka AI
  const isLoka = contextType === 'ai_assistant';

  // Fetch chat and messages
  useEffect(() => {
    if (isLoka) {
      setLoading(false);
      // Initialize Loka chat
      setChat({
        _id: 'loka-ai-chat',
        contextType: 'ai_assistant',
        contextId: 'loka',
        participants: [
          {
            userId: 'loka-ai',
            name: 'Loka',
            email: 'ai@meetloca.com',
            role: 'owner',
            joinedAt: new Date(),
          },
        ],
        permissions: {
          canInvite: [],
          canRemove: [],
          canMessage: ['owner', 'member'],
        },
        status: 'active',
        metadata: {
          groupName: 'Loka AI Assistant',
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      // Load local messages or welcome message
      const savedMessages = localStorage.getItem('loka_messages');
      if (savedMessages) {
        setMessages(JSON.parse(savedMessages));
      } else {
        setMessages([
          {
            _id: 'welcome',
            chatId: 'loka-ai-chat',
            senderId: 'loka-ai',
            senderName: 'Loka',
            senderEmail: 'ai@meetloca.com',
            text: "Hi! I'm Loka, your AI travel assistant. I can help you plan trips, find flights, and manage your itinerary. How can I help you today?",
            timestamp: new Date(),
          },
        ]);
      }
    } else {
      fetchChat();
      // Poll less frequently (10 seconds instead of 3)
      // Only poll for group chats where others might be messaging
      let interval: NodeJS.Timeout;

      // Only start polling if window is not minimized
      if (!isMinimized) {
        interval = setInterval(fetchMessages, 10000);
      }

      return () => {
        if (interval) clearInterval(interval);
      };
    }
  }, [chatId, isLoka, isMinimized]);

  useEffect(() => {
    if (isLoka) {
      localStorage.setItem('loka_messages', JSON.stringify(messages));
    }
  }, [messages, isLoka]);

  // Check if user is near bottom of chat
  const handleScroll = () => {
    if (!messagesContainerRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } =
      messagesContainerRef.current;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 50;

    // Mark that user has manually scrolled
    if (!isNearBottom) {
      userScrolledRef.current = true;
      setShouldAutoScroll(false);
    } else {
      userScrolledRef.current = false;
      setShouldAutoScroll(true);
    }
  };

  // Auto-scroll to bottom only when new messages arrive and user hasn't scrolled up
  useEffect(() => {
    const hasNewMessages = messages.length > prevMessagesLengthRef.current;
    prevMessagesLengthRef.current = messages.length;

    // Only auto-scroll if there are new messages AND user hasn't manually scrolled up
    if (
      hasNewMessages &&
      !userScrolledRef.current &&
      messagesContainerRef.current
    ) {
      requestAnimationFrame(() => {
        if (messagesContainerRef.current) {
          messagesContainerRef.current.scrollTop =
            messagesContainerRef.current.scrollHeight;
        }
      });
    }
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
      setMessages(data.messages || []);
    } catch (err) {
      console.error('Error fetching messages:', err);
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || chat?.locked) return;

    const messageText = newMessage;
    setNewMessage('');

    // Enable auto-scroll when user sends a message
    userScrolledRef.current = false;
    setShouldAutoScroll(true);

    if (isLoka) {
      // Optimistic update
      const tempId = Date.now().toString();
      const userMsg: Message = {
        _id: tempId,
        chatId: 'loka-ai-chat',
        senderId: user?.id || '',
        senderName: user?.name || 'Me',
        senderEmail: user?.email || '',
        text: messageText,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setIsTyping(true);

      try {
        const token = localStorage.getItem('authToken');
        const response = await fetch('http://localhost:3001/api/ai/message', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            message: messageText,
            context: { userId: user?.id },
          }),
        });

        const data = await response.json();

        // Simulate typing delay
        setTimeout(() => {
          const aiMsg: Message = {
            _id: Date.now().toString(),
            chatId: 'loka-ai-chat',
            senderId: 'loka-ai',
            senderName: 'Loka',
            senderEmail: 'ai@meetloca.com',
            text: data.text,
            timestamp: new Date(),
          };
          setMessages((prev) => [...prev, aiMsg]);
          setIsTyping(false);

          // Execute action if any
          if (data.action) {
            handleAiAction(data.action);
          }
        }, 1000);
      } catch (err) {
        console.error('AI Error:', err);
        setIsTyping(false);
      }
      return;
    }

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

  const handleAiAction = async (action: any) => {
    try {
      const token = localStorage.getItem('authToken');
      await fetch('http://localhost:3001/api/ai/action', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          actionType: action.type,
          actionData: action.data,
        }),
      });
      // Refresh data if needed (e.g. reload trips)
    } catch (err) {
      console.error('Action failed:', err);
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

  if (loading && !chat && !isLoka) {
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

  if (error && !chat && !isLoka) {
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
          boxShadow: '0 12px 40px rgba(0,0,0,0.2)',
          borderRadius: 3,
          border: '1px solid rgba(255,255,255,0.5)',
          bgcolor: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(10px)',
        }}
      >
        {/* Header */}
        <Box
          className="chat-header"
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            p: 2,
            background: 'linear-gradient(90deg, #009D85, #00BFA5)',
            color: 'white',
            cursor: 'move',
            boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
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
              ref={messagesContainerRef}
              onScroll={handleScroll}
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
                    {msg.senderId === 'loka-ai' ? (
                      <Avatar
                        src="http://localhost:5190/videos/idle-animation.apng"
                        sx={{ width: 32, height: 32 }}
                      />
                    ) : (
                      <Avatar sx={{ width: 32, height: 32 }}>
                        {msg.senderName[0]?.toUpperCase()}
                      </Avatar>
                    )}

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
                          p: msg.senderId === 'loka-bot' ? 2 : 1.5,
                          bgcolor: isOwnMessage
                            ? 'primary.main'
                            : msg.senderId === 'loka-bot'
                              ? '#f8f9fa'
                              : 'white',
                          color: isOwnMessage ? 'white' : 'text.primary',
                          borderRadius: 2,
                          boxShadow:
                            msg.senderId === 'loka-bot'
                              ? '0 1px 3px rgba(0,0,0,0.08)'
                              : undefined,
                        }}
                      >
                        {msg.senderId === 'loka-bot' ? (
                          <Box sx={{ '& p': { margin: 0 } }}>
                            {msg.text.split('\n').map((line, idx) => {
                              // Parse bold text **text**
                              const boldRegex = /\*\*(.*?)\*\*/g;
                              const parts = [];
                              let lastIndex = 0;
                              let match;

                              while ((match = boldRegex.exec(line)) !== null) {
                                if (match.index > lastIndex) {
                                  parts.push(
                                    line.substring(lastIndex, match.index)
                                  );
                                }
                                parts.push(
                                  <strong key={match.index}>{match[1]}</strong>
                                );
                                lastIndex = match.index + match[0].length;
                              }
                              if (lastIndex < line.length) {
                                parts.push(line.substring(lastIndex));
                              }

                              return (
                                <Typography
                                  key={idx}
                                  variant="body2"
                                  sx={{
                                    mb:
                                      idx < msg.text.split('\n').length - 1
                                        ? 0.5
                                        : 0,
                                    lineHeight: 1.6,
                                    fontSize: '0.9rem',
                                  }}
                                >
                                  {parts.length > 0 ? parts : line || <br />}
                                </Typography>
                              );
                            })}
                          </Box>
                        ) : (
                          <Typography variant="body2">{msg.text}</Typography>
                        )}
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
