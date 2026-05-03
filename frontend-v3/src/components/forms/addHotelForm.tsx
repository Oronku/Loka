import { useEffect, useState } from 'react';
import PDFUploadButton from '../PDFUploadButton';
import BookingButton from '../BookingButton';
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
	Divider,
	Typography,
	Card,
	CardContent,
} from '@mui/material';
import { addHotelToTrip, hotelAutocomplete, hotelDetails } from '../../services/api';
import { API_BASE_URL } from '../../config/api';

export function AddHotelForm({
	tripId,
	trip,
	onUpdated,
	onDone,
}: {
	tripId: string;
	trip?: Trip;
	onUpdated: (t: Trip) => void;
	onDone?: () => void;
}) {
	const [searchQuery, setSearchQuery] = useState('');
	const [searchResults, setSearchResults] = useState<any[]>([]);
	const [selected, setSelected] = useState<any | null>(null);
	const [hotelDetail, setHotelDetail] = useState<any | null>(null);

	// Initialize with trip dates if available
	const initialCheckIn = trip?.startDate ? (trip.startDate.includes('T') ? trip.startDate.split('T')[0] : trip.startDate.slice(0, 10)) : '';
	const initialCheckOut = trip?.endDate ? (trip.endDate.includes('T') ? trip.endDate.split('T')[0] : trip.endDate.slice(0, 10)) : '';

	const [checkIn, setCheckIn] = useState(initialCheckIn);
	const [checkOut, setCheckOut] = useState(initialCheckOut);
	const [arrivalTime, setArrivalTime] = useState('');
	const [nights, setNights] = useState('');
	const [cost, setCost] = useState('');
	const [includesMeals, setIncludesMeals] = useState(false);
	const [mealPlan, setMealPlan] = useState<'breakfast' | 'half-board' | 'all-inclusive'>('breakfast');
	const [numberOfRooms, setNumberOfRooms] = useState('');
	const [reservationNames, setReservationNames] = useState<string[]>(['']);
	const [bookedFrom, setBookedFrom] = useState('');
	const [busy, setBusy] = useState(false);
	const [loadingDetails, setLoadingDetails] = useState(false);
	const [err, setErr] = useState<string | null>(null);

	// Real prices from affiliate API
	const [realHotelPrices, setRealHotelPrices] = useState<any>(null);
	const [loadingHotelPrices, setLoadingHotelPrices] = useState(false);

	// Update reservation names array when number of rooms changes
	useEffect(() => {
		const numRooms = parseInt(numberOfRooms) || 1;
		if (numRooms > 0) {
			setReservationNames((prev) => {
				const newArray = Array(numRooms).fill('');
				// Preserve existing values
				for (let i = 0; i < Math.min(prev.length, numRooms); i++) {
					newArray[i] = prev[i];
				}
				return newArray;
			});
		}
	}, [numberOfRooms]);

	// Auto-calculate nights when check-in or check-out changes
	useEffect(() => {
		if (checkIn && checkOut) {
			const checkInDate = new Date(checkIn);
			const checkOutDate = new Date(checkOut);
			if (checkInDate < checkOutDate) {
				const diffTime = checkOutDate.getTime() - checkInDate.getTime();
				const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
				setNights(diffDays.toString());
			} else {
				setNights('');
			}
		} else {
			setNights('');
		}
	}, [checkIn, checkOut]);

	// Debounced search for hotels
	useEffect(() => {
		if (searchQuery.trim().length < 3) {
			setSearchResults([]);
			return;
		}
		let active = true;
		const timer = setTimeout(async () => {
			try {
				const res = await hotelAutocomplete(searchQuery.trim());
				if (active) setSearchResults(res.suggestions || []);
			} catch (e) {
				console.error('Hotel search error:', e);
			}
		}, 500);
		return () => {
			active = false;
			clearTimeout(timer);
		};
	}, [searchQuery]);

	// Fetch hotel details when selected
	async function handleSelectHotel(hotel: any) {
		setSelected(hotel);
		setSearchResults([]); // Clear suggestions list
		setSearchQuery(hotel.name); // Update search field with selected hotel name
		setLoadingDetails(true);
		try {
			const det = await hotelDetails(hotel.placeId);
			setHotelDetail(det.hotel);
		} catch (e) {
			console.error('Error fetching hotel details:', e);
			setHotelDetail(null);
		} finally {
			setLoadingDetails(false);
		}
	}

	// Fetch real hotel prices from Travelpayouts API
	async function fetchRealHotelPrices() {
		if (!selected || !checkIn || !checkOut) return;

		// Extract city name from hotel address
		// Common city names to look for
		const knownCities = [
			'Dubai',
			'Abu Dhabi',
			'Paris',
			'London',
			'New York',
			'Tokyo',
			'Bangkok',
			'Singapore',
			'Hong Kong',
			'Seoul',
			'Rome',
			'Barcelona',
			'Amsterdam',
			'Berlin',
			'Madrid',
			'Vienna',
			'Prague',
			'Budapest',
			'Istanbul',
			'Athens',
			'Tel Aviv',
			'Jerusalem',
			'Eilat',
			'Haifa',
			'Los Angeles',
			'San Francisco',
			'Chicago',
			'Miami',
			'Las Vegas',
			'Boston',
			'Toronto',
			'Vancouver',
			'Sydney',
			'Melbourne',
			'Lisbon',
			'Copenhagen',
			'Stockholm',
			'Oslo',
			'Helsinki',
			'Brussels',
			'Zurich',
			'Geneva',
			'Milan',
			'Florence',
			'Venice',
			'Munich',
			'Frankfurt',
			'Hamburg',
			'Cairo',
			'Marrakech',
			'Casablanca',
			'Doha',
			'Riyadh',
			'Jeddah',
			'Muscat',
			'Amman',
			'Beirut',
			'Bucharest',
		];

		const fullAddress = selected.formattedAddress || hotelDetail?.formattedAddress || '';

		// Try to find a known city in the address
		let cityName = null;
		for (const city of knownCities) {
			if (fullAddress.includes(city)) {
				cityName = city;
				break;
			}
		}

		// Fallback: extract from address parts
		if (!cityName) {
			const addressParts = fullAddress
				.split(/[-,]/)
				.map((p: string) => p.trim())
				.filter((p: string) => p.length > 0);

			if (addressParts.length >= 3) {
				// Format: [Hotel/Street, Street/Area, City, Country]
				// Take the second-to-last part (before country)
				cityName = addressParts[addressParts.length - 2];
			} else if (addressParts.length === 2) {
				// Format: [Hotel, City] or [Street, City]
				cityName = addressParts[1];
			} else if (addressParts.length === 1) {
				// Only one part, use it
				cityName = addressParts[0];
			} else {
				cityName = searchQuery; // last resort
			}

			// Clean up city name
			cityName = cityName
				.replace(/\d+/g, '') // Remove numbers
				.replace(/street|road|avenue|blvd|ave|calea|strada|sheikh|zayed/gi, '') // Remove street terms
				.trim();
		}

		console.log('🏙️ Searching prices for city:', cityName, 'from address:', fullAddress);
		console.log('📅 Dates:', checkIn, 'to', checkOut);

		// Validate cityName is a string
		if (!cityName || typeof cityName !== 'string') {
			console.error('❌ Invalid city name:', cityName);
			setLoadingHotelPrices(false);
			return;
		}

		// Get selected hotel name
		const hotelName = selected?.name || hotelDetail?.name || null;

		setLoadingHotelPrices(true);
		setRealHotelPrices(null);
		try {
			const response = await fetch(`${API_BASE_URL}/ai/get-real-prices`, {
				method: 'POST',
				credentials: 'include',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					destination: cityName,
					hotelName: hotelName, // Send specific hotel name if selected
					checkIn,
					checkOut,
					origin: 'TLV',
				}),
			});

			if (response.ok) {
				const data = await response.json();
				setRealHotelPrices(data);
			}
		} catch (e: any) {
			console.error('Failed to fetch real hotel prices:', e);
		} finally {
			setLoadingHotelPrices(false);
		}
	}

	async function add() {
		if (!selected || !checkIn || !checkOut) return;
		setErr(null);
		setBusy(true);
		try {
			const hotelPayload = {
				placeId: selected.placeId,
				name: hotelDetail?.name || selected.name,
				address: hotelDetail?.formattedAddress || selected.formattedAddress,
				checkIn,
				checkOut,
				arrivalTime: arrivalTime || undefined,
				nights: nights ? Number(nights) : undefined,
				cost: cost ? Number(cost) : undefined,
				rating: hotelDetail?.rating || null,
				includesMeals: includesMeals,
				mealPlan: includesMeals ? mealPlan : undefined,
				numberOfRooms: numberOfRooms ? Number(numberOfRooms) : undefined,
				reservationNames:
					reservationNames.filter((name) => name.trim() !== '').length > 0 ? reservationNames.filter((name) => name.trim() !== '') : undefined,
				bookedFrom: bookedFrom || undefined,
			};
			const updated = await addHotelToTrip(tripId, hotelPayload as any);
			onUpdated(updated);
			setSearchQuery('');
			setSearchResults([]);
			setSelected(null);
			setHotelDetail(null);
			setCheckIn('');
			setCheckOut('');
			setArrivalTime('');
			setNights('');
			setCost('');
			setIncludesMeals(false);
			setMealPlan('breakfast');
			setNumberOfRooms('');
			setReservationNames(['']);
			setBookedFrom('');
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
			<Card sx={{ mb: 3, bgcolor: 'success.50' }}>
				<CardContent>
					<Typography variant="subtitle2" gutterBottom>
						📄 Quick Import from PDF
					</Typography>
					<Typography variant="caption" color="text.secondary" display="block" mb={2}>
						Upload your hotel reservation PDF to automatically fill in details
					</Typography>
					<PDFUploadButton
						acceptedType="hotel"
						onDataExtracted={(data) => {
							if (data.type === 'hotel') {
								// Auto-fill form with extracted data
								setSearchQuery(data.name || '');
								setCheckIn(data.checkIn || '');
								setCheckOut(data.checkOut || '');
								if (data.numberOfRooms) {
									setNumberOfRooms(data.numberOfRooms.toString());
								}
								if (data.guestName) {
									setReservationNames([data.guestName]);
								}
								if (data.confirmationNumber) {
									setBookedFrom(`Confirmation: ${data.confirmationNumber}`);
								}
								// searchQuery update will automatically trigger hotel search via useEffect
							}
						}}
					/>
				</CardContent>
			</Card>

			<Grid container spacing={3}>
				{/* Left side - Search */}
				<Grid item xs={12} md={5}>
					<Stack spacing={2}>
						<TextField
							fullWidth
							label="Search Hotels"
							placeholder="Type hotel name or city..."
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
							autoComplete="off"
						/>

						{searchResults.length > 0 && (
							<Paper variant="outlined" sx={{ maxHeight: 400, overflow: 'auto' }}>
								<Stack divider={<Divider />}>
									{searchResults.map((hotel) => (
										<Box
											key={hotel.placeId}
											onClick={() => handleSelectHotel(hotel)}
											sx={{
												p: 2,
												cursor: 'pointer',
												bgcolor: selected?.placeId === hotel.placeId ? 'action.selected' : 'transparent',
												'&:hover': { bgcolor: 'action.hover' },
											}}
										>
											<Typography variant="subtitle2" fontWeight="bold">
												{hotel.name}
											</Typography>
											<Typography variant="caption" color="text.secondary">
												{hotel.formattedAddress}
											</Typography>
										</Box>
									))}
								</Stack>
							</Paper>
						)}

						{searchQuery.length >= 3 && searchResults.length === 0 && (
							<Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
								No hotels found. Try a different search.
							</Typography>
						)}
					</Stack>
				</Grid>

				{/* Right side - Hotel Details & Booking */}
				<Grid item xs={12} md={7}>
					{loadingDetails && (
						<Box display="flex" justifyContent="center" p={4}>
							<CircularProgress />
						</Box>
					)}

					{!loadingDetails && selected && (
						<Stack spacing={3}>
							<Card variant="outlined">
								<CardContent>
									<Typography variant="h6" gutterBottom>
										{hotelDetail?.name || selected.name}
									</Typography>

									{hotelDetail?.rating && (
										<Box display="flex" alignItems="center" gap={1} mb={2}>
											<Typography variant="body2" color="text.secondary">
												Rating:
											</Typography>
											<Box display="flex" alignItems="center">
												<Typography variant="subtitle2" fontWeight="bold" color="primary">
													{hotelDetail.rating}
												</Typography>
												<Typography variant="body2" color="text.secondary" ml={0.5}>
													/ 5 ⭐
												</Typography>
											</Box>
										</Box>
									)}

									<Typography variant="body2" color="text.secondary" gutterBottom>
										<strong>Address:</strong>
									</Typography>
									<Typography variant="body2" paragraph>
										{hotelDetail?.formattedAddress || selected.formattedAddress}
									</Typography>

									{hotelDetail?.distance && (
										<Box mt={2} p={2} bgcolor="info.50" borderRadius={1}>
											<Typography variant="caption" color="text.secondary">
												Distance from airport: <strong>{hotelDetail.distance}</strong>
											</Typography>
											{hotelDetail?.duration && (
												<Typography variant="caption" color="text.secondary" display="block">
													Travel time: <strong>{hotelDetail.duration}</strong>
												</Typography>
											)}
										</Box>
									)}
								</CardContent>
							</Card>

							<Card variant="outlined">
								<CardContent>
									<Typography variant="subtitle1" gutterBottom fontWeight="bold">
										Booking Details
									</Typography>
									<Grid container spacing={2}>
										<Grid item xs={6}>
											<TextField
												fullWidth
												type="date"
												label="Check In"
												value={checkIn}
												onChange={(e) => setCheckIn(e.target.value)}
												InputLabelProps={{ shrink: true }}
												required
											/>
										</Grid>
										<Grid item xs={6}>
											<TextField
												fullWidth
												type="date"
												label="Check Out"
												value={checkOut}
												onChange={(e) => setCheckOut(e.target.value)}
												InputLabelProps={{ shrink: true }}
												required
											/>
										</Grid>
										<Grid item xs={6}>
											<TextField
												fullWidth
												type="time"
												label="Arrival Time (optional)"
												value={arrivalTime}
												onChange={(e) => setArrivalTime(e.target.value)}
												InputLabelProps={{ shrink: true }}
												helperText="Defaults to 15:00 if not specified"
											/>
										</Grid>
										<Grid item xs={6}>
											<TextField
												fullWidth
												label="Nights"
												type="number"
												value={nights}
												onChange={(e) => setNights(e.target.value)}
												helperText="Auto-calculated from dates"
												InputProps={{
													readOnly: true,
												}}
											/>
										</Grid>
										<Grid item xs={6}>
											<TextField fullWidth label="Cost" placeholder="Optional" type="number" value={cost} onChange={(e) => setCost(e.target.value)} />
										</Grid>
										<Grid item xs={12}>
											<Divider sx={{ my: 1 }} />
										</Grid>
										<Grid item xs={12}>
											<FormControlLabel
												control={<Checkbox checked={includesMeals} onChange={(e) => setIncludesMeals(e.target.checked)} />}
												label="Hotel includes meals"
											/>
										</Grid>
										{includesMeals && (
											<Grid item xs={12}>
												<FormControl fullWidth>
													<InputLabel id="meal-plan-label">Meal Plan</InputLabel>
													<Select labelId="meal-plan-label" value={mealPlan} label="Meal Plan" onChange={(e) => setMealPlan(e.target.value as any)}>
														<MenuItem value="breakfast">Breakfast</MenuItem>
														<MenuItem value="half-board">Half-Board (Breakfast + Dinner)</MenuItem>
														<MenuItem value="all-inclusive">All-Inclusive (Breakfast + Lunch + Dinner)</MenuItem>
													</Select>
												</FormControl>
											</Grid>
										)}
										<Grid item xs={12}>
											<Divider sx={{ my: 1 }} />
											<Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
												Additional Booking Information
											</Typography>
										</Grid>
										<Grid item xs={12}>
											<TextField
												fullWidth
												label="Number of Rooms"
												placeholder="Optional"
												type="number"
												value={numberOfRooms}
												onChange={(e) => setNumberOfRooms(e.target.value)}
												inputProps={{ min: 1 }}
											/>
										</Grid>
										{numberOfRooms && parseInt(numberOfRooms) > 0 && (
											<>
												<Grid item xs={12}>
													<Typography variant="caption" color="text.secondary">
														Reservation Names ({parseInt(numberOfRooms)} room
														{parseInt(numberOfRooms) > 1 ? 's' : ''})
													</Typography>
												</Grid>
												{reservationNames.map((name, index) => (
													<Grid item xs={12} sm={6} key={index}>
														<TextField
															fullWidth
															label={`Room ${index + 1} - Reservation Name`}
															placeholder="Optional"
															value={name}
															onChange={(e) => {
																const newNames = [...reservationNames];
																newNames[index] = e.target.value;
																setReservationNames(newNames);
															}}
														/>
													</Grid>
												))}
											</>
										)}
										<Grid item xs={12}>
											<TextField
												fullWidth
												label="Booked From"
												placeholder="e.g., Booking.com, Expedia, Direct"
												value={bookedFrom}
												onChange={(e) => setBookedFrom(e.target.value)}
											/>
										</Grid>
									</Grid>
								</CardContent>
							</Card>

							{/* Get Real Hotel Prices & Booking */}
							{checkIn && checkOut && (
								<Card variant="outlined" sx={{ bgcolor: 'success.50' }}>
									<CardContent>
										<Stack direction="row" alignItems="center" justifyContent="space-between" mb={2}>
											<Typography variant="subtitle1" fontWeight="bold">
												💰 Real Prices & Booking
											</Typography>
											<Button
												variant="contained"
												color="success"
												onClick={fetchRealHotelPrices}
												disabled={loadingHotelPrices}
												startIcon={loadingHotelPrices && <CircularProgress size={20} />}
											>
												{loadingHotelPrices ? 'Loading...' : 'Get Real Prices'}
											</Button>
										</Stack>

										{realHotelPrices?.hotels && realHotelPrices.hotels.length > 0 && (
											<Stack spacing={2}>
												<Alert severity="success">
													Found {realHotelPrices.hotels.length} hotels! Avg: ${realHotelPrices.averageHotelPrice?.toFixed(0)}
													/night
												</Alert>
												{realHotelPrices.hotels.slice(0, 3).map((hotel: any, idx: number) => (
													<Paper key={idx} variant="outlined" sx={{ p: 2 }}>
														<Grid container spacing={2} alignItems="center">
															<Grid item xs={12} sm={7}>
																<Typography variant="body2" fontWeight="bold">
																	{hotel.name}
																</Typography>
																<Typography variant="caption" color="text.secondary">
																	{hotel.stars && `${'⭐'.repeat(hotel.stars)} • `}
																	{hotel.location}
																</Typography>
																{hotel.rating && (
																	<Typography variant="caption" color="primary" display="block">
																		Rating: {hotel.rating}/10
																	</Typography>
																)}
															</Grid>
															<Grid item xs={12} sm={5}>
																<Stack spacing={1}>
																	<Typography variant="caption" color="text.secondary">
																		${hotel.pricePerNight}/night
																	</Typography>
																	<Stack direction="row" spacing={1} alignItems="center">
																		<Typography variant="h6" color="primary" fontWeight="bold">
																			${hotel.price}
																		</Typography>
																		<Typography variant="caption" color="text.secondary">
																			total
																		</Typography>
																	</Stack>
																	<BookingButton
																		bookingLink={hotel.bookingLink}
																		price={hotel.price}
																		currency={hotel.currency || 'USD'}
																		type="hotel"
																		affiliate={hotel.affiliate}
																		variant="chip"
																		size="small"
																	/>
																</Stack>
															</Grid>
														</Grid>
													</Paper>
												))}
											</Stack>
										)}

										{!realHotelPrices && !loadingHotelPrices && (
											<Typography variant="body2" color="text.secondary" textAlign="center">
												Click "Get Real Prices" to see current hotel prices and booking options
											</Typography>
										)}
									</CardContent>
								</Card>
							)}

							<Button
								variant="contained"
								size="large"
								disabled={!selected || !checkIn || !checkOut || busy}
								onClick={add}
								endIcon={busy && <CircularProgress size={20} />}
							>
								{busy ? 'Adding Hotel…' : 'Add Hotel to Trip'}
							</Button>
						</Stack>
					)}

					{!selected && !loadingDetails && (
						<Box
							display="flex"
							alignItems="center"
							justifyContent="center"
							height={300}
							border={1}
							borderColor="divider"
							borderRadius={2}
							bgcolor="grey.50"
						>
							<Typography variant="body2" color="text.secondary">
								Search and select a hotel to see details
							</Typography>
						</Box>
					)}
				</Grid>
			</Grid>
		</Box>
	);
}
