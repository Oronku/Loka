import axios from 'axios';
import { normalizeFlightNumber } from './flightNumberUtils.js';

class DuffelService {
	constructor() {
		this.apiKey = process.env.DUFFEL_API_KEY;
		this.baseUrl = 'https://api.duffel.com';
		this.headers = {
			Authorization: `Bearer ${this.apiKey}`,
			'Content-Type': 'application/json',
			'Duffel-Version': 'v2',
			Accept: 'application/json',
			'Accept-Encoding': 'gzip',
		};
	}

	isConfigured() {
		return !!this.apiKey && this.apiKey !== 'GET_FROM_duffel.com';
	}

	/** Duffel test tokens (duffel_test_…) return sandbox/fictional offers only. */
	isTestMode() {
		return String(this.apiKey || '').startsWith('duffel_test_');
	}

	/** Route search must not surface sandbox offers to users. */
	isConfiguredForRouteSearch() {
		return this.isConfigured() && !this.isTestMode();
	}

	/**
	 * Search for flights between two airports
	 * @param {string} origin - IATA code (e.g., "TLV")
	 * @param {string} destination - IATA code (e.g., "LHR")
	 * @param {string} departureDate - ISO date (e.g., "2026-01-16")
	 * @param {string} returnDate - ISO date for round trip (optional)
	 * @param {number} adults - Number of adult passengers (default: 1)
	 * @param {string} cabinClass - "economy", "premium_economy", "business", "first" (default: "economy")
	 */
	async searchFlights(origin, destination, departureDate, returnDate = null, adults = 1, cabinClass = 'economy') {
		try {
			console.log(`✈️ [Duffel] Searching flights: ${origin} → ${destination} on ${departureDate}`);

			if (!this.isConfigured()) {
				console.log('⚠️ Duffel API key not configured');
				return [];
			}

			// Build slices (one-way or round-trip)
			const slices = [
				{
					origin,
					destination,
					departure_date: departureDate,
				},
			];

			// Add return flight if specified
			if (returnDate) {
				slices.push({
					origin: destination,
					destination: origin,
					departure_date: returnDate,
				});
			}

			// Build passengers array
			const passengers = [];
			for (let i = 0; i < adults; i++) {
				passengers.push({ type: 'adult' });
			}

			// Create offer request
			const requestBody = {
				data: {
					slices,
					passengers,
					cabin_class: cabinClass,
					max_connections: 2, // Allow up to 2 stops
				},
			};

			console.log('📤 Duffel Request:', JSON.stringify(requestBody, null, 2));

			// Step 1: Create offer request
			const offerRequestResponse = await axios.post(`${this.baseUrl}/air/offer_requests`, requestBody, { headers: this.headers });

			const offerRequestId = offerRequestResponse.data.data.id;
			console.log(`📋 Offer request created: ${offerRequestId}`);

			// Step 2: Get offers (wait a bit for results)
			await new Promise((resolve) => setTimeout(resolve, 2000)); // 2 second delay

			const offersResponse = await axios.get(`${this.baseUrl}/air/offers?offer_request_id=${offerRequestId}&max_connections=2&sort=total_amount`, {
				headers: this.headers,
			});

			const offers = offersResponse.data.data || [];
			console.log(`✅ Found ${offers.length} flight offers`);

			if (offers.length === 0) {
				console.log('⚠️ No flights found');
				return [];
			}

			// Transform to our format
			const flights = offers.slice(0, 10).map((offer) => {
				const outboundSlice = offer.slices[0];
				const firstSegment = outboundSlice.segments[0];
				const lastSegment = outboundSlice.segments[outboundSlice.segments.length - 1];

				// Calculate stops
				const stops = outboundSlice.segments.length - 1;

				// Format duration (ISO 8601 duration to human readable)
				const duration = this.formatDuration(outboundSlice.duration);

				// Get airline name and IATA
				const airline = firstSegment.operating_carrier.name;
				const airlineIata =
					firstSegment.operating_carrier?.iata_code ||
					firstSegment.marketing_carrier?.iata_code ||
					'';

				// Get price
				const price = parseFloat(offer.total_amount);
				const currency = offer.total_currency;

				return {
					id: offer.id,
					airline,
					airlineIata,
					origin: firstSegment.origin.iata_code,
					destination: lastSegment.destination.iata_code,
					departureTime: firstSegment.departing_at,
					arrivalTime: lastSegment.arriving_at,
					duration,
					stops,
					price: Math.round(price),
					currency,
					cabinClass: offer.cabin_class,
					// Duffel offers can be booked directly
					bookingLink: `https://www.duffel.com/book/${offer.id}`,
					// Additional info
					segments: outboundSlice.segments.map((seg) => ({
						origin: seg.origin.iata_code,
						destination: seg.destination.iata_code,
						airline: seg.operating_carrier.name,
						airlineIata:
							seg.operating_carrier?.iata_code ||
							seg.marketing_carrier?.iata_code ||
							'',
						flightNumber: seg.operating_carrier_flight_number,
						departureTime: seg.departing_at,
						arrivalTime: seg.arriving_at,
					})),
					// For round trips, include return flight info
					returnFlight: offer.slices[1]
						? {
								departureTime: offer.slices[1].segments[0].departing_at,
								arrivalTime: offer.slices[1].segments[offer.slices[1].segments.length - 1].arriving_at,
								duration: this.formatDuration(offer.slices[1].duration),
								stops: offer.slices[1].segments.length - 1,
							}
						: null,
					affiliate: false, // Duffel is direct booking, not affiliate
					source: 'Duffel',
				};
			});

			return flights;
		} catch (error) {
			console.error('❌ Duffel API Error:', error.response?.data || error.message);
			if (error.response?.data?.errors) {
				console.error('Errors:', JSON.stringify(error.response.data.errors, null, 2));
			}
			return [];
		}
	}

