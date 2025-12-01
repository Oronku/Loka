import React, { createContext, useContext } from 'react';

interface ChatContextType {
  openChat: (chatId: string, contextType?: string) => void;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export const ChatProvider: React.FC<{
  children: React.ReactNode;
  onOpenChat: (chatId: string, contextType?: string) => void;
}> = ({ children, onOpenChat }) => {
  return (
    <ChatContext.Provider value={{ openChat: onOpenChat }}>
      {children}
    </ChatContext.Provider>
  );
};

export const useChat = () => {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
};
