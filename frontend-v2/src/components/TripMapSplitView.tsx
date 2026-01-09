import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Chip,
  Alert,
  IconButton,
  TextField,
  Button,
  Stack,
  Divider,
  Paper,
  Tooltip,
} from '@mui/material';
import {
  Hotel as HotelIcon,
  AttractionsOutlined,
  Restaurant as RestaurantIcon,
  Flight as FlightIcon,
  DirectionsCar,
  Place as PlaceIcon,
  MyLocation,
  Add as AddIcon,
  Close as CloseIcon,
  Search as SearchIcon,
} from '@mui/icons-material';
import {
  GoogleMap,
  LoadScript,
  Marker,
  InfoWindow,
  Autocomplete,
} from '@react-google-maps/api';
import { GOOGLE_MAPS_API_KEY } from '../services/api';
import type { Trip } from '../types/domain';

interface TripMapSplitViewProps {
  trip: Trip;
  onAddPlace?: (place: any) => void;
}

interface MapLocation {
  id: string;
  type: 'hotel' | 'attraction' | 'restaurant' | 'flight' | 'ride' | 'custom';
  name: string;
  address?: string;
  position: { lat: number; lng: number };
  data: any;
  date?: string;
  time?: string;
}

const libraries: 'places'[] = ['places'];

const mapContainerStyle = {
  width: '100%',
  height: '100%',
};

const defaultCenter = { lat: 32.0853, lng: 34.7818 }; // Tel Aviv

// Icon colors by type
const getMarkerColor = (type: string) => {
  switch (type) {
    case 'hotel':
      return '#9c27b0'; // Purple
    case 'attraction':
      return '#ff9800'; // Orange
    case 'restaurant':
      return '#f44336'; // Red
    case 'flight':
      return '#2196f3'; // Blue
    case 'ride':
      return '#4caf50'; // Green
    default:
      return '#757575'; // Gray
  }
};

const getTypeIcon = (type: string) => {
  switch (type) {
    case 'hotel':
      return <HotelIcon />;
    case 'attraction':
      return <AttractionsOutlined />;
    case 'restaurant':
      return <RestaurantIcon />;
    case 'flight':
      return <FlightIcon />;
    case 'ride':
      return <DirectionsCar />;
    default:
      return <PlaceIcon />;
  }
};

