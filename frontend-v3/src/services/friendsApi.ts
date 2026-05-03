import axios from 'axios';
import { API_BASE_URL } from '../config/api';

export interface Friend {
	_id: string;
	name: string;
	email: string;
	picture?: string;
	isOnline: boolean;
	lastSeen: Date | null;
}

export interface UserSearchResult {
	_id: string;
	name: string;
	email: string;
	picture?: string;
	friendshipStatus: 'none' | 'pending' | 'accepted' | 'rejected';
}

export interface FriendRequest {
	_id: string;
	sender: {
		_id: string;
		name: string;
		email: string;
		picture?: string;
	};
	createdAt: Date;
}

const getAuthHeaders = () => {
	const token = localStorage.getItem('authToken');
	return {
		headers: {
			Authorization: `Bearer ${token}`,
		},
	};
};

export const friendsApi = {
	// Get all friends
	async getFriends(): Promise<Friend[]> {
		const response = await axios.get(`${API_BASE_URL}/friends`, getAuthHeaders());
		return response.data;
	},

	// Search for users
	async searchUsers(query: string): Promise<UserSearchResult[]> {
		const response = await axios.get(`${API_BASE_URL}/friends/search?query=${encodeURIComponent(query)}`, getAuthHeaders());
		return response.data;
	},

	// Send friend request
	async sendFriendRequest(receiverId: string): Promise<void> {
		await axios.post(`${API_BASE_URL}/friends/request`, { receiverId }, getAuthHeaders());
	},

	// Get pending friend requests
	async getFriendRequests(): Promise<FriendRequest[]> {
		const response = await axios.get(`${API_BASE_URL}/friends/requests`, getAuthHeaders());
		return response.data;
	},

	// Accept friend request
	async acceptFriendRequest(requestId: string): Promise<void> {
		await axios.post(`${API_BASE_URL}/friends/accept/${requestId}`, {}, getAuthHeaders());
	},

	// Reject friend request
	async rejectFriendRequest(requestId: string): Promise<void> {
		await axios.post(`${API_BASE_URL}/friends/reject/${requestId}`, {}, getAuthHeaders());
	},

	// Remove friend
	async removeFriend(friendId: string): Promise<void> {
		await axios.delete(`${API_BASE_URL}/friends/${friendId}`, getAuthHeaders());
	},

	// Update online status
	async updateStatus(): Promise<void> {
		await axios.post(`${API_BASE_URL}/friends/status`, {}, getAuthHeaders());
	},
};