	/** Fetch raw Duffel offers for a one-way route (sorted by total_amount). */
	async fetchOffersForRoute(origin, destination, departureDate, adults = 1, cabinClass = 'economy') {
		if (!this.isConfigured()) return [];

		const passengers = Array.from({ length: adults }, () => ({ type: 'adult' }));
		const requestBody = {
			data: {
				slices: [{ origin, destination, departure_date: departureDate }],
				passengers,
				cabin_class: cabinClass,
				max_connections: 2,
			},
		};

		// return_offers=true returns offers inline — avoids a second round-trip and stale IDs.
		const offerRequestResponse = await axios.post(
			`${this.baseUrl}/air/offer_requests?return_offers=true&supplier_timeout=15000`,
			requestBody,
			{ headers: this.headers },
		);

		const offers = offerRequestResponse.data.data?.offers || [];
		return offers.sort((a, b) => parseFloat(a.total_amount) - parseFloat(b.total_amount));
	}

	/** Minimum included bags across all segments (weakest link). */
	aggregateIncludedBags(offer) {
		let carryOn = Infinity;
		let checked = Infinity;

		for (const slice of offer.slices || []) {
			for (const segment of slice.segments || []) {
				let segCarry = 0;
				let segChecked = 0;
				for (const passenger of segment.passengers || []) {
					for (const bag of passenger.baggages || []) {
						if (bag.type === 'carry_on') segCarry += bag.quantity || 0;
						if (bag.type === 'checked') segChecked += bag.quantity || 0;
					}
				}
				carryOn = Math.min(carryOn, segCarry);
				checked = Math.min(checked, segChecked);
			}
		}

		return {
			carryOn: carryOn === Infinity ? 0 : carryOn,
			checked: checked === Infinity ? 0 : checked,
		};
	}

	isOfferUnavailable(error) {
		return (
			error?.response?.status === 422 &&
			error.response?.data?.errors?.some((e) => e.code === 'offer_no_longer_available')
		);
	}

	async getOfferWithServices(offerId) {
		const response = await axios.get(`${this.baseUrl}/air/offers/${offerId}?return_available_services=true`, { headers: this.headers });
		return response.data.data;
	}

	/** Greedy cost to buy `needed` bags from available services; null if impossible. */
	buyBagUnits(services, needed) {
		if (needed <= 0) return 0;
		if (!services.length) return null;

		let remaining = needed;
		let cost = 0;
		const sorted = [...services].sort((a, b) => parseFloat(a.total_amount) - parseFloat(b.total_amount));

		for (const svc of sorted) {
			const maxQty = svc.maximum_quantity ?? 1;
			const take = Math.min(remaining, maxQty);
			cost += take * parseFloat(svc.total_amount);
			remaining -= take;
			if (remaining <= 0) return cost;
		}

		return null;
	}

	computeExtraBaggageCost(availableServices, carryDeficit, checkedDeficit) {
		const services = availableServices || [];
		const carrySvcs = services.filter((s) => s.type === 'baggage' && s.metadata?.type === 'carry_on');
		const checkedSvcs = services.filter((s) => s.type === 'baggage' && s.metadata?.type === 'checked');

		const carryCost = this.buyBagUnits(carrySvcs, carryDeficit);
		if (carryCost === null) return null;
		const checkedCost = this.buyBagUnits(checkedSvcs, checkedDeficit);
		if (checkedCost === null) return null;

		return carryCost + checkedCost;
	}

