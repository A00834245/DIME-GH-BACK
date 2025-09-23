// Quick server test to verify basic functionality
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = 3001; // Use different port for testing

// CORS configuration
const corsOptions = {
  origin: ['http://localhost:4200', 'http://127.0.0.1:4200'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
};

app.use(cors(corsOptions));
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    message: 'DIME API Backend Test Server is running!' 
  });
});

// Mock dataset endpoint for testing
app.get('/api/dataset', (req, res) => {
  // Return mock GeoJSON data for testing
  const mockData = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [-74.006, 40.7128] // New York
        },
        properties: {
          name: "Test Location 1",
          type: "parking",
          description: "Mock parking location"
        }
      },
      {
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [-118.2437, 34.0522] // Los Angeles
        },
        properties: {
          name: "Test Location 2", 
          type: "client",
          description: "Mock client location"
        }
      }
    ]
  };

  res.setHeader('Content-Type', 'application/geo+json');
  res.json(mockData);
});

// Start test server
app.listen(PORT, () => {
  console.log(`🧪 Test server running on http://localhost:${PORT}`);
  console.log(`Test endpoints:`);
  console.log(`- Health: http://localhost:${PORT}/health`);
  console.log(`- Mock Dataset: http://localhost:${PORT}/api/dataset`);
  console.log(`\\nPress Ctrl+C to stop`);
});

module.exports = app;