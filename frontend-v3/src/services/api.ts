import axios from 'axios';
import type { Trip, FlightSegment, HotelBooking, RideLeg, AttractionVisit } from '../types/domain';
import { API_BASE_URL } from '../config/api';

// Axios instance with centralized API configuration
export const api = axios.create({ baseURL: API_BASE_URL });

// Add request interceptor to include auth token
api.interceptors.request.use((config) => {
	const token = localStorage.getItem('authToken');
	if (token) {
		config.headers.Authorization = `Bearer ${token}`;
	}
	return config;
});

// Add response interceptor to handle 401 errors
api.interceptors.response.use(
	(response) => response,
	(error) => {
		if (error.response?.status === 401) {
			// Token expired or invalid - clear auth and redirect to login
			localStorage.removeItem('authToken');
			localStorage.removeItem('user');
			window.location.href = '/';
		}
		return Promise.reject(error);
	},
);

export const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

export interface User {
	id: string;
	email: string;
	name: string;
	picture?: string;
	preferredCurrency?: string;
	provider?: string;
	isAdmin?: boolean;
	isAgent?: boolean;
	isAgencyAdmin?: boolean;
	agencyName?: string;
	agencyLicense?: string;
	agencyDescription?: string;
}

export async function login(email: string, password: string): Promise<{ user: User; token: string }> {
	const res = await api.post<{ user: User; token: string }>('/auth/login', {
		email,
		password,
	});
	return res.data;
}

export async function register(email: string, password: string, name: string): Promise<{ user: User; token: string }> {
	const res = await api.post<{ user: User; token: string }>('/auth/register', {
		email,
		password,
		name,
	});
	return res.data;
}

export async function listTrips(): Promise<Trip[]> {
	const res = await api.get<Trip[]>('/trips');
	return res.data;
}

export async function getTrip(id: string): Promise<Trip> {
	const res = await api.get<Trip>(`/trips/${id}`);
	return res.data;
}

export async function createTrip(data: Partial<Trip>): Promise<Trip> {
	const res = await api.post<Trip>('/trips', data);
	return res.data;
}

export async function updateTrip(id: string, updates: Partial<Trip>): Promise<Trip> {
	const res = await api.put<Trip>(`/trips/${id}`, updates);
	return res.data;
}

export async function updateUserChecklist(id: string, checklist: any[]): Promise<Trip> {
	const res = await api.put<Trip>(`/trips/${id}/checklist`, { checklist });
	return res.data;
}

export async function deleteTrip(id: string): Promise<void> {
	await api.delete(`/trips/${id}`);
}

// ============= EXPENSE MANAGEMENT =============
export async function addExpense(tripId: string, expense: any): Promise<Trip> {
	const res = await api.post<Trip>(`/trips/${tripId}/expenses`, { expense });
	return res.data;
}

export async function updateExpense(tripId: string, expenseId: string, expense: any): Promise<Trip> {
	const res = await api.put<Trip>(`/trips/${tripId}/expenses/${expenseId}`, {
		expense,
	});
	return res.data;
}

export async function deleteExpense(tripId: string, expenseId: string): Promise<Trip> {
	const res = await api.delete<Trip>(`/trips/${tripId}/expenses/${expenseId}`);
	return res.data;
}

export async function updateParticipantPermission(tripId: string, userId: string, permission: 'disable' | 'view' | 'edit'): Promise<Trip> {
	const res = await api.put<Trip>(`/trips/${tripId}/participants/${userId}/permission`, { permission });
	return res.data;
}

export async function getExpenseBalances(tripId: string): Promise<any> {
	const res = await api.get(`/trips/${tripId}/expenses/balances`);
	return res.data;
}

// Trip sub-resource mutations
export async function addFlightToTrip(tripId: string, flight: any): Promise<Trip> {
	const res = await api.post<Trip>(`/trips/${tripId}/flights`, flight);
	return res.data;
}
export async function addHotelToTrip(tripId: string, hotel: any): Promise<Trip> {
	const res = await api.post<Trip>(`/trips/${tripId}/hotels`, hotel);
	return res.data;
}
export async function addRideToTrip(tripId: string, ride: any): Promise<Trip> {
	const res = await api.post<Trip>(`/trips/${tripId}/rides`, ride);
	return res.data;
}
export async function addAttractionToTrip(tripId: string, attraction: any): Promise<Trip> {
	const res = await api.post<Trip>(`/trips/${tripId}/attractions`, attraction);
	return res.data;
}

