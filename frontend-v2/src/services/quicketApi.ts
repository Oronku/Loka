import { api } from './api';

export interface QuicketItem {
  _id: string;
  sellerId: string;
  sellerEmail?: string;
  tripId?: string;
  type: 'flight' | 'hotel' | 'attraction' | 'event' | 'restaurant' | 'ship';
  title: string;
  description: string;
  priceOriginal?: number;
  priceSelling: number;
  currency: string;
  startDatetime?: string;
  endDatetime?: string;
  location: string;
  metadata: Record<string, any>;
  isActive: boolean;
  isDeleted?: boolean;
  likedCount: number;
  viewsCount: number;
  createdAt: string;
  updatedAt: string;
  seller?: {
    id: string;
    rating?: number;
    itemsSold?: number;
    email?: string;
  };
  isSeller?: boolean;
  chatCount?: number;
}

export interface QuicketChat {
  _id: string;
  itemId: string;
  buyerId: string;
  buyerEmail: string;
  sellerId: string;
  sellerEmail: string;
  status: 'pending' | 'accepted' | 'declined' | 'completed';
  createdAt: string;
  updatedAt: string;
  item?: QuicketItem;
  lastMessage?: QuicketMessage;
  isSeller?: boolean;
}

export interface QuicketMessage {
  _id: string;
  chatId: string;
  senderId: string;
  senderEmail: string;
  senderName?: string;
  text: string;
  attachments: string[];
  timestamp: string;
}

export interface SavedSearch {
  _id: string;
  userId: string;
  name: string;
  filters: Record<string, any>;
  createdAt: string;
}

export interface QuicketFilters {
  type?: string;
  minPrice?: number;
  maxPrice?: number;
  destination?: string;
  startDate?: string;
  endDate?: string;
  canChangeName?: boolean;
  mealPlan?: string;
  sort?: 'newest' | 'oldest' | 'priceLow' | 'priceHigh' | 'popular';
  page?: number;
  limit?: number;
}

// Get all items with filters
export async function getQuicketItems(filters: QuicketFilters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      params.append(key, String(value));
    }
  });

  const response = await api.get(`/quicket/items?${params.toString()}`);
  return response.data;
}

// Get single item
export async function getQuicketItem(id: string) {
  const response = await api.get(`/quicket/items/${id}`);
  return response.data;
}

// Create new item
export async function createQuicketItem(item: Partial<QuicketItem>) {
  const response = await api.post('/quicket/items', item);
  return response.data;
}

// Update item
export async function updateQuicketItem(
  id: string,
  updates: Partial<QuicketItem>
) {
  const response = await api.put(`/quicket/items/${id}`, updates);
  return response.data;
}

// Delete item
export async function deleteQuicketItem(id: string) {
  const response = await api.delete(`/quicket/items/${id}`);
  return response.data;
}

// Like item
export async function likeQuicketItem(
  id: string,
  likeType: 'like' | 'save' = 'like'
) {
  const response = await api.post(`/quicket/items/${id}/like`, { likeType });
  return response.data;
}

// Unlike item
export async function unlikeQuicketItem(
  id: string,
  likeType: 'like' | 'save' = 'like'
) {
  const response = await api.post(`/quicket/items/${id}/dislike`, { likeType });
  return response.data;
}

// Express interest
export async function expressInterest(id: string) {
  const response = await api.post(`/quicket/items/${id}/interest`);
  return response.data;
}

// Get chat
export async function getChat(chatId: string) {
  const response = await api.get(`/quicket/chat/${chatId}`);
  return response.data;
}

// Send message
export async function sendMessage(
  chatId: string,
  text: string,
  attachments: string[] = []
) {
  const response = await api.post(`/quicket/chat/${chatId}/message`, {
    text,
    attachments,
  });
  return response.data;
}

// Update chat status
export async function updateChatStatus(
  chatId: string,
  status: QuicketChat['status']
) {
  const response = await api.put(`/quicket/chat/${chatId}/status`, { status });
  return response.data;
}

// Get saved searches
export async function getSavedSearches() {
  const response = await api.get('/quicket/saved-searches');
  return response.data;
}

// Save search
export async function saveSearch(name: string, filters: QuicketFilters) {
  const response = await api.post('/quicket/saved-searches', { name, filters });
  return response.data;
}

// Delete saved search
export async function deleteSavedSearch(id: string) {
  const response = await api.delete(`/quicket/saved-searches/${id}`);
  return response.data;
}

// Get my items
export async function getMyItems() {
  const response = await api.get('/quicket/my-items');
  return response.data;
}

// Get my chats
export async function getMyChats() {
  const response = await api.get('/quicket/my-chats');
  return response.data;
}

// Get liked items
export async function getLikedItems() {
  const response = await api.get('/quicket/liked-items');
  return response.data;
}