	priceFromIncludedBags(offer, carryOnBags, checkedBags) {
		const base = parseFloat(offer.total_amount);
		const included = this.aggregateIncludedBags(offer);
		if (included.carryOn >= carryOnBags && included.checked >= checkedBags) {
			return {
				price: Math.round(base),
				currency: offer.total_currency,
				offerId: offer.id,
			};
		}
		return null;
	}

	segmentFlightNumber(segment) {
		const iata = segment.operating_carrier?.iata_code || segment.marketing_carrier?.iata_code || '';
		const num = segment.operating_carrier_flight_number || segment.marketing_carrier_flight_number || '';
		return normalizeFlightNumber(`${iata}${num}`);
	}

	offerMatchesFlight(offer, flightNumber) {
		const target = normalizeFlightNumber(flightNumber);
		if (!target) return false;
		const slice = offer.slices?.[0];
		if (!slice) return false;
		return (slice.segments || []).some((seg) => this.segmentFlightNumber(seg) === target);
	}

	summarizeOfferOption(offer, priced) {
		const slice = offer.slices?.[0];
		const first = slice?.segments?.[0];
		const last = slice?.segments?.[slice.segments.length - 1];
		const iata = first?.operating_carrier?.iata_code || first?.marketing_carrier?.iata_code || '';
		const num = first?.operating_carrier_flight_number || first?.marketing_carrier_flight_number || '';
		return {
			offerId: offer.id,
			airline: first?.operating_carrier?.name || first?.marketing_carrier?.name || 'Unknown',
			flightNumber: num ? `${iata}${num}`.trim() : null,
			departureTime: first?.departing_at || null,
			arrivalTime: last?.arriving_at || null,
			stops: Math.max(0, (slice?.segments?.length || 1) - 1),
			price: priced.price,
			currency: priced.currency,
		};
	}

	async priceOfferForBaggage(offer, carryOnBags, checkedBags, allowExtraFetch = true) {
		const fromIncluded = this.priceFromIncludedBags(offer, carryOnBags, checkedBags);
		if (fromIncluded) return fromIncluded;
		if (!allowExtraFetch) return null;
		return this.computeAllInPrice(offer, carryOnBags, checkedBags);
	}

	async computeAllInPrice(offer, carryOnBags, checkedBags) {
		const fromIncluded = this.priceFromIncludedBags(offer, carryOnBags, checkedBags);
		if (fromIncluded) return fromIncluded;

		const base = parseFloat(offer.total_amount);
		const included = this.aggregateIncludedBags(offer);
		const carryDeficit = Math.max(0, carryOnBags - included.carryOn);
		const checkedDeficit = Math.max(0, checkedBags - included.checked);

		try {
			const full = await this.getOfferWithServices(offer.id);
			const extra = this.computeExtraBaggageCost(full.available_services, carryDeficit, checkedDeficit);
			if (extra === null) return null;

			return {
				price: Math.round(base + extra),
				currency: offer.total_currency,
				offerId: offer.id,
			};
		} catch (error) {
			if (!this.isOfferUnavailable(error)) {
				console.error('❌ Duffel baggage pricing error:', error.response?.data || error.message);
			}
			return null;
		}
	}

