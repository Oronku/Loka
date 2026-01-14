import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Container,
  Grid,
  Card,
  CardActionArea,
  CardContent,
  CardMedia,
  Button,
  Paper,
  Fade,
  List,
  ListItem,
  ListItemAvatar,
  Avatar,
  ListItemText,
  Divider,
} from '@mui/material';
import { LocationOn, Public, History } from '@mui/icons-material';
import { GoogleMap, Marker, useJsApiLoader } from '@react-google-maps/api';
import QuicketPlaceSearch, {
  PlaceData,
} from '../components/QuicketPlaceSearch';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useNotification } from '../context/NotificationContext';

const POPULAR_CITIES = [
  {
    name: 'Paris',
    country: 'France',
    image:
      'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=800&q=80',
    location: { lat: 48.8566, lng: 2.3522 },
  },
  {
    name: 'New York',
    country: 'USA',
    image:
      'https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?auto=format&fit=crop&w=800&q=80',
    location: { lat: 40.7128, lng: -74.006 },
  },
  {
    name: 'Tokyo',
    country: 'Japan',
    image:
      'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?auto=format&fit=crop&w=800&q=80',
    location: { lat: 35.6762, lng: 139.6503 },
  },
  {
    name: 'London',
    country: 'UK',
    image:
      'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?auto=format&fit=crop&w=800&q=80',
    location: { lat: 51.5074, lng: -0.1278 },
  },
  {
    name: 'Dubai',
    country: 'UAE',
    image:
      'https://images.unsplash.com/photo-1512453979798-5ea936a7fe11?auto=format&fit=crop&w=800&q=80',
    location: { lat: 25.2048, lng: 55.2708 },
  },
  {
    name: 'Rome',
    country: 'Italy',
    image:
      'https://images.unsplash.com/photo-1552832230-c0197dd311b5?auto=format&fit=crop&w=800&q=80',
    location: { lat: 41.9028, lng: 12.4964 },
  },
];

const mapContainerStyle = {
  width: '100%',
  height: '400px',
  borderRadius: '16px',
};

