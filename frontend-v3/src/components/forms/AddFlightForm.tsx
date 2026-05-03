import { useState, useEffect } from 'react';
import SearchAutocomplete from '../SearchAutocomplete';
import PDFUploadButton from '../PDFUploadButton';
import type { Trip } from '../../types/domain';
import {
	TextField,
	Button,
	Stack,
	Alert,
	FormControlLabel,
	Checkbox,
	CircularProgress,
	Grid,
	MenuItem,
	Select,
	FormControl,
	InputLabel,
	Box,
	Paper,
	Typography,
	Card,
	CardContent,
	Chip,
	Tabs,
	Tab,
} from '@mui/material';
import { addFlightToTrip, deleteFlightFromTrip, searchFlightByNumber, searchFlightsByRoute, searchAirports } from '../../services/api';
import { API_BASE_URL } from '../../config/api';

/**
 * Parse and format a datetime string while preserving the original timezone.
 * Handles formats like "2025-11-13 10:20+04:00" or "2025-11-13T10:20:00+04:00"
 * Returns the time and date in the original timezone, not converted to user's local time.
 */
function formatDateTimeLocal(dateTimeStr: string): {
	date: string;
	time: string;
	full: string;
} {
	if (!dateTimeStr) return { date: '', time: '', full: '' };

	// Handle both ISO format (2025-11-13T10:20:00+04:00) and space format (2025-11-13 10:20+04:00)
	const parts = dateTimeStr.includes('T') ? dateTimeStr.split('T') : dateTimeStr.split(' ');

	const datePart = parts[0]; // "2025-11-13"
	const timePart = parts[1]?.split(/[+-]/)[0] || ''; // "10:20:00" or "10:20"
	const timeOnly = timePart.slice(0, 5); // "10:20"

	// Format full datetime for display (date + time, no timezone conversion)
	const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
	const [year, month, day] = datePart.split('-');
	const formattedDate = `${monthNames[parseInt(month) - 1]} ${parseInt(day)}, ${year}`;
	const formattedTime = timeOnly;

	return {
		date: datePart,
		time: timeOnly,
		full: `${formattedDate} ${formattedTime}`,
	};
}

