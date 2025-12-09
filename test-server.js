// Quick server test to verify basic functionality
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = 3001; // Use same port as production server

// CORS configuration
const corsOptions = {
  origin: ['http://localhost:4200', 'http://127.0.0.1:4200'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
};

app.use(cors(corsOptions));
app.use(express.json());

// In-memory storage for testing
const visitsStore = new Map();
const commentsStore = new Map();

// Helper functions
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function getLocalDate() {
  return new Date().toISOString().split('T')[0]; // YYYY-MM-DD
}

function getVisitKey(userId, storeId, date) {
  return `${userId}-${storeId}-${date}`;
}

/**
 * Response wrapper for consistent API responses (matches production server format)
 */
function wrapResponse(res, data, statusCode = 200) {
  res.status(statusCode).json({
    success: true,
    data,
    timestamp: new Date().toISOString()
  });
}

/**
 * Error response wrapper (matches production server format)
 */
function wrapError(res, message, statusCode = 400, details = null) {
  res.status(statusCode).json({
    success: false,
    error: {
      message,
      details,
      statusCode
    },
    timestamp: new Date().toISOString()
  });
}

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
          coordinates: [-100.3791779, 25.6700280] // [lng, lat] - Digital Nest, Monterrey
        },
        properties: {
          id: "test-store-1",
          Name: "Digital Nest",
          Category: "Cliente",  // IMPORTANT: Use "Category" with capital C
          Description: "Digital Nest - Centro de distribución",
          "Phone Number": "+52 81 1234 5678",
          "Person Responsable": "Juan Pérez",
          Hours: "8:00 AM - 6:00 PM"
        }
      },
      {
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [-100.3161, 25.6866] // [lng, lat] - Abarrotes San José
        },
        properties: {
          id: "test-store-2",
          Name: "Abarrotes San José",
          Category: "Cliente",  // IMPORTANT: Use "Category" with capital C
          Description: "Tienda de abarrotes y productos básicos para la comunidad.",
          "Phone Number": "+52 81 337 5333",
          "Person Responsable": "Ana Navarro",
          Hours: "8:00 AM - 8:00 PM"
        }
      },
      {
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [-100.3000, 25.7000] // [lng, lat] - Test parking
        },
        properties: {
          id: "test-parking-1",
          Name: "Estacionamiento Centro",
          Category: "Estacionamiento",  // IMPORTANT: Use "Category" with capital C
          Description: "Estacionamiento público",
          Hours: "24 horas"
        }
      }
    ]
  };

  res.setHeader('Content-Type', 'application/geo+json');
  res.json(mockData);
});

// ========================================
// VISITS API (v2) - Mock endpoints
// ========================================