// Delete trip items by type and index
export async function deleteFlightFromTrip(tripId: string, index: number): Promise<Trip> {
	const res = await api.delete<Trip>(`/trips/${tripId}/flights/${index}`);
	return res.data;
}
export async function deleteHotelFromTrip(tripId: string, index: number): Promise<Trip> {
	const res = await api.delete<Trip>(`/trips/${tripId}/hotels/${index}`);
	return res.data;
}
export async function deleteRideFromTrip(tripId: string, index: number): Promise<Trip> {
	const res = await api.delete<Trip>(`/trips/${tripId}/rides/${index}`);
	return res.data;
}
export async function deleteAttractionFromTrip(tripId: string, index: number): Promise<Trip> {
	const res = await api.delete<Trip>(`/trips/${tripId}/attractions/${index}`);
	return res.data;
}

// Flights search via backend proxy
export async function searchFlightByNumber(flightNumber: string, date: string) {
	const res = await api.get(`/flights/search/${encodeURIComponent(flightNumber)}`, { params: { date } });
	return res.data;
}

// Flights by route
export async function searchFlightsByRoute(from: string, to: string, date: string, opts?: { directOnly?: boolean; airline?: string }) {
	const params: any = { from, to, date };
	if (opts?.directOnly !== undefined) params.directOnly = String(opts.directOnly);
	if (opts?.airline) params.airline = opts.airline;
	const res = await api.get('/flights/search-route', { params });
	return res.data as { flights: Array<any> };
}

// Airports autocomplete/search
export async function searchAirports(query: string) {
	const res = await api.get('/flights/airports/search', { params: { query } });
	return res.data as {
		airports: Array<{
			code: string;
			name: string;
			city: string;
			country: string;
		}>;
	};
}

// Hotels via backend
export async function hotelAutocomplete(input: string) {
	const res = await api.get('/hotels/autocomplete', { params: { input } });
	return res.data;
}
export async function hotelDetails(place_id: string) {
	const res = await api.get('/hotels/details', { params: { place_id } });
	return res.data;
}
export async function hotelDistanceFromAirport(hotel_place_id: string, airport_code: string) {
	const res = await api.get('/hotels/distance-from-airport', {
		params: { hotel_place_id, airport_code },
	});
	return res.data;
}

// Rides / Distance
export async function rideDistance(from: string, to: string, mode: string = 'driving') {
	const res = await api.get('/rides/distance', { params: { from, to, mode } });
	return res.data;
}

export async function calculateRideRoute(origin: string, destination: string) {
	const res = await api.post('/rides/calculate-route', { origin, destination });
	return res.data;
}

// Calculate smart checkout time based on flight and hotel location
export async function calculateSmartCheckoutTime(
	hotelAddress: string,
	airportCode: string,
	flightDepartureTime: string,
): Promise<{
	checkoutTime: string;
	driveDurationMinutes: number;
	distance: string;
	shouldCreateRide: boolean;
	lateNightFlight: boolean;
}> {
	const res = await api.post('/rides/smart-checkout', {
		hotelAddress,
		airportCode,
		flightDepartureTime,
	});
	return res.data;
}

// Places / Attractions
export async function placesAutocomplete(input: string, types: string = 'establishment') {
	const res = await api.get('/places/autocomplete', {
		params: { input, types },
	});
	return res.data;
}

// Cities autocomplete - specifically for cities
export async function citiesAutocomplete(input: string) {
	const res = await api.get('/places/autocomplete', {
		params: { input, types: '(cities)' },
	});
	return res.data;
}

export async function placeDetails(place_id: string) {
	const res = await api.get('/places/details', { params: { place_id } });
	return res.data;
}

// Trip Sharing
export async function shareTrip(
	tripId: string,
	emails: string[],
	expensePermissions?: Record<string, 'disable' | 'view' | 'edit'>,
): Promise<{ message: string; sharedWith: any[] }> {
	const res = await api.post(`/trips/${tripId}/share`, {
		emails,
		expensePermissions,
	});
	return res.data;
}

export async function revokeAccess(tripId: string, userId: string): Promise<{ message: string; sharedWith: any[] }> {
	const res = await api.delete(`/trips/${tripId}/share/${userId}`);
	return res.data;
}

// User Profile
export async function getUserProfile(): Promise<User> {
	const res = await api.get<User>('/auth/profile');
	return res.data;
}

export async function updateUserProfile(data: { name?: string; preferredCurrency?: string }): Promise<User> {
	const res = await api.put<User>('/auth/profile', data);
	return res.data;
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<{ message: string }> {
	const res = await api.put<{ message: string }>('/auth/change-password', {
		currentPassword,
		newPassword,
	});
	return res.data;
}