	/**
	 * Route-level pricing with optional match for the saved flight number.
	 * `current` tracks the route low; matched flight is separate when found.
	 */
	async getRoutePricing(origin, destination, departureDate, baggage = {}, flightContext = {}) {
		const carryOnBags = baggage.carryOnBags ?? 1;
		const checkedBags = baggage.checkedBags ?? 0;
		const { flightNumber } = flightContext;

		if (!this.isConfigured()) return null;

		const offers = await this.fetchOffersForRoute(origin, destination, departureDate);
		if (!offers.length) return null;

		const pricedOptions = [];
		for (const offer of offers) {
			const priced = this.priceFromIncludedBags(offer, carryOnBags, checkedBags);
			if (priced) pricedOptions.push({ offer, priced });
		}

		// Try extra-bag pricing on a few unmatched offers if we have few results.
		if (pricedOptions.length < 3) {
			for (const offer of offers.slice(0, 5)) {
				if (pricedOptions.some((p) => p.offer.id === offer.id)) continue;
				const priced = await this.computeAllInPrice(offer, carryOnBags, checkedBags);
				if (priced) pricedOptions.push({ offer, priced });
			}
		}

		if (!pricedOptions.length && offers.length) {
			const cheapest = offers[0];
			pricedOptions.push({
				offer: cheapest,
				priced: {
					price: Math.round(parseFloat(cheapest.total_amount)),
					currency: cheapest.total_currency,
					offerId: cheapest.id,
				},
			});
		}

		if (!pricedOptions.length) return null;

		pricedOptions.sort((a, b) => a.priced.price - b.priced.price);

		const routeLowest = pricedOptions[0].priced;
		const alternatives = pricedOptions.slice(0, 5).map(({ offer, priced }) => this.summarizeOfferOption(offer, priced));

		let matchedFlight = null;
		if (flightNumber) {
			const matchEntry = pricedOptions.find(({ offer }) => this.offerMatchesFlight(offer, flightNumber));
			if (matchEntry) {
				matchedFlight = this.summarizeOfferOption(matchEntry.offer, matchEntry.priced);
			} else {
				const rawMatch = offers.find((offer) => this.offerMatchesFlight(offer, flightNumber));
				if (rawMatch) {
					const priced = await this.priceOfferForBaggage(rawMatch, carryOnBags, checkedBags, true);
					if (priced) matchedFlight = this.summarizeOfferOption(rawMatch, priced);
				}
			}
		}

		const hasCheaperOptions =
			(matchedFlight == null && alternatives.length > 0) ||
			(matchedFlight != null && matchedFlight.price > routeLowest.price);

		return {
			priceScope: 'route',
			price: routeLowest.price,
			currency: routeLowest.currency,
			offerId: routeLowest.offerId,
			routeLowest: routeLowest.price,
			matchedFlightPrice: matchedFlight?.price ?? null,
			matchedFlightFound: matchedFlight != null,
			hasCheaperOptions,
			cheaperBy:
				hasCheaperOptions && matchedFlight
					? matchedFlight.price - routeLowest.price
					: null,
			alternatives,
		};
	}

	/** @deprecated Use getRoutePricing — kept for callers expecting a single offer. */
	async getCheapestOffer(origin, destination, departureDate, baggage = {}) {
		const result = await this.getRoutePricing(origin, destination, departureDate, baggage);
		if (!result) return null;
		return {
			price: result.price,
			currency: result.currency,
			offerId: result.offerId,
		};
	}

	/**
	 * Advanced Duffel flight search supporting v2 API
	 * @param {object} options - All Duffel parameters (see API docs)
	 */
	async searchFlightsRaw(options) {
		try {
			if (!this.isConfigured()) {
				console.log('⚠️ Duffel API key not configured');
				return [];
			}

			// Build request body as in Duffel v2
			const requestBody = { data: { ...options } };
			console.log('📤 Duffel v2 Request:', JSON.stringify(requestBody, null, 2));

			// POST to offer_requests
			const response = await axios.post(`${this.baseUrl}/air/offer_requests?return_offers=false&supplier_timeout=10000`, requestBody, {
				headers: this.headers,
			});

			// Return full Duffel response (user can handle offers, errors, etc)
			return response.data;
		} catch (error) {
			console.error('❌ Duffel API Error:', error.response?.data || error.message);
			if (error.response?.data?.errors) {
				console.error('Errors:', JSON.stringify(error.response.data.errors, null, 2));
			}
			return { error: error.response?.data || error.message };
		}
	}

	/**
	 * Format ISO 8601 duration to human readable
	 * Example: "PT4H30M" → "4h 30m"
	 */
	formatDuration(isoDuration) {
		if (!isoDuration) return '';

		const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
		if (!match) return isoDuration;

		const hours = match[1] ? `${match[1]}h` : '';
		const minutes = match[2] ? `${match[2]}m` : '';

		return `${hours} ${minutes}`.trim();
	}

	/**
	 * Get airport suggestions for autocomplete
	 * @param {string} query - Search query (city or airport name)
	 */
	async searchAirports(query) {
		try {
			const response = await axios.get(`${this.baseUrl}/places/suggestions?query=${encodeURIComponent(query)}`, { headers: this.headers });

			const places = response.data.data || [];

			return places
				.filter((place) => place.type === 'airport')
				.map((place) => ({
					iataCode: place.iata_code,
					name: place.name,
					city: place.city_name,
					country: place.country_name,
				}));
		} catch (error) {
			console.error('❌ Duffel Airport Search Error:', error.response?.data || error.message);
			return [];
		}
	}
}

export default new DuffelService();