app.post('/api/v2/visits', (req, res) => {
  try {
    console.log('[Test Server] POST /api/v2/visits - Request body:', JSON.stringify(req.body, null, 2));
    
    const { userId, storeId, storeName, coordinates } = req.body;

    if (!userId || !storeId) {
      console.log('[Test Server] Missing required fields - userId:', userId, 'storeId:', storeId);
      return wrapError(res, 'userId and storeId are required', 400);
    }

    if (!coordinates || typeof coordinates.lat !== 'number' || typeof coordinates.lng !== 'number') {
      console.log('[Test Server] Invalid coordinates:', coordinates);
      return wrapError(res, 'Valid coordinates (lat, lng) are required', 400);
    }

    const today = getLocalDate();
    const visitKey = getVisitKey(userId, storeId, today);
    console.log('[Test Server] Visit key:', visitKey);

    // Check if visit already exists
    let visit = visitsStore.get(visitKey);
    
    if (visit) {
      console.log(`[Test Server] Reusing existing visit for ${visitKey}`);
      const response = { 
        visit, 
        created: false,
        message: 'Visit already exists for today'
      };
      console.log('[Test Server] Response:', JSON.stringify(response, null, 2));
      return wrapResponse(res, response);
    }

    // Create new visit
    visit = {
      id: generateId(),
      userId,
      storeId,
      storeName: storeName || 'Unknown Store',
      visitDate: today,
      checkInTimestamp: new Date().toISOString(),
      coordinates: {
        lat: coordinates.lat,
        lng: coordinates.lng
      },
      commentStatus: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    visitsStore.set(visitKey, visit);
    console.log(`[Test Server] Created visit: ${visit.id} for store: ${storeName}`);

    const response = { 
      visit, 
      created: true,
      message: 'Visit created successfully'
    };
    console.log('[Test Server] Response:', JSON.stringify(response, null, 2));
    
    return wrapResponse(res, response, 201);

  } catch (error) {
    console.error('[Test Server] Error creating visit:', error);
    return wrapError(res, 'Failed to create visit', 500, error.message);
  }
});

app.get('/api/v2/visits', (req, res) => {
  try {
    const { userId, date, status = 'all' } = req.query;
    
    if (!userId) {
      return wrapError(res, 'userId is required', 400);
    }

    const targetDate = date || getLocalDate();
    const visits = Array.from(visitsStore.values()).filter(v => 
      v.userId === userId && 
      v.visitDate === targetDate &&
      (status === 'all' || !status || v.commentStatus === status)
    );

    return wrapResponse(res, { 
      visits,
      total: visits.length,
      pending: visits.filter(v => v.commentStatus === 'pending').length,
      completed: visits.filter(v => v.commentStatus === 'completed').length
    });
  } catch (error) {
    return wrapError(res, 'Failed to fetch visits', 500, error.message);
  }
});

app.get('/api/v2/visits/store/:storeId', (req, res) => {
  try {
    const { storeId } = req.params;
    const { userId } = req.query;
    
    if (!userId) {
      return wrapError(res, 'userId is required', 400);
    }

    const today = getLocalDate();
    const visitKey = getVisitKey(userId, storeId, today);
    const visit = visitsStore.get(visitKey);

    if (!visit) {
      return wrapResponse(res, { 
        visit: null, 
        hasVisitToday: false 
      });
    }

    return wrapResponse(res, { 
      visit, 
      hasVisitToday: true 
    });
  } catch (error) {
    return wrapError(res, 'Failed to fetch visit', 500, error.message);
  }
});

// ========================================
// COMMENTS API (v2) - Mock endpoints
// ========================================

app.post('/api/v2/comments', (req, res) => {
  try {
    const { userId, storeId, visitId, text } = req.body;

    if (!userId || !storeId || !text) {
      return wrapError(res, 'userId, storeId, and text are required', 400);
    }

    // Determine if comment is verified (has visitId)
    const verified = !!visitId;

    const comment = {
      id: generateId(),
      userId,
      storeId,
      visitId: visitId || null,
      text: text.trim(),
      verified: verified,
      commentDate: new Date().toISOString(),
      createdAt: new Date().toISOString()
    };

    // Store comment
    if (!commentsStore.has(storeId)) {
      commentsStore.set(storeId, []);
    }
    commentsStore.get(storeId).push(comment);

    // Update visit status if visitId provided
    let visitUpdated = false;
    if (visitId) {
      const visit = Array.from(visitsStore.values()).find(v => v.id === visitId);
      if (visit) {
        visit.commentStatus = 'completed';
        visit.updatedAt = new Date().toISOString();
        visitUpdated = true;
      }
    }

    return wrapResponse(res, { 
      comment,
      verified,
      visitUpdated
    }, 201);
  } catch (error) {
    return wrapError(res, 'Failed to create comment', 500, error.message);
  }
});

app.get('/api/v2/comments', (req, res) => {
  try {
    const { storeId, limit = '50' } = req.query;
    
    if (!storeId) {
      return wrapError(res, 'storeId is required', 400);
    }

    const comments = commentsStore.get(storeId) || [];
    const limitNum = parseInt(limit, 10) || 50;
    const limitedComments = comments.slice(0, limitNum);

    return wrapResponse(res, { 
      comments: limitedComments,
      total: comments.length
    });
  } catch (error) {
    return wrapError(res, 'Failed to fetch comments', 500, error.message);
  }
});

// ========================================
// REMINDERS API (v2) - Mock endpoint
// ========================================

app.get('/api/v2/reminders/pending', (req, res) => {
  try {
    const { userId } = req.query;
    
    if (!userId) {
      return wrapError(res, 'userId is required', 400);
    }

    const today = getLocalDate();
    const pendingVisits = Array.from(visitsStore.values()).filter(v => 
      v.userId === userId && 
      v.visitDate === today &&
      v.commentStatus === 'pending'
    );

    return wrapResponse(res, { 
      pendingVisits: pendingVisits.map(v => ({
        visitId: v.id,
        storeId: v.storeId,
        storeName: v.storeName,
        checkInTimestamp: v.checkInTimestamp
      })),
      count: pendingVisits.length,
      date: today
    });
  } catch (error) {
    return wrapError(res, 'Failed to fetch pending visits', 500, error.message);
  }
});

// ========================================
// TEST UTILITIES - Development only
// ========================================

/**
 * DELETE /api/v2/test/clear
 * Clear all test data (visits and comments)
 * WARNING: This is for testing only!
 */
app.delete('/api/v2/test/clear', (req, res) => {
  try {
    const visitsCount = visitsStore.size;
    const commentsCount = Array.from(commentsStore.values()).reduce((sum, arr) => sum + arr.length, 0);
    
    visitsStore.clear();
    commentsStore.clear();
    
    console.log(`[Test Server] Cleared ${visitsCount} visits and ${commentsCount} comments`);
    
    return wrapResponse(res, {
      message: 'Test data cleared successfully',
      cleared: {
        visits: visitsCount,
        comments: commentsCount
      }
    });
  } catch (error) {
    return wrapError(res, 'Failed to clear test data', 500, error.message);
  }
});

/**
 * GET /api/v2/test/status
 * Get current test data status
 */
app.get('/api/v2/test/status', (req, res) => {
  try {
    const visitsCount = visitsStore.size;
    const commentsCount = Array.from(commentsStore.values()).reduce((sum, arr) => sum + arr.length, 0);
    
    const visits = Array.from(visitsStore.values()).map(v => ({
      id: v.id,
      storeId: v.storeId,
      storeName: v.storeName,
      visitDate: v.visitDate,
      checkInTimestamp: v.checkInTimestamp,
      commentStatus: v.commentStatus
    }));
    
    return wrapResponse(res, {
      visits: {
        total: visitsCount,
        list: visits
      },
      comments: {
        total: commentsCount
      }
    });
  } catch (error) {
    return wrapError(res, 'Failed to get test status', 500, error.message);
  }
});

// Start test server
app.listen(PORT, () => {
  console.log(`🧪 Test server running on http://localhost:${PORT}`);
  console.log(`Test endpoints:`);
  console.log(`- Health: http://localhost:${PORT}/health`);
  console.log(`- Mock Dataset: http://localhost:${PORT}/api/dataset`);
  console.log(`- Visits: POST/GET http://localhost:${PORT}/api/v2/visits`);
  console.log(`- Comments: POST/GET http://localhost:${PORT}/api/v2/comments`);
  console.log(`- Reminders: GET http://localhost:${PORT}/api/v2/reminders/pending`);
  console.log(`\n🧹 Test utilities:`);
  console.log(`- Clear data: DELETE http://localhost:${PORT}/api/v2/test/clear`);
  console.log(`- Status: GET http://localhost:${PORT}/api/v2/test/status`);
  console.log(`\nPress Ctrl+C to stop`);
});

module.exports = app;