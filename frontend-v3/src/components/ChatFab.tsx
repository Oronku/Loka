import React from 'react';
import { Fab, Zoom, Badge, Tooltip } from '@mui/material';
import { Chat as ChatIcon } from '@mui/icons-material';
import { useAuth } from '../context/AuthContext';

interface ChatFabProps {
  onClick: () => void;
  unreadCount?: number;
  position?: {
    bottom: number;
    right: number;
  };
}

export default function ChatFab({
  onClick,
  unreadCount = 0,
  position = { bottom: 24, right: 24 },
}: ChatFabProps) {
  const { user } = useAuth();

  // Don't show FAB if user is not logged in
  if (!user) {
    return null;
  }

  return (
    <Zoom in={true}>
      <Tooltip title="Open Messages" placement="left">
        <Fab
          color="primary"
          aria-label="open messages"
          onClick={onClick}
          sx={{
            position: 'fixed',
            bottom: position.bottom,
            right: position.right,
            zIndex: 1200,
          }}
        >
          <Badge badgeContent={unreadCount} color="error">
            <ChatIcon />
          </Badge>
        </Fab>
      </Tooltip>
    </Zoom>
  );
}
