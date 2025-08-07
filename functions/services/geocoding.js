const axios = require('axios');
const functions = require('firebase-functions');

class GeocodingService {
  constructor() {
    const config = functions.config();
    this.apiKey = config.maps?.api_key || process.env.GOOGLE_MAPS_API_KEY;
    this.cache = new Map(); // In-memory cache for this function instance
    
    if (!this.apiKey) {
      console.warn('⚠️ Google Maps API key not configured');
    }
  }

  async reverseGeocode(lat, lng) {
    const cacheKey = `${lat.toFixed(4)},${lng.toFixed(4)}`;
    
    if (this.cache.has(cacheKey)) {
      console.log(`📍 Using cached location for ${cacheKey}`);
      return this.cache.get(cacheKey);
    }

    if (!this.apiKey) {
      return {
        formatted_address: `พิกัด: ${lat.toFixed(6)}, ${lng.toFixed(6)}`,
        place_id: null,
        types: ['no_api_key']
      };
    }

    try {
      const response = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
        params: {
          latlng: `${lat},${lng}`,
          key: this.apiKey,
          language: 'th',
          region: 'TH'
        },
        timeout: 5000 // 5 second timeout
      });

      if (response.data.status === 'OK' && response.data.results.length > 0) {
        const result = {
          formatted_address: response.data.results[0].formatted_address,
          place_id: response.data.results[0].place_id,
          types: response.data.results[0].types
        };

        // Cache the result
        this.cache.set(cacheKey, result);
        
        console.log(`📍 Geocoded: ${lat},${lng} -> ${result.formatted_address}`);
        return result;
      } else {
        throw new Error(`Geocoding failed: ${response.data.status}`);
      }
    } catch (error) {
      console.error('❌ Geocoding error:', error.message);
      return {
        formatted_address: `พิกัด: ${lat.toFixed(6)}, ${lng.toFixed(6)}`,
        place_id: null,
        types: ['geocoding_fallback']
      };
    }
  }

  // Clear cache (useful for testing)
  clearCache() {
    this.cache.clear();
    console.log('🧹 Geocoding cache cleared');
  }
}

module.exports = new GeocodingService();