import { useState } from 'react';
import {
  Box,
  TextField,
  Autocomplete,
  CircularProgress,
  Typography,
  Card,
  CardMedia,
  CardContent,
  Grid,
  Chip,
  IconButton,
} from '@mui/material';
import {
  Attractions,
  Restaurant,
  Hotel as HotelIcon,
  LocationOn,
  Close,
} from '@mui/icons-material';
import { placesAutocomplete, placeDetails } from '../services/api';

export interface PlaceData {
  placeId: string;
  name: string;
  address: string;
  location: {
    lat: number;
    lng: number;
  };
  photoUrl?: string;
  types: string[];
  rating?: number;
}

interface QuicketPlaceSearchProps {
  onPlaceSelect: (place: PlaceData) => void;
  selectedPlace?: PlaceData | null;
  onClear?: () => void;
  label?: string;
  placeholder?: string;
  types?: string; // e.g., "lodging" for hotels, "restaurant", "tourist_attraction"
}

export default function QuicketPlaceSearch({
  onPlaceSelect,
  selectedPlace,
  onClear,
  label = 'Search for place',
  placeholder = 'Start typing...',
  types,
}: QuicketPlaceSearchProps) {
  const [inputValue, setInputValue] = useState('');
  const [options, setOptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchingDetails, setFetchingDetails] = useState(false);

  const handleInputChange = async (value: string) => {
    setInputValue(value);

    if (value.length < 3) {
      setOptions([]);
      return;
    }

    setLoading(true);
    try {
      console.log('Searching places:', { value, types });
      const results = await placesAutocomplete(value, types);
      console.log('Search results:', results);
      // Backend returns { suggestions: [...] } not { predictions: [...] }
      const suggestions = results.suggestions || results.predictions || [];
      // Map backend response to Autocomplete format
      const mappedOptions = suggestions.map((s: any) => ({
        place_id: s.placeId || s.place_id,
        description: s.formattedAddress || s.description,
        structured_formatting: {
          main_text: s.name || s.structured_formatting?.main_text,
          secondary_text:
            s.formattedAddress || s.structured_formatting?.secondary_text,
        },
        types: s.types || [],
      }));
      setOptions(mappedOptions);
    } catch (error) {
      console.error('Error searching places:', error);
      setOptions([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = async (placeId: string) => {
    if (!placeId) return;

    setFetchingDetails(true);
    try {
      const response = await placeDetails(placeId);
      console.log('Place details response:', response);

      // Backend returns { place: {...} }
      const details = response.place || response;

      const placeData: PlaceData = {
        placeId: details.placeId || details.place_id,
        name: details.name,
        address: details.formattedAddress || details.formatted_address,
        location: {
          lat: details.geometry.location.lat,
          lng: details.geometry.location.lng,
        },
        types: details.types || [],
        rating: details.rating,
      };

      // Get photo URL if available
      if (details.photos && details.photos.length > 0) {
        const photoReference =
          details.photos[0].photoReference || details.photos[0].photo_reference;
        placeData.photoUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=${photoReference}&key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY}`;
      }

      onPlaceSelect(placeData);
      setInputValue('');
      setOptions([]);
    } catch (error) {
      console.error('Error fetching place details:', error);
    } finally {
      setFetchingDetails(false);
    }
  };

  const getIconForType = (types: string[]) => {
    if (types.includes('lodging') || types.includes('hotel')) {
      return <HotelIcon fontSize="small" color="action" />;
    }
    if (types.includes('restaurant') || types.includes('food')) {
      return <Restaurant fontSize="small" color="action" />;
    }
    if (
      types.includes('tourist_attraction') ||
      types.includes('point_of_interest')
    ) {
      return <Attractions fontSize="small" color="action" />;
    }
    return <LocationOn fontSize="small" color="action" />;
  };

  if (selectedPlace) {
    return (
      <Card>
        <Grid container>
          {selectedPlace.photoUrl && (
            <Grid item xs={12} sm={4}>
              <CardMedia
                component="img"
                height="160"
                image={selectedPlace.photoUrl}
                alt={selectedPlace.name}
                sx={{ objectFit: 'cover' }}
              />
            </Grid>
          )}
          <Grid item xs={12} sm={selectedPlace.photoUrl ? 8 : 12}>
            <CardContent>
              <Box
                display="flex"
                justifyContent="space-between"
                alignItems="start"
              >
                <Box flex={1}>
                  <Typography variant="h6" gutterBottom>
                    {selectedPlace.name}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" paragraph>
                    📍 {selectedPlace.address}
                  </Typography>
                  {selectedPlace.rating && (
                    <Chip
                      label={`⭐ ${selectedPlace.rating}`}
                      size="small"
                      color="primary"
                      variant="outlined"
                    />
                  )}
                </Box>
                {onClear && (
                  <IconButton size="small" onClick={onClear}>
                    <Close />
                  </IconButton>
                )}
              </Box>
            </CardContent>
          </Grid>
        </Grid>
      </Card>
    );
  }

  return (
    <Autocomplete
      freeSolo={false}
      options={options}
      loading={loading || fetchingDetails}
      value={null}
      inputValue={inputValue}
      onInputChange={(_, newValue) => {
        handleInputChange(newValue);
      }}
      onChange={(_, newValue) => {
        if (newValue && newValue.place_id) {
          handleSelect(newValue.place_id);
        }
      }}
      getOptionLabel={(option) => option.description || ''}
      renderOption={(props, option) => {
        const { key, ...otherProps } = props as any;
        return (
          <Box
            component="li"
            key={key}
            {...otherProps}
            sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}
          >
            {getIconForType(option.types || [])}
            <Box sx={{ flex: 1 }}>
              <Typography variant="body2">
                {option.structured_formatting?.main_text || option.description}
              </Typography>
              {option.structured_formatting?.secondary_text && (
                <Typography variant="caption" color="text.secondary">
                  {option.structured_formatting.secondary_text}
                </Typography>
              )}
            </Box>
          </Box>
        );
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          placeholder={placeholder}
          helperText="Search Google Places for accurate location and photos"
          InputProps={{
            ...params.InputProps,
            endAdornment: (
              <>
                {loading || fetchingDetails ? (
                  <CircularProgress color="inherit" size={20} />
                ) : null}
                {params.InputProps.endAdornment}
              </>
            ),
          }}
        />
      )}
    />
  );
}
