const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { GoogleAuth } = require('google-auth-library');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// CORS configuration to allow requests from Angular frontend
const corsOptions = {
  origin: ['http://localhost:4200', 'http://127.0.0.1:4200'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
};

app.use(cors(corsOptions));
app.use(express.json());

// Logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Google Datasets API proxy endpoint
app.get('/api/dataset', async (req, res) => {
  try {
    console.log('Fetching dataset from Google Maps Platform Datasets API...');
    
    // Validate required environment variables
    const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;
    const datasetId = process.env.GOOGLE_DATASET_ID;
    const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

    if (!projectId || !datasetId || !credentialsPath) {
      console.error('Missing required environment variables');
      return res.status(500).json({
        error: 'Server configuration error',
        message: 'Missing required environment variables. Please check GOOGLE_CLOUD_PROJECT_ID, GOOGLE_DATASET_ID, and GOOGLE_APPLICATION_CREDENTIALS.'
      });
    }

    // Initialize Google Auth with service account
    const auth = new GoogleAuth({
      keyFile: credentialsPath,
      scopes: ['https://www.googleapis.com/auth/cloud-platform']
    });

    // Get access token
    const authClient = await auth.getClient();
    const accessToken = await authClient.getAccessToken();

    if (!accessToken.token) {
      console.error('Failed to obtain access token');
      return res.status(500).json({
        error: 'Authentication failed',
        message: 'Unable to obtain access token from service account'
      });
    }

    console.log('Successfully authenticated with Google Cloud');

    // Construct the Datasets API URL
    const datasetsUrl = `https://mapsplatformdatasets.googleapis.com/v1/projects/${projectId}/datasets/${datasetId}:download?alt=media`;
    
    console.log(`Requesting data from: ${datasetsUrl}`);

    // Make request to Google Datasets API
    const response = await axios.get(datasetsUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken.token}`,
        'Accept': 'application/json'
      },
      timeout: 30000 // 30 second timeout
    });

    console.log('Successfully fetched dataset from Google API');
    console.log(`Response status: ${response.status}`);
    console.log(`Content-Type: ${response.headers['content-type']}`);

    // Validate that we received GeoJSON data
    let geoJsonData;
    if (typeof response.data === 'string') {
      try {
        geoJsonData = JSON.parse(response.data);
      } catch (parseError) {
        console.error('Failed to parse response as JSON:', parseError.message);
        return res.status(502).json({
          error: 'Invalid response format',
          message: 'Google API returned invalid JSON data'
        });
      }
    } else {
      geoJsonData = response.data;
    }

    // Validate GeoJSON structure
    if (!geoJsonData.type || geoJsonData.type !== 'FeatureCollection') {
      console.warn('Response does not appear to be a valid GeoJSON FeatureCollection');
    }

    // Set appropriate headers for GeoJSON response
    res.setHeader('Content-Type', 'application/geo+json');
    res.setHeader('Cache-Control', 'no-cache');
    
    // Return the GeoJSON data to the frontend
    res.json(geoJsonData);

  } catch (error) {
    console.error('Error in /api/dataset endpoint:', error);

    // Handle different types of errors
    if (error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
      return res.status(502).json({
        error: 'Bad Gateway',
        message: 'Unable to reach Google Maps Platform Datasets API. Please check your network connection.'
      });
    }

    if (error.response) {
      // Google API returned an error response
      console.error('Google API Error Response:', {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data
      });

      if (error.response.status === 401 || error.response.status === 403) {
        return res.status(500).json({
          error: 'Authentication failed',
          message: 'Invalid service account credentials or insufficient permissions. Please verify your service account setup.'
        });
      }

      if (error.response.status === 404) {
        return res.status(404).json({
          error: 'Dataset not found',
          message: 'The specified dataset ID was not found. Please verify GOOGLE_DATASET_ID.'
        });
      }

      return res.status(502).json({
        error: 'Google API Error',
        message: `Google API returned status ${error.response.status}: ${error.response.statusText}`
      });
    }

    // Generic server error
    return res.status(500).json({
      error: 'Internal server error',
      message: 'An unexpected error occurred while processing your request.'
    });
  }
});

// 404 handler for unknown routes
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.originalUrl} not found`
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: 'An unexpected error occurred'
  });
});

// Start the server
app.listen(PORT, () => {
  console.log(`🚀 DIME API Backend running on http://localhost:${PORT}`);
  console.log(`📍 Dataset endpoint: http://localhost:${PORT}/api/dataset`);
  console.log(`❤️  Health check: http://localhost:${PORT}/health`);
  console.log('');
  console.log('Required environment variables:');
  console.log('- GOOGLE_CLOUD_PROJECT_ID');
  console.log('- GOOGLE_DATASET_ID');
  console.log('- GOOGLE_APPLICATION_CREDENTIALS');
  console.log('');
  console.log('Ready to serve requests from Angular frontend (http://localhost:4200)');
});

module.exports = app;