export default function TripMapSplitView({
  trip,
  onAddPlace,
}: TripMapSplitViewProps) {
  const [selectedLocation, setSelectedLocation] = useState<string | null>(null);
  const [hoveredLocation, setHoveredLocation] = useState<string | null>(null);
  const [mapCenter, setMapCenter] = useState(defaultCenter);
  const [mapZoom, setMapZoom] = useState(12);
  const [searchBox, setSearchBox] =
    useState<google.maps.places.Autocomplete | null>(null);
  const [showAddPlace, setShowAddPlace] = useState(false);
  const [map, setMap] = useState<google.maps.Map | null>(null);

  // Convert trip data to map locations
  const locations: MapLocation[] = useMemo(() => {
    const locs: MapLocation[] = [];

    // Add hotels (if they have coordinates)
    trip.hotels?.forEach((hotel: any) => {
      if (hotel.latitude && hotel.longitude) {
        locs.push({
          id: `hotel-${hotel.id}`,
          type: 'hotel',
          name: hotel.hotelName || hotel.name || 'Hotel',
          address: hotel.hotelAddress || hotel.address,
          position: { lat: hotel.latitude, lng: hotel.longitude },
          data: hotel,
          date: hotel.checkInDate || hotel.checkIn,
        });
      }
    });

    // Add attractions (if they have coordinates)
    trip.attractions?.forEach((attraction: any) => {
      if (attraction.latitude && attraction.longitude) {
        locs.push({
          id: `attraction-${attraction.id}`,
          type: 'attraction',
          name: attraction.name || 'Attraction',
          address: attraction.address,
          position: { lat: attraction.latitude, lng: attraction.longitude },
          data: attraction,
          date: attraction.visitDate || attraction.scheduledDate,
          time: attraction.visitTime || attraction.scheduledTime,
        });
      }
    });

    return locs;
  }, [trip]);

  // Auto-center map based on locations
  useEffect(() => {
    if (locations.length === 0) return;

    if (locations.length === 1) {
      setMapCenter(locations[0].position);
      setMapZoom(14);
    } else {
      // Calculate bounds
      const bounds = new google.maps.LatLngBounds();
      locations.forEach((loc) => bounds.extend(loc.position));

      if (map) {
        map.fitBounds(bounds);
      } else {
        // Calculate center manually
        const center = bounds.getCenter();
        setMapCenter({ lat: center.lat(), lng: center.lng() });
        setMapZoom(12);
      }
    }
  }, [locations, map]);

  // Handle location click from list
  const handleLocationClick = (locationId: string) => {
    setSelectedLocation(locationId);
    const location = locations.find((loc) => loc.id === locationId);
    if (location && map) {
      map.panTo(location.position);
      map.setZoom(16);
    }
  };

  // Handle marker click on map
  const handleMarkerClick = (locationId: string) => {
    setSelectedLocation(locationId);
    // Scroll to item in list
    const element = document.getElementById(`location-${locationId}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  // Handle place selected from search
  const onPlaceChanged = useCallback(() => {
    if (searchBox) {
      const place = searchBox.getPlace();
      if (place.geometry?.location) {
        const newPlace = {
          name: place.name || 'New Place',
          address: place.formatted_address,
          latitude: place.geometry.location.lat(),
          longitude: place.geometry.location.lng(),
          placeId: place.place_id,
          types: place.types,
        };

        if (onAddPlace) {
          onAddPlace(newPlace);
        }

        setMapCenter({
          lat: place.geometry.location.lat(),
          lng: place.geometry.location.lng(),
        });
        setMapZoom(16);
        setShowAddPlace(false);
      }
    }
  }, [searchBox, onAddPlace]);

  const selectedLoc = useMemo(
    () => locations.find((loc) => loc.id === selectedLocation),
    [locations, selectedLocation]
  );

  if (!GOOGLE_MAPS_API_KEY) {
    return (
      <Alert severity="error">
        Google Maps API key is missing. Please configure
        VITE_GOOGLE_MAPS_API_KEY in your .env file.
      </Alert>
    );
  }

  return (
    <LoadScript googleMapsApiKey={GOOGLE_MAPS_API_KEY} libraries={libraries}>
      <Box sx={{ display: 'flex', height: '700px', gap: 2 }}>
        {/* Left Side - List */}
        <Paper
          elevation={3}
          sx={{
            flex: '0 0 380px',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
            <Stack direction="row" alignItems="center" spacing={1} mb={1}>
              <PlaceIcon color="primary" />
              <Typography variant="h6" fontWeight={600}>
                מיקומים בטיול
              </Typography>
            </Stack>
            <Typography variant="caption" color="text.secondary">
              {locations.length} מיקומים על המפה
            </Typography>
          </Box>

          {/* Add Place Button */}
          {onAddPlace && (
            <Box sx={{ p: 2, bgcolor: 'grey.50' }}>
              {!showAddPlace ? (
                <Button
                  fullWidth
                  variant="outlined"
                  startIcon={<AddIcon />}
                  onClick={() => setShowAddPlace(true)}
                  size="small"
                >
                  הוסף מקום מהמפה
                </Button>
              ) : (
                <Stack spacing={1}>
                  <Autocomplete
                    onLoad={(autocomplete) => setSearchBox(autocomplete)}
                    onPlaceChanged={onPlaceChanged}
                  >
                    <TextField
                      size="small"
                      fullWidth
                      placeholder="חפש מקום..."
                      InputProps={{
                        startAdornment: (
                          <SearchIcon sx={{ mr: 1, color: 'action.active' }} />
                        ),
                        endAdornment: (
                          <IconButton
                            size="small"
                            onClick={() => setShowAddPlace(false)}
                          >
                            <CloseIcon fontSize="small" />
                          </IconButton>
                        ),
                      }}
                    />
                  </Autocomplete>
                  <Typography variant="caption" color="text.secondary">
                    חפש מיקום והוסף אותו לטיול
                  </Typography>
                </Stack>
              )}
            </Box>
          )}

          {/* Locations List */}
          <List
            sx={{
              flex: 1,
              overflow: 'auto',
              p: 0,
            }}
          >
            {locations.length === 0 ? (
              <Box sx={{ p: 3, textAlign: 'center' }}>
                <PlaceIcon
                  sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }}
                />
                <Typography variant="body2" color="text.secondary">
                  אין עדיין מיקומים במפה
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  הוסף מלונות ואטרקציות עם כתובות
                </Typography>
              </Box>
            ) : (
              locations.map((location) => (
                <ListItem
                  key={location.id}
                  id={`location-${location.id}`}
                  disablePadding
                  sx={{
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                  }}
                >
                  <ListItemButton
                    selected={selectedLocation === location.id}
                    onClick={() => handleLocationClick(location.id)}
                    onMouseEnter={() => setHoveredLocation(location.id)}
                    onMouseLeave={() => setHoveredLocation(null)}
                    sx={{
                      py: 1.5,
                      px: 2,
                      '&.Mui-selected': {
                        bgcolor: 'primary.lighter',
                        borderLeft: '4px solid',
                        borderLeftColor: 'primary.main',
                      },
                      '&:hover': {
                        bgcolor:
                          selectedLocation === location.id
                            ? 'primary.lighter'
                            : 'action.hover',
                      },
                    }}
                  >
                    <ListItemIcon
                      sx={{
                        minWidth: 40,
                        color: getMarkerColor(location.type),
                      }}
                    >
                      {getTypeIcon(location.type)}
                    </ListItemIcon>
                    <ListItemText
                      primary={
                        <Typography variant="body2" fontWeight={500} noWrap>
                          {location.name}
                        </Typography>
                      }
                      secondary={
                        <Stack spacing={0.5} mt={0.5}>
                          {location.address && (
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden',
                              }}
                            >
                              📍 {location.address}
                            </Typography>
                          )}
                          <Stack direction="row" spacing={1} flexWrap="wrap">
                            <Chip
                              label={location.type}
                              size="small"
                              sx={{
                                height: 20,
                                fontSize: '0.7rem',
                                bgcolor: getMarkerColor(location.type),
                                color: 'white',
                              }}
                            />
                            {location.date && (
                              <Chip
                                label={new Date(
                                  location.date
                                ).toLocaleDateString('he-IL')}
                                size="small"
                                variant="outlined"
                                sx={{ height: 20, fontSize: '0.7rem' }}
                              />
                            )}
                            {location.time && (
                              <Chip
                                label={location.time}
                                size="small"
                                variant="outlined"
                                sx={{ height: 20, fontSize: '0.7rem' }}
                              />
                            )}
                          </Stack>
                        </Stack>
                      }
                    />
                  </ListItemButton>
                </ListItem>
              ))
            )}
          </List>

          {/* Footer Stats */}
          <Divider />
          <Box sx={{ p: 2, bgcolor: 'grey.50' }}>
            <Stack direction="row" spacing={2} justifyContent="space-around">
              <Tooltip title="מלונות">
                <Stack alignItems="center" spacing={0.5}>
                  <HotelIcon sx={{ color: '#9c27b0', fontSize: 20 }} />
                  <Typography variant="caption" fontWeight={600}>
                    {trip.hotels?.length || 0}
                  </Typography>
                </Stack>
              </Tooltip>
              <Tooltip title="אטרקציות">
                <Stack alignItems="center" spacing={0.5}>
                  <AttractionsOutlined
                    sx={{ color: '#ff9800', fontSize: 20 }}
                  />
                  <Typography variant="caption" fontWeight={600}>
                    {trip.attractions?.length || 0}
                  </Typography>
                </Stack>
              </Tooltip>
              <Tooltip title="טיסות">
                <Stack alignItems="center" spacing={0.5}>
                  <FlightIcon sx={{ color: '#2196f3', fontSize: 20 }} />
                  <Typography variant="caption" fontWeight={600}>
                    {trip.flights?.length || 0}
                  </Typography>
                </Stack>
              </Tooltip>
              <Tooltip title="נסיעות">
                <Stack alignItems="center" spacing={0.5}>
                  <DirectionsCar sx={{ color: '#4caf50', fontSize: 20 }} />
                  <Typography variant="caption" fontWeight={600}>
                    {trip.rides?.length || 0}
                  </Typography>
                </Stack>
              </Tooltip>
            </Stack>
          </Box>
        </Paper>

        {/* Right Side - Map */}
        <Paper
          elevation={3}
          sx={{ flex: 1, position: 'relative', overflow: 'hidden' }}
        >
          <GoogleMap
            mapContainerStyle={mapContainerStyle}
            center={mapCenter}
            zoom={mapZoom}
            onLoad={(mapInstance) => setMap(mapInstance)}
            options={{
              streetViewControl: false,
              mapTypeControl: true,
              fullscreenControl: true,
              zoomControl: true,
            }}
          >
            {/* Markers */}
            {locations.map((location) => (
              <Marker
                key={location.id}
                position={location.position}
                onClick={() => handleMarkerClick(location.id)}
                icon={{
                  path: google.maps.SymbolPath.CIRCLE,
                  scale:
                    selectedLocation === location.id
                      ? 12
                      : hoveredLocation === location.id
                        ? 10
                        : 8,
                  fillColor: getMarkerColor(location.type),
                  fillOpacity: 1,
                  strokeWeight: 2,
                  strokeColor: '#ffffff',
                }}
                animation={
                  selectedLocation === location.id
                    ? google.maps.Animation.BOUNCE
                    : undefined
                }
              />
            ))}

            {/* Info Window */}
            {selectedLoc && (
              <InfoWindow
                position={selectedLoc.position}
                onCloseClick={() => setSelectedLocation(null)}
              >
                <Box sx={{ p: 1, maxWidth: 250 }}>
                  <Stack direction="row" alignItems="center" spacing={1} mb={1}>
                    <Box sx={{ color: getMarkerColor(selectedLoc.type) }}>
                      {getTypeIcon(selectedLoc.type)}
                    </Box>
                    <Typography variant="subtitle2" fontWeight={600}>
                      {selectedLoc.name}
                    </Typography>
                  </Stack>
                  {selectedLoc.address && (
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      display="block"
                    >
                      📍 {selectedLoc.address}
                    </Typography>
                  )}
                  {selectedLoc.date && (
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      display="block"
                      mt={0.5}
                    >
                      📅{' '}
                      {new Date(selectedLoc.date).toLocaleDateString('he-IL')}
                    </Typography>
                  )}
                  {selectedLoc.time && (
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      display="block"
                    >
                      🕐 {selectedLoc.time}
                    </Typography>
                  )}
                </Box>
              </InfoWindow>
            )}
          </GoogleMap>

          {/* Current Location Button */}
          <Tooltip title="המיקום שלי">
            <IconButton
              sx={{
                position: 'absolute',
                bottom: 120,
                right: 10,
                bgcolor: 'white',
                boxShadow: 2,
                '&:hover': { bgcolor: 'grey.100' },
              }}
              onClick={() => {
                if (navigator.geolocation) {
                  navigator.geolocation.getCurrentPosition((position) => {
                    setMapCenter({
                      lat: position.coords.latitude,
                      lng: position.coords.longitude,
                    });
                    setMapZoom(14);
                  });
                }
              }}
            >
              <MyLocation />
            </IconButton>
          </Tooltip>
        </Paper>
      </Box>
    </LoadScript>
  );
}
