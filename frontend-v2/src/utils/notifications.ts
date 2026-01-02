import type {
  Trip,
  TripNotification,
  FlightSegment,
  HotelBooking,
  AttractionVisit,
} from '../types/domain';

/**
 * Generate smart notifications for a trip based on flights, hotels, and attractions
 */
export function generateTripNotifications(trip: Trip): TripNotification[] {
  const notifications: TripNotification[] = [];
  const now = new Date();

  // Flight Notifications
  if (trip.flights && Array.isArray(trip.flights)) {
    trip.flights.forEach((flight, index) => {
      const departureTime = new Date(flight.departureDateTime);
      const timeDiff = departureTime.getTime() - now.getTime();
      const hoursUntilFlight = timeDiff / (1000 * 60 * 60);

      // 24 hours before: Check-in reminder
      const checkinTime = new Date(
        departureTime.getTime() - 24 * 60 * 60 * 1000
      );
      if (checkinTime > now) {
        notifications.push({
          id: `flight-checkin-${trip.id}-${index}`,
          tripId: trip.id,
          type: 'flight-checkin',
          title: '✈️ Time for Online Check-in!',
          message: `Your flight ${flight.flightNumber || 'N/A'} departs in 24 hours. Check in now to get a better seat!`,
          priority: 'high',
          triggerTime: checkinTime.toISOString(),
          relatedItemType: 'flight',
          relatedItemIndex: index,
          actionLabel: 'Check In Online',
        });
      }

      // Check for no checked baggage warning
      if (
        !flight.checkedBag &&
        hoursUntilFlight > 0 &&
        hoursUntilFlight <= 48
      ) {
        notifications.push({
          id: `flight-no-bag-${trip.id}-${index}`,
          tripId: trip.id,
          type: 'flight-no-baggage',
          title: '🎒 No Checked Baggage',
          message: `Your flight ${flight.flightNumber || 'N/A'} has no checked baggage. Pack light and follow carry-on restrictions!`,
          priority: 'medium',
          triggerTime: new Date(
            departureTime.getTime() - 36 * 60 * 60 * 1000
          ).toISOString(),
          relatedItemType: 'flight',
          relatedItemIndex: index,
        });
      }

      // Arrival time reminder based on flight type
      const isInternational =
        flight.departureAirportCode?.length === 3 &&
        flight.arrivalAirportCode?.length === 3;
      const arriveEarlyHours = isInternational ? 3 : 2;
      const arrivalReminderTime = new Date(
        departureTime.getTime() - arriveEarlyHours * 60 * 60 * 1000
      );

      if (arrivalReminderTime > now) {
        notifications.push({
          id: `flight-arrive-${trip.id}-${index}`,
          tripId: trip.id,
          type: 'flight-arrive-early',
          title: `🕐 Time to Head to the Airport`,
          message: `Your flight ${flight.flightNumber || 'N/A'} departs at ${departureTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}. ${isInternational ? 'International flight - arrive 3 hours early!' : 'Arrive 2 hours early for domestic flights.'}`,
          priority: 'critical',
          triggerTime: arrivalReminderTime.toISOString(),
          relatedItemType: 'flight',
          relatedItemIndex: index,
        });
      }

      // Departure reminder (3 hours before for critical alert)
      const departureReminderTime = new Date(
        departureTime.getTime() - 3 * 60 * 60 * 1000
      );
      if (departureReminderTime > now) {
        notifications.push({
          id: `flight-departure-${trip.id}-${index}`,
          tripId: trip.id,
          type: 'flight-departure',
          title: `✈️ Flight Departing Soon`,
          message: `Flight ${flight.flightNumber || 'N/A'} from ${flight.departureAirportCode || 'N/A'} to ${flight.arrivalAirportCode || 'N/A'} departs in 3 hours!`,
          priority: 'high',
          triggerTime: departureReminderTime.toISOString(),
          relatedItemType: 'flight',
          relatedItemIndex: index,
        });
      }
    });
  }

  // Hotel Notifications
  if (trip.hotels && Array.isArray(trip.hotels)) {
    trip.hotels.forEach((hotel, index) => {
      const checkInDate = new Date(hotel.checkIn + 'T14:00:00'); // Assume 2 PM check-in
      const checkOutDate = new Date(hotel.checkOut + 'T11:00:00'); // Assume 11 AM checkout
      const earlyArrival = hotel.arrivalTime
        ? new Date(hotel.checkIn + 'T' + hotel.arrivalTime)
        : null;

      // Check-in reminder (1 day before)
      const checkinReminderTime = new Date(
        checkInDate.getTime() - 24 * 60 * 60 * 1000
      );
      if (checkinReminderTime > now) {
        notifications.push({
          id: `hotel-checkin-${trip.id}-${index}`,
          tripId: trip.id,
          type: 'hotel-checkin',
          title: '🏨 Hotel Check-in Tomorrow',
          message: `Checking into ${hotel.name} tomorrow at ${checkInDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}. Have your booking confirmation ready!`,
          priority: 'medium',
          triggerTime: checkinReminderTime.toISOString(),
          relatedItemType: 'hotel',
          relatedItemIndex: index,
        });
      }

      // Early arrival warning
      if (earlyArrival && earlyArrival < checkInDate) {
        const earlyArrivalWarning = new Date(
          earlyArrival.getTime() - 2 * 60 * 60 * 1000
        );
        if (earlyArrivalWarning > now) {
          notifications.push({
            id: `hotel-early-${trip.id}-${index}`,
            tripId: trip.id,
            type: 'hotel-early-arrival',
            title: '⏰ Early Hotel Arrival',
            message: `You're arriving at ${hotel.name} at ${earlyArrival.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}, before standard check-in time. Consider requesting early check-in or luggage storage.`,
            priority: 'medium',
            triggerTime: earlyArrivalWarning.toISOString(),
            relatedItemType: 'hotel',
            relatedItemIndex: index,
          });
        }
      }

      // Checkout reminder (morning of checkout)
      const checkoutReminderTime = new Date(
        checkOutDate.getTime() - 2 * 60 * 60 * 1000
      ); // 2 hours before
      if (checkoutReminderTime > now) {
        notifications.push({
          id: `hotel-checkout-${trip.id}-${index}`,
          tripId: trip.id,
          type: 'hotel-checkout',
          title: '🏨 Hotel Checkout Today',
          message: `Check out from ${hotel.name} by ${checkOutDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}. Don't forget to check the room for belongings!`,
          priority: 'high',
          triggerTime: checkoutReminderTime.toISOString(),
          relatedItemType: 'hotel',
          relatedItemIndex: index,
        });
      }

      // Meal plan reminder
      if (hotel.includesMeals && hotel.mealPlan) {
        const firstDayBreakfast = new Date(
          new Date(hotel.checkIn).getTime() + 24 * 60 * 60 * 1000
        );
        firstDayBreakfast.setHours(7, 30, 0, 0);
        if (firstDayBreakfast > now) {
          let mealInfo = '';
          if (hotel.mealPlan === 'breakfast') mealInfo = 'Breakfast included';
          else if (hotel.mealPlan === 'half-board')
            mealInfo = 'Breakfast and dinner included';
          else if (hotel.mealPlan === 'all-inclusive')
            mealInfo = 'All meals included';

          notifications.push({
            id: `hotel-meals-${trip.id}-${index}`,
            tripId: trip.id,
            type: 'hotel-checkin',
            title: '🍳 Hotel Meals Included',
            message: `${mealInfo} at ${hotel.name}. Check meal times at reception.`,
            priority: 'low',
            triggerTime: firstDayBreakfast.toISOString(),
            relatedItemType: 'hotel',
            relatedItemIndex: index,
          });
        }
      }
    });
  }

  // Attraction Notifications
  if (trip.attractions && Array.isArray(trip.attractions)) {
    trip.attractions.forEach((attraction, index) => {
      if (!attraction.scheduledDate) return;

      const attractionDateTime = new Date(
        attraction.scheduledDate +
          'T' +
          (attraction.scheduledTime || '10:00:00')
      );
      const reminderTime = new Date(
        attractionDateTime.getTime() - 24 * 60 * 60 * 1000
      );

      if (reminderTime > now) {
        notifications.push({
          id: `attraction-reminder-${trip.id}-${index}`,
          tripId: trip.id,
          type: 'attraction-reminder',
          title: '🎭 Attraction Tomorrow',
          message: `${attraction.name} is scheduled for tomorrow at ${attractionDateTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`,
          priority: 'medium',
          triggerTime: reminderTime.toISOString(),
          relatedItemType: 'attraction',
          relatedItemIndex: index,
        });
      }

      // Tickets reminder if cost is specified
      if (attraction.cost && attraction.cost > 0) {
        const ticketReminderTime = new Date(
          attractionDateTime.getTime() - 48 * 60 * 60 * 1000
        );
        if (ticketReminderTime > now) {
          notifications.push({
            id: `attraction-tickets-${trip.id}-${index}`,
            tripId: trip.id,
            type: 'attraction-tickets',
            title: '🎫 Book Attraction Tickets',
            message: `Consider booking tickets for ${attraction.name} in advance to avoid long queues. Visit scheduled in 2 days.`,
            priority: 'low',
            triggerTime: ticketReminderTime.toISOString(),
            relatedItemType: 'attraction',
            relatedItemIndex: index,
            actionLabel: 'Find Tickets',
          });
        }
      }
    });
  }

  // Sort notifications by trigger time
  return notifications.sort(
    (a, b) =>
      new Date(a.triggerTime).getTime() - new Date(b.triggerTime).getTime()
  );
}

