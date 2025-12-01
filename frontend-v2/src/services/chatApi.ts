import axios from 'axios';

const API_BASE_URL =
  import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export interface ChatParticipant {
  userId: string;
  email: string;
  name: string;
  role: 'owner' | 'member' | 'buyer' | 'seller' | 'friend';
  joinedAt: Date;
}

export interface Chat {
  _id: string;
  contextType: 'quicket_item' | 'trip' | 'direct';
  contextId: string;
  participants: ChatParticipant[];
  permissions: {
    canInvite: string[];
    canRemove: string[];
    canMessage: string[];
  };
  status: 'pending' | 'active' | 'archived';
  locked?: boolean;
  lockedAt?: Date;
  lockedBy?: string;
  unreadCount: Record<string, number>;
  metadata: any;
  createdAt: Date;
  updatedAt: Date;
  lastMessageAt: Date | null;
  lastMessage: string | null;
}

export interface Message {
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
    size: number;
  }>;
  isSystemMessage?: boolean;
  timestamp: Date;
  readBy: Array<{ userId: string; readAt: Date }>;
}

const getAuthHeaders = () => {
  const token = localStorage.getItem('authToken');
  return {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  };
};

export const chatApi = {
  // Create or find existing chat
  async createOrFindChat(params: {
    contextType: string;
    contextId: string;
    participants: Array<{
      userId: string;
      email: string;
      name: string;
      role: string;
    }>;
    metadata?: any;
  }): Promise<{ chatId: string; chat: Chat }> {
    const response = await axios.post(
      `${API_BASE_URL}/chats`,
      params,
      getAuthHeaders()
    );
    return response.data;
  },

  // Find existing chat (to prevent duplicates)
  async findExistingChat(params: {
    contextType: string;
    contextId?: string;
    participantIds?: string[];
  }): Promise<{ exists: boolean; chat?: Chat; chatId?: string }> {
    const response = await axios.post(
      `${API_BASE_URL}/chats/find-existing`,
      params,
      getAuthHeaders()
    );
    return response.data;
  },

  // Get all chats for current user
  async getChats(): Promise<Chat[]> {
    const response = await axios.get(`${API_BASE_URL}/chats`, getAuthHeaders());
    return response.data;
  },

  // Get single chat by ID
  async getChat(chatId: string): Promise<Chat> {
    const response = await axios.get(
      `${API_BASE_URL}/chats/${chatId}`,
      getAuthHeaders()
    );
    return response.data;
  },

  // Get messages for a chat
  async getMessages(chatId: string, limit = 50, skip = 0): Promise<Message[]> {
    const response = await axios.get(
      `${API_BASE_URL}/chats/${chatId}/messages?limit=${limit}&skip=${skip}`,
      getAuthHeaders()
    );
    // Backend returns { messages: [...] }, we need just the array
    return response.data.messages || response.data;
  },

  // Send message
  async sendMessage(
    chatId: string,
    text: string,
    attachments?: any[]
  ): Promise<{ messageId: string; data: Message }> {
    const response = await axios.post(
      `${API_BASE_URL}/chats/${chatId}/messages`,
      { text, attachments },
      getAuthHeaders()
    );
    return response.data;
  },

  // Mark messages as read
  async markAsRead(chatId: string, messageIds?: string[]): Promise<void> {
    await axios.put(
      `${API_BASE_URL}/chats/${chatId}/read`,
      { messageIds },
      getAuthHeaders()
    );
  },

  // Mark Quicket item as sold (seller only)
  async markItemAsSold(
    chatId: string
  ): Promise<{ message: string; chat: Chat }> {
    const response = await axios.post(
      `${API_BASE_URL}/chats/${chatId}/mark-sold`,
      {},
      getAuthHeaders()
    );
    return response.data;
  },

  // Update chat status
  async updateChatStatus(
    chatId: string,
    status: 'active' | 'archived'
  ): Promise<void> {
    await axios.put(
      `${API_BASE_URL}/chats/${chatId}/status`,
      { status },
      getAuthHeaders()
    );
  },

  // Add participant
  async addParticipant(
    chatId: string,
    participant: {
      userId: string;
      email: string;
      name: string;
      role: string;
    }
  ): Promise<void> {
    await axios.post(
      `${API_BASE_URL}/chats/${chatId}/participants`,
      participant,
      getAuthHeaders()
    );
  },

  // Remove participant
  async removeParticipant(chatId: string, userId: string): Promise<void> {
    await axios.delete(
      `${API_BASE_URL}/chats/${chatId}/participants/${userId}`,
      getAuthHeaders()
    );
  },
};
