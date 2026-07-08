// Buffer added after a flight lands before any onward drive can begin
// (deplaning, baggage, walking to ground transport). Applied to the leg/transfer
// that immediately follows a flight.
export const POST_FLIGHT_BUFFER_SECONDS = 30 * 60;

// How early the traveller should be at the airport before an outbound flight
// departs (check-in, security, boarding). Applied by the departure-transfer
// generator to work out when to leave the hotel. Overridable per trip via
// `trip.airportArrivalBufferMinutes`.
export const DEFAULT_AIRPORT_ARRIVAL_BUFFER_SECONDS = 2 * 60 * 60;