/**
 * Get active notifications (should be shown now)
 */
export function getActiveNotifications(
  notifications: TripNotification[]
): TripNotification[] {
  const now = new Date();
  return notifications.filter((notif) => {
    if (notif.dismissed) return false;
    const triggerTime = new Date(notif.triggerTime);
    // Show notifications from trigger time up to 24 hours after
    const expiryTime = new Date(triggerTime.getTime() + 24 * 60 * 60 * 1000);
    return now >= triggerTime && now <= expiryTime;
  });
}

/**
 * Get upcoming notifications (will show in the future)
 */
export function getUpcomingNotifications(
  notifications: TripNotification[]
): TripNotification[] {
  const now = new Date();
  return notifications.filter((notif) => {
    if (notif.dismissed) return false;
    const triggerTime = new Date(notif.triggerTime);
    return now < triggerTime;
  });
}

/**
 * Format time until notification
 */
export function formatTimeUntil(triggerTime: string): string {
  const now = new Date();
  const trigger = new Date(triggerTime);
  const diffMs = trigger.getTime() - now.getTime();

  if (diffMs < 0) return 'Now';

  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);

  if (days > 0) return `in ${days} day${days > 1 ? 's' : ''}`;
  if (hours > 0) return `in ${hours} hour${hours > 1 ? 's' : ''}`;

  const minutes = Math.floor(diffMs / (1000 * 60));
  return `in ${minutes} minute${minutes > 1 ? 's' : ''}`;
}