export default function CheckIn() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { showSuccess, showError } = useNotification();
  const [selectedPlace, setSelectedPlace] = useState<PlaceData | null>(null);
  const [mapCenter, setMapCenter] = useState({ lat: 20, lng: 0 });
  const [zoom, setZoom] = useState(2);
  const [checkIns, setCheckIns] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '',
    libraries: ['places'],
  });

  useEffect(() => {
    fetchCheckIns();
  }, []);

  const fetchCheckIns = async () => {
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch('http://localhost:3001/api/checkins', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (response.ok) {
        const data = await response.json();
        setCheckIns(data);
      }
    } catch (error) {
      console.error('Error fetching check-ins:', error);
    }
  };

  const handlePlaceSelect = (place: PlaceData) => {
    setSelectedPlace(place);
    setMapCenter(place.location);
    setZoom(12);
  };

  const handleCityClick = (city: (typeof POPULAR_CITIES)[0]) => {
    const placeData: PlaceData = {
      placeId: `city-${city.name}`,
      name: city.name,
      address: `${city.name}, ${city.country}`,
      location: city.location,
      types: ['locality'],
    };
    handlePlaceSelect(placeData);
  };

  const handleCheckIn = async () => {
    if (!selectedPlace) return;

    setLoading(true);
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch('http://localhost:3001/api/checkins', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(selectedPlace),
      });

      if (response.ok) {
        const newCheckIn = await response.json();
        setCheckIns([newCheckIn, ...checkIns]);
        setSelectedPlace(null);
        setZoom(2);
        setMapCenter({ lat: 20, lng: 0 });
        showSuccess(`✓ ${t('checkIn')} ${selectedPlace.name}!`);
      } else {
        showError(t('checkInFailed'));
      }
    } catch (error) {
      console.error('Error checking in:', error);
      showError(t('checkInError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Typography variant="h4" fontWeight={800} gutterBottom sx={{ mb: 4 }}>
        {t('checkIn')}
      </Typography>

      <Grid container spacing={4}>
        <Grid item xs={12} md={6}>
          <Paper
            elevation={0}
            sx={{
              p: 3,
              borderRadius: 4,
              border: '1px solid',
              borderColor: 'divider',
              height: '100%',
            }}
          >
            <Typography variant="h6" fontWeight={700} gutterBottom>
              {t('whereAreYouNow')}
            </Typography>

            <Box sx={{ mb: 4 }}>
              <QuicketPlaceSearch
                onPlaceSelect={handlePlaceSelect}
                selectedPlace={selectedPlace}
                label={t('searchForLocation')}
                placeholder={t('cityAirportLandmark')}
              />
            </Box>

            {selectedPlace && (
              <Fade in>
                <Box sx={{ textAlign: 'center', mt: 4 }}>
                  <LocationOn
                    sx={{ fontSize: 48, color: 'primary.main', mb: 2 }}
                  />
                  <Typography variant="h5" fontWeight={800}>
                    {selectedPlace.name}
                  </Typography>
                  <Typography
                    variant="body1"
                    color="text.secondary"
                    sx={{ mb: 3 }}
                  >
                    {selectedPlace.address}
                  </Typography>
                  <Button
                    variant="contained"
                    size="large"
                    onClick={handleCheckIn}
                    disabled={loading}
                    fullWidth
                    sx={{
                      borderRadius: 50,
                      py: 1.5,
                      fontSize: '1.1rem',
                    }}
                  >
                    {loading ? t('checkingIn') : t('checkInHere')}
                  </Button>
                </Box>
              </Fade>
            )}

            {/* Recent Check-ins List */}
            {checkIns.length > 0 && (
              <Box sx={{ mt: 4 }}>
                <Typography
                  variant="h6"
                  fontWeight={700}
                  gutterBottom
                  sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
                >
                  <History /> {t('recentCheckIns')}
                </Typography>
                <List sx={{ maxHeight: 300, overflow: 'auto' }}>
                  {checkIns.map((checkIn) => (
                    <ListItem
                      key={checkIn._id}
                      alignItems="flex-start"
                      sx={{ px: 0 }}
                    >
                      <ListItemAvatar>
                        <Avatar sx={{ bgcolor: 'primary.light' }}>
                          <LocationOn />
                        </Avatar>
                      </ListItemAvatar>
                      <ListItemText
                        primary={
                          <Typography variant="subtitle1" fontWeight={600}>
                            {checkIn.name}
                          </Typography>
                        }
                        secondary={
                          <>
                            <Typography
                              variant="body2"
                              color="text.secondary"
                              component="span"
                              display="block"
                            >
                              {checkIn.address}
                            </Typography>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                            >
                              {new Date(checkIn.createdAt).toLocaleDateString()}{' '}
                              {t('at')}{' '}
                              {new Date(checkIn.createdAt).toLocaleTimeString()}
                            </Typography>
                          </>
                        }
                      />
                    </ListItem>
                  ))}
                </List>
              </Box>
            )}
          </Paper>
        </Grid>

        <Grid item xs={12} md={6}>
          {isLoaded ? (
            <Box sx={{ borderRadius: 4, overflow: 'hidden', boxShadow: 3 }}>
              <GoogleMap
                mapContainerStyle={mapContainerStyle}
                center={mapCenter}
                zoom={zoom}
                options={{
                  disableDefaultUI: true,
                  zoomControl: true,
                  styles: [
                    {
                      featureType: 'all',
                      elementType: 'geometry',
                      stylers: [{ color: '#f5f5f5' }],
                    },
                    {
                      featureType: 'water',
                      elementType: 'geometry',
                      stylers: [{ color: '#c9c9c9' }],
                    },
                    {
                      featureType: 'water',
                      elementType: 'labels.text.fill',
                      stylers: [{ color: '#9e9e9e' }],
                    },
                  ],
                }}
              >
                {selectedPlace && <Marker position={selectedPlace.location} />}
                {checkIns.map((checkIn) => (
                  <Marker
                    key={checkIn._id}
                    position={checkIn.location}
                    icon={{
                      url: 'http://maps.google.com/mapfiles/ms/icons/blue-dot.png',
                    }}
                    onClick={() => {
                      setMapCenter(checkIn.location);
                      setZoom(12);
                    }}
                  />
                ))}
              </GoogleMap>
            </Box>
          ) : (
            <Box
              sx={{
                height: 400,
                bgcolor: 'grey.100',
                borderRadius: 4,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Public sx={{ fontSize: 64, color: 'grey.300' }} />
            </Box>
          )}
        </Grid>

        <Grid item xs={12}>
          <Typography variant="h5" fontWeight={700} sx={{ mb: 3, mt: 2 }}>
            {t('popularDestinations')}
          </Typography>
          <Grid container spacing={3}>
            {POPULAR_CITIES.map((city) => (
              <Grid item xs={6} sm={4} md={2} key={city.name}>
                <Card
                  sx={{
                    borderRadius: 4,
                    height: '100%',
                    transition: 'transform 0.2s',
                    '&:hover': {
                      transform: 'translateY(-4px)',
                      boxShadow: 4,
                    },
                  }}
                >
                  <CardActionArea onClick={() => handleCityClick(city)}>
                    <CardMedia
                      component="img"
                      height="120"
                      image={city.image}
                      alt={city.name}
                    />
                    <CardContent sx={{ p: 1.5, textAlign: 'center' }}>
                      <Typography variant="subtitle1" fontWeight={700}>
                        {city.name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {city.country}
                      </Typography>
                    </CardContent>
                  </CardActionArea>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Grid>
      </Grid>
    </Container>
  );
}
