import { api } from './api';
import {
  OrganizedTrip,
  CreateOrganizedTripData,
  TripUpdate,
  TripDocument,
} from '../types/organizedTrip';

// Get agent statistics
export async function getAgentStats() {
  const response = await api.get('/agent/dashboard/stats');
  return response.data;
}

// Get all organized trips for the agent
export async function getAgentTrips(): Promise<OrganizedTrip[]> {
  const response = await api.get('/agent/trips');
  return response.data;
}

// Create new organized trip
export async function createOrganizedTrip(
  tripData: CreateOrganizedTripData
): Promise<OrganizedTrip> {
  const response = await api.post('/agent/trips/create', tripData);
  return response.data;
}

// Get specific trip details
export async function getOrganizedTrip(tripId: string): Promise<OrganizedTrip> {
  const response = await api.get(`/agent/trips/${tripId}`);
  return response.data;
}

// Update trip
export async function updateOrganizedTrip(
  tripId: string,
  updates: Partial<OrganizedTrip>
) {
  const response = await api.put(`/agent/trips/${tripId}`, updates);
  return response.data;
}

// Invite participant
export async function inviteParticipant(
  tripId: string,
  participantData: {
    userId?: string;
    email: string;
    name: string;
    phone?: string;
  }
) {
  const response = await api.post(
    `/agent/trips/${tripId}/invite`,
    participantData
  );
  return response.data;
}

// Send update to participants
export async function sendTripUpdate(
  tripId: string,
  updateData: {
    type: 'announcement' | 'document' | 'itinerary_change' | 'reminder';
    title: string;
    message: string;
    recipients?: string[];
  }
) {
  const response = await api.post(`/agent/trips/${tripId}/update`, updateData);
  return response.data;
}

// Upload document
export async function uploadTripDocument(
  tripId: string,
  documentData: {
    type: string;
    title: string;
    fileName: string;
    url: string;
    forUser?: string;
  }
) {
  const response = await api.post(
    `/agent/trips/${tripId}/documents`,
    documentData
  );
  return response.data;
}

// Publish trip (change status from draft to published)
export async function publishTrip(tripId: string) {
  return updateOrganizedTrip(tripId, { status: 'published' });
}

// Cancel trip
export async function cancelTrip(tripId: string) {
  return updateOrganizedTrip(tripId, { status: 'cancelled' });
}

// Update trip visibility
export async function updateTripVisibility(
  tripId: string,
  visibility: 'public' | 'private' | 'draft'
) {
  const response = await api.patch(`/agent/trips/${tripId}/visibility`, {
    visibility,
  });
  return response.data;
}

// Get trip updates
export async function getTripUpdates(tripId: string): Promise<TripUpdate[]> {
  const response = await api.get(`/agent/trips/${tripId}/updates`);
  return response.data;
}

// For participants (public endpoints)
export async function getPublicOrganizedTrip(
  tripId: string
): Promise<OrganizedTrip> {
  const response = await api.get(`/organized-trips/${tripId}`);
  return response.data;
}

export async function joinOrganizedTrip(
  tripId: string,
  userData: {
    name: string;
    email: string;
    phone?: string;
  }
) {
  const response = await api.post(`/organized-trips/${tripId}/join`, userData);
  return response.data;
}

export async function getMyTripDocuments(
  tripId: string
): Promise<TripDocument[]> {
  const response = await api.get(`/organized-trips/${tripId}/my-documents`);
  return response.data;
}
