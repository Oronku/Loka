import React, { createContext, useContext, useState } from 'react';

interface ChatContextType {
  openChat: (chatId: string, contextType?: string) => void;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export const ChatProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const [openChats, setOpenChats] = useState<Array<{ chatId: string; contextType: string }>>([]);

  const openChat = (chatId: string, contextType: string = 'direct') => {
    setOpenChats((prev) => {
      const existingChat = prev.find((c) => c.chatId === chatId);
      if (!existingChat) {
        return [...prev, { chatId, contextType }];
      }
      return prev;
    });
  };

  return (
    <ChatContext.Provider value={{ openChat }}>
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
