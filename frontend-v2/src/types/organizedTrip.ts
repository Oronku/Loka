export interface OrganizedTrip {
  _id?: string;
  agentId: string;
  agentName: string;
  agencyName?: string;
  tripId?: string; // Reference to base trip if exists

  // Basic Info
  title: string;
  destination: string;
  description: string;
  type: 'organized';

  // Dates
  startDate: string;
  endDate: string;
  duration: number; // days

  // Capacity & Pricing
  maxParticipants: number;
  currentParticipants: number;
  pricePerPerson: number;
  currency: string;

  // Status
  status:
    | 'draft'
    | 'published'
    | 'full'
    | 'in_progress'
    | 'completed'
    | 'cancelled';

  // Visibility - who can see this trip
  visibility: 'public' | 'private' | 'draft';
  // public: appears in public trips page
  // private: accessible only via direct link (not in listings)
  // draft: only visible to agent (not published yet)

  // Tags for filtering
  tags?: string[]; // e.g., ['צילום', 'צלילה', 'משפחות', 'סקי']

  // Participants
  participants: Participant[];

  // Itinerary (day by day)
  itinerary: DayItinerary[];

  // Documents
  documents: TripDocument[];

  // Updates & Messages
  updates: TripUpdate[];

  // Included Services
  includedServices: string[];
  notIncludedServices: string[];

  // Important Info
  meetingPoint?: string;
  importantNotes?: string;

  // Images
  coverImage?: string;
  gallery?: string[];

  // Metadata
  createdAt: string;
  updatedAt: string;
}

export interface Participant {
  _id?: string;
  userId?: string; // null if not registered yet
  email: string;
  name: string;
  phone?: string;
  status: 'invited' | 'confirmed' | 'paid' | 'cancelled';
  isRegistered: boolean; // true if user has an account in the system
  invitedAt: string;
  joinedAt?: string;
  confirmedAt?: string;
  paidAt?: string;
  paidAmount: number;
  personalDocs: PersonalDocument[];
  notes?: string;
}

export interface PersonalDocument {
  type:
    | 'passport'
    | 'visa'
    | 'insurance'
    | 'flight_ticket'
    | 'hotel_voucher'
    | 'other';
  fileName: string;
  url: string;
  uploadedAt: string;
  expiryDate?: string;
}

export interface DayItinerary {
  day: number;
  date: string;
  title: string;
  description?: string;

  // Accommodation
  accommodation?: {
    name: string;
    address: string;
    checkIn?: string;
    checkOut?: string;
    roomType?: string;
    confirmationNumber?: string;
  };

  // Meals
  meals?: {
    breakfast: boolean;
    lunch: boolean;
    dinner: boolean;
    details?: string;
  };

  // Activities
  activities: Activity[];

  // Transportation
  transportation?: {
    type: 'flight' | 'bus' | 'train' | 'car' | 'boat' | 'other';
    from: string;
    to: string;
    departureTime?: string;
    arrivalTime?: string;
    details?: string;
  }[];

  // Free time
  freeTime?: string;

  // Notes
  notes?: string;
}

export interface Activity {
  type?: 'accommodation' | 'meal' | 'attraction' | 'transport' | 'other';
  time?: string;
  title: string;
  description?: string;
  location?: string;
  duration?: string;
  included: boolean;
  price?: number;
  bookingRequired: boolean;
}

export interface TripDocument {
  _id?: string;
  type:
    | 'flight'
    | 'hotel'
    | 'insurance'
    | 'itinerary'
    | 'visa'
    | 'general'
    | 'other';
  title: string;
  fileName: string;
  url: string;
  forUser?: string; // null = for all participants, userId = for specific user
  uploadedAt: string;
  uploadedBy: string;
}

export interface TripUpdate {
  _id?: string;
  tripId: string;
  agentId: string;
  agentName: string;
  type: 'announcement' | 'document' | 'itinerary_change' | 'reminder';
  title: string;
  message: string;
  recipients: string[]; // Empty = all participants
  createdAt: string;
  read?: boolean;
}

// For creating new trip
export interface CreateOrganizedTripData {
  title: string;
  destination: string;
  description: string;
  startDate: string;
  endDate: string;
  maxParticipants: number;
  pricePerPerson: number;
  currency: string;
  includedServices: string[];
  notIncludedServices: string[];
  visibility: 'public' | 'private' | 'draft'; // Added visibility
  tags?: string[]; // Added tags
  coverImage?: string;
  meetingPoint?: string;
  importantNotes?: string;
}