export function AddFlightForm({
	tripId,
	onUpdated,
	onDone,
	initialData,
	editIndex = -1,
}: {
	tripId: string;
	onUpdated: (t: Trip) => void;
	onDone?: () => void;
	initialData?: any;
	editIndex?: number;
}) {
	const [mode, setMode] = useState<'search' | 'route' | 'manual'>('search');
	const [flightNumber, setFlightNumber] = useState('');
	const [date, setDate] = useState('');
	const [flightData, setFlightData] = useState<any | null>(null);

	// Route search fields
	const [origin, setOrigin] = useState<any | null>(null);
	const [destination, setDestination] = useState<any | null>(null);
	const [routeFlights, setRouteFlights] = useState<any[]>([]);
	const [selectedFlight, setSelectedFlight] = useState<any | null>(null);

	// Manual entry fields
	const [airline, setAirline] = useState('');
	const [departureAirport, setDepartureAirport] = useState('');
	const [arrivalAirport, setArrivalAirport] = useState('');
	const [departureTime, setDepartureTime] = useState('');
	const [arrivalTime, setArrivalTime] = useState('');

	// User inputs
	const [cost, setCost] = useState<string>('');
	const [numberOfTickets, setNumberOfTickets] = useState<string>('');
	const [costType, setCostType] = useState<'per-ticket' | 'total'>('total');
	const [carryOn, setCarryOn] = useState(false);
	const [checked, setChecked] = useState(false);
	const [bookingNumber, setBookingNumber] = useState('');
	const [bookingAgency, setBookingAgency] = useState('');

	const [searching, setSearching] = useState(false);
	const [busy, setBusy] = useState(false);
	const [err, setErr] = useState<string | null>(null);

	// Real prices from affiliate API
	const [realPrices, setRealPrices] = useState<any>(null);
	const [loadingPrices, setLoadingPrices] = useState(false);

	// Populate form with initial data when editing
	useEffect(() => {
		if (initialData) {
			// Set mode to manual since we're showing existing data
			setMode('manual');

			// Populate all fields from initialData
			setAirline(initialData.airline || '');
			setFlightNumber(initialData.flightNumber || '');
			setDepartureAirport(initialData.departureAirportCode || '');
			setArrivalAirport(initialData.arrivalAirportCode || '');

			// Parse departure date and time
			if (initialData.departureDateTime) {
				const parsed = formatDateTimeLocal(initialData.departureDateTime);
				setDate(parsed.date);
				setDepartureTime(parsed.time);
			}

			// Parse arrival time
			if (initialData.arrivalDateTime) {
				const parsed = formatDateTimeLocal(initialData.arrivalDateTime);
				setArrivalTime(parsed.time);
			}

			// Set cost and ticket info
			setCost(initialData.cost ? String(initialData.cost) : '');
			setNumberOfTickets(initialData.numberOfTickets ? String(initialData.numberOfTickets) : '');
			setCostType(initialData.costType || 'total');

			// Set baggage options
			setCarryOn(initialData.carryOn || false);
			setChecked(initialData.checkedBag || false);

			// Set booking info
			setBookingNumber(initialData.bookingNumber || '');
			setBookingAgency(initialData.bookingAgency || '');
		}
	}, [initialData]);

	async function searchFlight() {
		if (!flightNumber.trim() || !date) return;
		setErr(null);
		setSearching(true);
		setFlightData(null);
		try {
			const data = await searchFlightByNumber(flightNumber.trim(), date);
			setFlightData(data);
		} catch (e: any) {
			setErr(e?.response?.data?.message || e.message);
			setFlightData(null);
		} finally {
			setSearching(false);
		}
	}

	async function searchRoute() {
		if (!origin?.code || !destination?.code || !date) return;
		setErr(null);
		setSearching(true);
		setRouteFlights([]);
		setSelectedFlight(null);
		try {
			const data = await searchFlightsByRoute(origin.code, destination.code, date);
			setRouteFlights(data.flights || []);
		} catch (e: any) {
			setErr(e?.response?.data?.message || e.message);
			setRouteFlights([]);
		} finally {
			setSearching(false);
		}
	}

	// Fetch real prices from Travelpayouts API
	async function fetchRealPrices() {
		const flight = flightData || selectedFlight;
		if (!flight) return;

		const originCode = flight.departureAirportCode || flight.departure?.iata;
		const destCode = flight.arrivalAirportCode || flight.arrival?.iata;

		if (!originCode || !destCode || !date) return;

		setLoadingPrices(true);
		setRealPrices(null);
		try {
			const response = await fetch(`${API_BASE_URL}/ai/get-real-prices`, {
				method: 'POST',
				credentials: 'include',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					origin: originCode,
					destination: destCode,
					checkIn: date,
					checkOut: date, // Same day for flights
				}),
			});

			if (response.ok) {
				const data = await response.json();
				setRealPrices(data);
			}
		} catch (e: any) {
			console.error('Failed to fetch real prices:', e);
		} finally {
			setLoadingPrices(false);
		}
	}

	async function saveFlight() {
		setErr(null);
		setBusy(true);
		try {
			let segment: any;

			if (mode === 'search' && flightData) {
				// Save from API search by flight number
				segment = {
					airline: flightData.airline,
					flightNumber: flightData.flightNumber || flightNumber.trim(),
					departureAirportCode: flightData.departureAirportCode,
					arrivalAirportCode: flightData.arrivalAirportCode,
					departureDateTime: flightData.departureDateTime,
					arrivalDateTime: flightData.arrivalDateTime,
					durationMinutes: flightData.durationMinutes,
					aircraftType: flightData.aircraftType,
					terminal: flightData.terminal,
					gate: flightData.gate,
					cost: cost ? Number(cost) : undefined,
					numberOfTickets: numberOfTickets ? Number(numberOfTickets) : undefined,
					costType: costType,
					carryOn,
					checkedBag: checked,
					bookingNumber: bookingNumber || undefined,
					bookingAgency: bookingAgency || undefined,
				};
			} else if (mode === 'route' && selectedFlight) {
				// Save from route search - transform nested structure to flat
				segment = {
					airline: selectedFlight.airline,
					flightNumber: selectedFlight.flightNumber,
					departureAirportCode: selectedFlight.departure?.iata || selectedFlight.departureAirportCode,
					arrivalAirportCode: selectedFlight.arrival?.iata || selectedFlight.arrivalAirportCode,
					departureDateTime: selectedFlight.departure?.scheduled || selectedFlight.departureDateTime,
					arrivalDateTime: selectedFlight.arrival?.scheduled || selectedFlight.arrivalDateTime,
					durationMinutes: selectedFlight.durationMinutes,
					aircraftType: selectedFlight.aircraft || selectedFlight.aircraftType,
					terminal: {
						departure: selectedFlight.departure?.terminal,
						arrival: selectedFlight.arrival?.terminal,
					},
					gate: selectedFlight.gate,
					cost: cost ? Number(cost) : undefined,
					numberOfTickets: numberOfTickets ? Number(numberOfTickets) : undefined,
					costType: costType,
					carryOn,
					checkedBag: checked,
					bookingNumber: bookingNumber || undefined,
					bookingAgency: bookingAgency || undefined,
				};
			} else {
				// Save manual entry
				const depDateTime = date && departureTime ? `${date}T${departureTime}` : date;
				const arrDateTime = date && arrivalTime ? `${date}T${arrivalTime}` : date;

				segment = {
					airline: airline || 'Unknown',
					flightNumber: flightNumber.trim(),
					departureAirportCode: departureAirport.toUpperCase(),
					arrivalAirportCode: arrivalAirport.toUpperCase(),
					departureDateTime: depDateTime,
					arrivalDateTime: arrDateTime,
					cost: cost ? Number(cost) : undefined,
					numberOfTickets: numberOfTickets ? Number(numberOfTickets) : undefined,
					costType: costType,
					carryOn,
					checkedBag: checked,
					bookingNumber: bookingNumber || undefined,
					bookingAgency: bookingAgency || undefined,
				};
			}

			let updated: Trip;

			// If editing an existing flight (editIndex >= 0), delete the old one first
			if (editIndex >= 0) {
				updated = await deleteFlightFromTrip(tripId, editIndex);
				updated = await addFlightToTrip(tripId, segment);
			} else {
				// Adding a new flight
				updated = await addFlightToTrip(tripId, segment);
			}

			onUpdated(updated);

			// Reset form
			setFlightNumber('');
			setDate('');
			setFlightData(null);
			setOrigin(null);
			setDestination(null);
			setRouteFlights([]);
			setSelectedFlight(null);
			setAirline('');
			setDepartureAirport('');
			setArrivalAirport('');
			setDepartureTime('');
			setArrivalTime('');
			setCost('');
			setNumberOfTickets('');
			setCostType('total');
			setCarryOn(false);
			setChecked(false);
			setBookingNumber('');
			setBookingAgency('');
			setMode('search');
			onDone?.();
		} catch (e: any) {
			setErr(e?.response?.data?.message || e.message);
		} finally {
			setBusy(false);
		}
	}

	return (
		<Box>
			{err && (
				<Alert severity="error" sx={{ mb: 2 }}>
					{err}
				</Alert>
			)}

			{/* PDF Upload */}
			<Card sx={{ mb: 3, bgcolor: 'info.50' }}>
				<CardContent>
					<Typography variant="subtitle2" gutterBottom>
						📄 Quick Import from PDF
					</Typography>
					<Typography variant="caption" color="text.secondary" display="block" mb={2}>
						Upload your flight ticket PDF to automatically fill in details
					</Typography>
					<PDFUploadButton
						acceptedType="flight"
						onDataExtracted={(data) => {
							// Auto-fill manual form with extracted data
							setMode('manual');
							if (data.type === 'flight') {
								setAirline(data.airline || '');
								setFlightNumber(data.flightNumber || '');
								setDepartureAirport(data.departureAirportCode || '');
								setArrivalAirport(data.arrivalAirportCode || '');
								setDate(data.departureDateTime?.split(' ')[0] || '');
								setDepartureTime(data.departureDateTime?.split(' ')[1]?.slice(0, 5) || '');
								setArrivalTime(data.arrivalDateTime?.split(' ')[1]?.slice(0, 5) || '');
								if (data.bookingNumber) {
									setBookingNumber(data.bookingNumber);
								}
							}
						}}
					/>
				</CardContent>
			</Card>

			{/* Mode Selector */}
			<Card sx={{ mb: 3 }}>
				<Tabs
					value={mode}
					onChange={(_, v) => {
						setMode(v);
						setFlightData(null);
						setRouteFlights([]);
						setSelectedFlight(null);
						setErr(null);
					}}
					variant="fullWidth"
				>
					<Tab value="search" label="By Flight Number" />
					<Tab value="route" label="By Route" />
					<Tab value="manual" label="Manual Entry" />
				</Tabs>
			</Card>

			{/* Search Mode */}
			{mode === 'search' && (
				<>
					<Card variant="outlined" sx={{ mb: 3 }}>
						<CardContent>
							<Typography variant="subtitle1" gutterBottom fontWeight="bold">
								Search Flight
							</Typography>
							<Grid container spacing={2}>
								<Grid item xs={12} sm={6}>
									<TextField
										fullWidth
										label="Flight Number"
										placeholder="e.g. IZ603, LY315, BA123"
										value={flightNumber}
										onChange={(e) => setFlightNumber(e.target.value)}
										required
									/>
								</Grid>
								<Grid item xs={12} sm={6}>
									<TextField
										fullWidth
										type="date"
										label="Flight Date"
										value={date}
										onChange={(e) => setDate(e.target.value)}
										InputLabelProps={{ shrink: true }}
										required
									/>
								</Grid>
							</Grid>
							<Stack direction="row" spacing={2} mt={2}>
								<Button
									variant="contained"
									disabled={!flightNumber.trim() || !date || searching}
									onClick={searchFlight}
									endIcon={searching && <CircularProgress size={20} />}
								>
									{searching ? 'Searching…' : 'Search Flight'}
								</Button>
								{!flightData && (
									<Button variant="outlined" onClick={() => setMode('manual')}>
										Can't find flight? Add manually
									</Button>
								)}
							</Stack>
						</CardContent>
					</Card>
				</>
			)}

			{/* Route Search Mode */}
			{mode === 'route' && (
				<>
					<Card variant="outlined" sx={{ mb: 3 }}>
						<CardContent>
							<Typography variant="subtitle1" gutterBottom fontWeight="bold">
								Search Flights by Route
							</Typography>
							<Grid container spacing={2}>
								<Grid item xs={12} sm={4}>
									<SearchAutocomplete
										label="Origin Airport"
										placeholder="e.g. TLV, JFK, LHR"
										minChars={1}
										value={origin}
										fetchOptions={async (q: string) => {
											const result = await searchAirports(q);
											return result.airports || [];
										}}
										getOptionLabel={(airport: any) => `${airport.code} - ${airport.name}`}
										onSelect={(airport: any) => setOrigin(airport)}
										isOptionEqualToValue={(option: any, value: any) => option.code === value.code}
									/>
								</Grid>
								<Grid item xs={12} sm={4}>
									<SearchAutocomplete
										label="Destination Airport"
										placeholder="e.g. DXB, LAX, CDG"
										minChars={1}
										value={destination}
										fetchOptions={async (q: string) => {
											const result = await searchAirports(q);
											return result.airports || [];
										}}
										getOptionLabel={(airport: any) => `${airport.code} - ${airport.name}`}
										onSelect={(airport: any) => setDestination(airport)}
										isOptionEqualToValue={(option: any, value: any) => option.code === value.code}
									/>
								</Grid>
								<Grid item xs={12} sm={4}>
									<TextField
										fullWidth
										type="date"
										label="Flight Date"
										value={date}
										onChange={(e) => setDate(e.target.value)}
										InputLabelProps={{ shrink: true }}
										required
									/>
								</Grid>
							</Grid>
							<Button
								variant="contained"
								disabled={!origin?.code || !destination?.code || !date || searching}
								onClick={searchRoute}
								endIcon={searching && <CircularProgress size={20} />}
								sx={{ mt: 2 }}
							>
								{searching ? 'Searching…' : 'Search Flights'}
							</Button>
						</CardContent>
					</Card>

					{/* Flight List Results */}
					{routeFlights.length > 0 && (
						<Card variant="outlined" sx={{ mb: 3 }}>
							<CardContent>
								<Typography variant="subtitle1" gutterBottom fontWeight="bold">
									Available Flights ({routeFlights.length})
								</Typography>
								<Stack spacing={2}>
									{routeFlights.map((flight, idx) => (
										<Paper
											key={idx}
											variant="outlined"
											sx={{
												p: 2,
												cursor: 'pointer',
												border: selectedFlight === flight ? 2 : 1,
												borderColor: selectedFlight === flight ? 'primary.main' : 'divider',
												bgcolor: selectedFlight === flight ? 'primary.50' : 'background.paper',
												'&:hover': { bgcolor: 'action.hover' },
											}}
											onClick={() => setSelectedFlight(flight)}
										>
											<Stack direction="row" justifyContent="space-between" alignItems="center">
												<Box>
													<Typography variant="subtitle2" fontWeight="bold">
														{flight.airline} - {flight.flightNumber}
													</Typography>
													<Typography variant="body2" color="text.secondary">
														{flight.departure?.iata || flight.departureAirportCode} → {flight.arrival?.iata || flight.arrivalAirportCode}
													</Typography>
												</Box>
												<Box textAlign="right">
													<Typography variant="body2">
														{(() => {
															const depDateTime = flight.departure?.scheduled || flight.departureDateTime;
															const arrDateTime = flight.arrival?.scheduled || flight.arrivalDateTime;
															const depTime = depDateTime ? formatDateTimeLocal(depDateTime).time : '--:--';
															const arrTime = arrDateTime ? formatDateTimeLocal(arrDateTime).time : '--:--';
															return `${depTime} - ${arrTime}`;
														})()}
													</Typography>
													{flight.durationMinutes && (
														<Typography variant="caption" color="text.secondary">
															{Math.floor(flight.durationMinutes / 60)}h {flight.durationMinutes % 60}m
														</Typography>
													)}
												</Box>
											</Stack>
											<Stack direction="row" spacing={1} mt={1}>
												{(flight.stops === 0 || !flight.stops) && <Chip label="Direct" color="success" size="small" />}
												{(flight.aircraft || flight.aircraftType) && <Chip label={flight.aircraft || flight.aircraftType} size="small" />}
											</Stack>
										</Paper>
									))}
								</Stack>
							</CardContent>
						</Card>
					)}

					{routeFlights.length === 0 && !searching && date && origin && destination && (
						<Alert severity="info" sx={{ mb: 3 }}>
							No flights found for this route. Try searching by flight number or add manually.
						</Alert>
					)}
				</>
			)}

			{/* Manual Mode */}
			{mode === 'manual' && (
				<>
					<Alert severity="success" icon="✈️" sx={{ mb: 3 }}>
						<Typography variant="body2" fontWeight="bold">
							Add Flight You've Already Booked
						</Typography>
						<Typography variant="caption">Use this form to add flights you've already purchased. Enter the details from your ticket.</Typography>
					</Alert>

					<Card variant="outlined" sx={{ mb: 3 }}>
						<CardContent>
							<Typography variant="subtitle1" gutterBottom fontWeight="bold">
								Enter Flight Details Manually
							</Typography>
							<Grid container spacing={2}>
								<Grid item xs={12} sm={6}>
									<TextField
										fullWidth
										label="Flight Number"
										placeholder="e.g. IZ603"
										value={flightNumber}
										onChange={(e) => setFlightNumber(e.target.value)}
										required
									/>
								</Grid>
								<Grid item xs={12} sm={6}>
									<TextField
										fullWidth
										label="Airline"
										placeholder="e.g. Arkia Israeli Airlines"
										value={airline}
										onChange={(e) => setAirline(e.target.value)}
										required
									/>
								</Grid>
								<Grid item xs={12} sm={6}>
									<TextField
										fullWidth
										label="Departure Airport"
										placeholder="e.g. TLV"
										value={departureAirport}
										onChange={(e) => setDepartureAirport(e.target.value)}
										required
									/>
								</Grid>
								<Grid item xs={12} sm={6}>
									<TextField
										fullWidth
										label="Arrival Airport"
										placeholder="e.g. DXB"
										value={arrivalAirport}
										onChange={(e) => setArrivalAirport(e.target.value)}
										required
									/>
								</Grid>
								<Grid item xs={12} sm={6}>
									<TextField
										fullWidth
										type="date"
										label="Flight Date"
										value={date}
										onChange={(e) => setDate(e.target.value)}
										InputLabelProps={{ shrink: true }}
										required
									/>
								</Grid>
								<Grid item xs={12} sm={6}>
									<TextField
										fullWidth
										type="time"
										label="Departure Time"
										value={departureTime}
										onChange={(e) => setDepartureTime(e.target.value)}
										InputLabelProps={{ shrink: true }}
									/>
								</Grid>
								<Grid item xs={12} sm={6}>
									<TextField
										fullWidth
										type="time"
										label="Arrival Time"
										value={arrivalTime}
										onChange={(e) => setArrivalTime(e.target.value)}
										InputLabelProps={{ shrink: true }}
									/>
								</Grid>
							</Grid>
						</CardContent>
					</Card>
				</>
			)}

			{/* Flight Details (shown after search) */}
			{(flightData || selectedFlight) && (
				<>
					<Card variant="outlined" sx={{ mb: 3, bgcolor: 'primary.50' }}>
						<CardContent>
							<Typography variant="h6" gutterBottom>
								Flight Details
							</Typography>

							<Grid container spacing={2}>
								<Grid item xs={12}>
									<Box display="flex" alignItems="center" gap={1}>
										<Chip label={(flightData || selectedFlight).airline} color="primary" />
										<Typography variant="h6" fontWeight="bold">
											{(flightData || selectedFlight).flightNumber}
										</Typography>
									</Box>
								</Grid>

								<Grid item xs={12} sm={6}>
									<Paper sx={{ p: 2 }}>
										<Typography variant="caption" color="text.secondary">
											Departure
										</Typography>
										<Typography variant="h6" fontWeight="bold">
											{(flightData || selectedFlight).departureAirportCode || (flightData || selectedFlight).departure?.iata}
										</Typography>
										<Typography variant="body2" color="text.secondary">
											{
												formatDateTimeLocal((flightData || selectedFlight).departureDateTime || (flightData || selectedFlight).departure?.scheduled)
													.full
											}
										</Typography>
										{((flightData || selectedFlight).terminal?.departure || (flightData || selectedFlight).departure?.terminal) && (
											<Typography variant="caption" color="text.secondary" display="block" mt={1}>
												Terminal: {(flightData || selectedFlight).terminal?.departure || (flightData || selectedFlight).departure?.terminal}
											</Typography>
										)}
										{((flightData || selectedFlight).gate?.departure || (flightData || selectedFlight).departure?.gate) && (
											<Typography variant="caption" color="text.secondary" display="block">
												Gate: {(flightData || selectedFlight).gate?.departure || (flightData || selectedFlight).departure?.gate}
											</Typography>
										)}
									</Paper>
								</Grid>

								<Grid item xs={12} sm={6}>
									<Paper sx={{ p: 2 }}>
										<Typography variant="caption" color="text.secondary">
											Arrival
										</Typography>
										<Typography variant="h6" fontWeight="bold">
											{(flightData || selectedFlight).arrivalAirportCode || (flightData || selectedFlight).arrival?.iata}
										</Typography>
										<Typography variant="body2" color="text.secondary">
											{formatDateTimeLocal((flightData || selectedFlight).arrivalDateTime || (flightData || selectedFlight).arrival?.scheduled).full}
										</Typography>
										{((flightData || selectedFlight).terminal?.arrival || (flightData || selectedFlight).arrival?.terminal) && (
											<Typography variant="caption" color="text.secondary" display="block" mt={1}>
												Terminal: {(flightData || selectedFlight).terminal?.arrival || (flightData || selectedFlight).arrival?.terminal}
											</Typography>
										)}
										{((flightData || selectedFlight).gate?.arrival || (flightData || selectedFlight).arrival?.gate) && (
											<Typography variant="caption" color="text.secondary" display="block">
												Gate: {(flightData || selectedFlight).gate?.arrival || (flightData || selectedFlight).arrival?.gate}
											</Typography>
										)}
									</Paper>
								</Grid>

								{(flightData || selectedFlight).durationMinutes && (
									<Grid item xs={12}>
										<Alert severity="info" icon={false}>
											<Stack direction="row" spacing={2} alignItems="center">
												<Typography variant="body2">
													<strong>Duration:</strong> {Math.floor((flightData || selectedFlight).durationMinutes / 60)}h{' '}
													{(flightData || selectedFlight).durationMinutes % 60}m
												</Typography>
												{((flightData || selectedFlight).aircraftType || (flightData || selectedFlight).aircraft) && (
													<Typography variant="body2">
														<strong>Aircraft:</strong> {(flightData || selectedFlight).aircraftType || (flightData || selectedFlight).aircraft}
													</Typography>
												)}
											</Stack>
										</Alert>
									</Grid>
								)}
							</Grid>
						</CardContent>
					</Card>

					{/* Info: Use Manual Entry for flights */}
					<Alert severity="info" icon="ℹ️" sx={{ mb: 3 }}>
						<Typography variant="body2" fontWeight="bold" gutterBottom>
							Add Your Flight Booking
						</Typography>
						<Typography variant="caption">
							After finding your flight details above, enter your booking information and the price you paid below. Or use the "Manual Entry" tab to
							add a flight you've already purchased.
						</Typography>
					</Alert>

					{/* User Inputs Section - shown after search */}
					<Card variant="outlined" sx={{ mb: 3 }}>
						<CardContent>
							<Typography variant="subtitle1" gutterBottom fontWeight="bold">
								Your Booking Details
							</Typography>
							<Grid container spacing={2}>
								<Grid item xs={12} sm={6}>
									<TextField
										fullWidth
										label="Ticket Cost"
										placeholder="Enter ticket price"
										type="number"
										value={cost}
										onChange={(e) => setCost(e.target.value)}
										InputProps={{ startAdornment: '$' }}
									/>
								</Grid>
								<Grid item xs={12} sm={6}>
									<TextField
										fullWidth
										label="Booking Number"
										placeholder="e.g. ABC123"
										value={bookingNumber}
										onChange={(e) => setBookingNumber(e.target.value)}
									/>
								</Grid>
								<Grid item xs={12}>
									<TextField
										fullWidth
										label="Booking Agency"
										placeholder="e.g. Expedia, Booking.com"
										value={bookingAgency}
										onChange={(e) => setBookingAgency(e.target.value)}
									/>
								</Grid>
								<Grid item xs={12}>
									<Typography variant="body2" color="text.secondary" gutterBottom>
										Baggage
									</Typography>
									<Stack direction="row" spacing={2}>
										<FormControlLabel
											control={<Checkbox checked={carryOn} onChange={(e) => setCarryOn(e.target.checked)} />}
											label="Carry-on Trolley"
										/>
										<FormControlLabel
											control={<Checkbox checked={checked} onChange={(e) => setChecked(e.target.checked)} />}
											label="Checked Baggage"
										/>
									</Stack>
								</Grid>
							</Grid>
						</CardContent>
					</Card>
				</>
			)}

			{/* Ticket and Cost Information (shown for all modes) */}
			{((mode === 'search' && flightData) || (mode === 'route' && selectedFlight) || mode === 'manual') && (
				<Card variant="outlined" sx={{ mb: 3 }}>
					<CardContent>
						<Typography variant="subtitle1" gutterBottom fontWeight="bold">
							Ticket & Cost Information
						</Typography>
						<Grid container spacing={2}>
							<Grid item xs={12} sm={4}>
								<TextField
									fullWidth
									label="Number of Tickets"
									placeholder="e.g. 2"
									type="number"
									value={numberOfTickets}
									onChange={(e) => setNumberOfTickets(e.target.value)}
									inputProps={{ min: 1 }}
								/>
							</Grid>
							<Grid item xs={12} sm={4}>
								<TextField
									fullWidth
									label="Cost"
									placeholder="Enter price"
									type="number"
									value={cost}
									onChange={(e) => setCost(e.target.value)}
									InputProps={{ startAdornment: '$' }}
								/>
							</Grid>
							<Grid item xs={12} sm={4}>
								<FormControl fullWidth>
									<InputLabel>Cost Type</InputLabel>
									<Select value={costType} label="Cost Type" onChange={(e) => setCostType(e.target.value as 'per-ticket' | 'total')}>
										<MenuItem value="per-ticket">Per Ticket</MenuItem>
										<MenuItem value="total">Total</MenuItem>
									</Select>
								</FormControl>
							</Grid>
						</Grid>
					</CardContent>
				</Card>
			)}

			{/* User Inputs for Manual Mode */}
			{mode === 'manual' && (
				<Card variant="outlined" sx={{ mb: 3 }}>
					<CardContent>
						<Typography variant="subtitle1" gutterBottom fontWeight="bold">
							Booking Details
						</Typography>
						<Grid container spacing={2}>
							<Grid item xs={12} sm={6}>
								<TextField
									fullWidth
									label="Booking Number"
									placeholder="e.g. ABC123"
									value={bookingNumber}
									onChange={(e) => setBookingNumber(e.target.value)}
								/>
							</Grid>
							<Grid item xs={12}>
								<TextField
									fullWidth
									label="Booking Agency"
									placeholder="e.g. Expedia, Booking.com"
									value={bookingAgency}
									onChange={(e) => setBookingAgency(e.target.value)}
								/>
							</Grid>
							<Grid item xs={12}>
								<Typography variant="body2" color="text.secondary" gutterBottom>
									Baggage
								</Typography>
								<Stack direction="row" spacing={2}>
									<FormControlLabel
										control={<Checkbox checked={carryOn} onChange={(e) => setCarryOn(e.target.checked)} />}
										label="Carry-on Trolley"
									/>
									<FormControlLabel control={<Checkbox checked={checked} onChange={(e) => setChecked(e.target.checked)} />} label="Checked Baggage" />
								</Stack>
							</Grid>
						</Grid>
					</CardContent>
				</Card>
			)}

			{/* Save Button */}
			{((mode === 'search' && flightData) ||
				(mode === 'route' && selectedFlight) ||
				(mode === 'manual' && flightNumber && date && departureAirport && arrivalAirport)) && (
				<Button variant="contained" size="large" disabled={busy} onClick={saveFlight} endIcon={busy && <CircularProgress size={20} />}>
					{busy ? (editIndex >= 0 ? 'Updating Flight…' : 'Adding Flight…') : editIndex >= 0 ? 'Update Flight' : 'Add Flight to Trip'}
				</Button>
			)}

			{/* Empty state for search mode */}
			{mode === 'search' && !flightData && !searching && (
				<Box
					display="flex"
					alignItems="center"
					justifyContent="center"
					height={200}
					border={1}
					borderColor="divider"
					borderRadius={2}
					bgcolor="grey.50"
				>
					<Stack alignItems="center" spacing={1}>
						<Typography variant="body2" color="text.secondary">
							Enter flight number and date to search
						</Typography>
					</Stack>
				</Box>
			)}
		</Box>
	);
}
