import express from 'express'
import googleApi from '../services/googleApi.js'

const router = express.Router()

// Search hotels near a trip destination (Google Places Text Search)
router.get('/search', async (req, res) => {
  try {
    const destination = (req.query.destination || '').trim()
    const query = (req.query.query || '').trim()

    if (!destination) {
      return res.status(400).json({ error: 'destination query parameter is required' })
    }

    // Bias results to the trip destination coordinates when possible.
    const geo = await googleApi.searchPlaceByText(destination)
    const location = geo?.location || null

    const searchQuery = query
      ? `${query} hotel ${destination}`
      : `hotels in ${destination}`

    const hotels = await googleApi.textSearch(searchQuery, location, 20)

    res.json({ hotels })
  } catch (error) {
    console.error('Hotel search error:', error.message)
    res.status(500).json({
      error: 'Failed to search hotels',
      message: error.message,
    })
  }
})

// Hotel autocomplete
router.get('/autocomplete', async (req, res) => {
  try {
    const { input } = req.query

    if (!input || input.trim().length < 2) {
      return res.status(400).json({ error: 'Input parameter is required and must be at least 2 characters' })
    }

    const predictions = await googleApi.autocomplete(input.trim(), 'lodging')

    const hotelSuggestions = predictions.map(prediction => ({
      placeId: prediction.place_id,
      name: prediction.structured_formatting.main_text,
      formattedAddress: prediction.description,
      types: prediction.types
    }))

    res.json({ suggestions: hotelSuggestions })
  } catch (error) {
    console.error('Hotel autocomplete error:', error.message)
    res.status(500).json({ 
      error: 'Failed to fetch hotel suggestions',
      message: error.message 
    })
  }
})

// Hotel details
router.get('/details', async (req, res) => {
  try {
    const { place_id } = req.query

    if (!place_id) {
      return res.status(400).json({ error: 'place_id parameter is required' })
    }

    const details = await googleApi.getPlaceDetails(place_id, [
      'place_id', 'name', 'formatted_address', 'rating', 'geometry', 
      'formatted_phone_number', 'website', 'opening_hours', 'photos', 'reviews',
      'types', 'user_ratings_total', 'price_level'
    ])

    const hotelDetails = {
      placeId: details.place_id,
      name: details.name,
      formattedAddress: details.formatted_address,
      rating: details.rating || null,
      userRatingsTotal: details.user_ratings_total || 0,
      lat: details.geometry?.location?.lat || 0,
      lng: details.geometry?.location?.lng || 0,
      types: details.types || [],
      priceLevel: details.price_level || null,
      formattedPhoneNumber: details.formatted_phone_number,
      website: details.website,
      openingHours: details.opening_hours,
      photos: details.photos?.map(photo => ({
        photoReference: photo.photo_reference,
        width: photo.width,
        height: photo.height
      })) || [],
      reviews: details.reviews?.slice(0, 5).map(review => ({
        authorName: review.author_name,
        rating: review.rating,
        text: review.text,
        time: review.time
      })) || []
    }

    res.json({ hotel: hotelDetails })
  } catch (error) {
    console.error('Hotel details error:', error.message)
    res.status(500).json({ 
      error: 'Failed to fetch hotel details',
      message: error.message 
    })
  }
})

// Calculate distance from airport to hotel
router.get('/distance-from-airport', async (req, res) => {
  try {
    const { hotel_place_id, airport_code } = req.query

    if (!hotel_place_id || !airport_code) {
      return res.status(400).json({ error: 'hotel_place_id and airport_code parameters are required' })
    }

    // Get hotel details first to get location
    const hotelDetails = await googleApi.getPlaceDetails(hotel_place_id, ['geometry'])
    
    if (!hotelDetails.geometry?.location) {
      return res.status(400).json({ error: 'Could not get hotel location' })
    }

    // Use airport code as origin (Google will resolve it)
    const origin = airport_code
    const destination = `place_id:${hotel_place_id}`

    const distanceData = await googleApi.getDistanceMatrix(origin, destination, 'driving')

    if (distanceData.rows?.[0]?.elements?.[0]?.status !== 'OK') {
      return res.status(400).json({ error: 'Could not calculate distance' })
    }

    const element = distanceData.rows[0].elements[0]

    res.json({
      distance: element.distance.text,
      duration: element.duration.text,
      origin: distanceData.origin_addresses[0],
      destination: distanceData.destination_addresses[0]
    })
  } catch (error) {
    console.error('Hotel distance calculation error:', error.message)
    res.status(500).json({ 
      error: 'Failed to calculate distance from airport',
      message: error.message 
    })
  }
})

export default router