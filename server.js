const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { GoogleAuth } = require('google-auth-library');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// CORS configuration to allow requests from Angular frontend
const allowedOrigins = [
  'http://localhost:4200',
  'http://127.0.0.1:4200',
  'https://dime-gh-vercel-front.vercel.app',
  process.env.FRONTEND_URL // Allow custom frontend URL from environment
].filter(Boolean); // Remove any undefined values

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Check if origin is in allowed list
    if (allowedOrigins.indexOf(origin) !== -1) {
      return callback(null, true);
    }
    
    // Allow all Vercel preview deployments (for testing)
    if (origin.includes('.vercel.app')) {
      console.log(`[CORS] Allowing Vercel deployment: ${origin}`);
      return callback(null, true);
    }
    
    // Allow in development mode
    if (process.env.NODE_ENV === 'development') {
      return callback(null, true);
    }
    
    console.warn(`[CORS] Blocked origin: ${origin}`);
    callback(new Error('Not allowed by CORS'));
  },
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

// ========================================
// IN-MEMORY DATA STORES
// ========================================

// Visits store: Map<string, Visit>
// Key format: `${userId}-${storeId}-${visitDate}`
const visitsStore = new Map();

// Comments store: Array<VisitComment>
const commentsStore = [];

// Scheduled reminders store
const remindersStore = new Map();

// ========================================
// HELPER FUNCTIONS
// ========================================

/**
 * Get current local date in YYYY-MM-DD format
 * Uses Mexico City timezone (UTC-6)
 */
function getLocalDate(timestamp = Date.now()) {
  const date = new Date(timestamp);
  // Adjust for Mexico City timezone (UTC-6, or UTC-5 during DST)
  const mexicoCityOffset = -6 * 60; // minutes
  const localDate = new Date(date.getTime() + (mexicoCityOffset - date.getTimezoneOffset()) * 60000);
  return localDate.toISOString().split('T')[0];
}

/**
 * Get end of day timestamp for a given date (23:59:59.999)
 */
function getEndOfDay(dateString) {
  const date = new Date(dateString + 'T23:59:59.999-06:00');
  return date.getTime();
}

/**
 * Generate unique ID
 */
function generateId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Get visit key for uniqueness check
 */
function getVisitKey(userId, storeId, visitDate) {
  return `${userId}-${storeId}-${visitDate}`;
}

/**
 * Response wrapper for consistent API responses
 */
function wrapResponse(res, data, statusCode = 200) {
  res.status(statusCode).json({
    success: true,
    data,
    timestamp: new Date().toISOString()
  });
}

/**
 * Error response wrapper
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

// ========================================
// ROOT ENDPOINT
// ========================================

app.get('/', (req, res) => {
  res.json({
    service: 'DIME API Backend',
    status: 'OK',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
    endpoints: {
      health: '/health',
      dataset: '/api/dataset',
      visits: {
        create: 'POST /api/v2/visits',
        list: 'GET /api/v2/visits',
        get: 'GET /api/v2/visits/:visitId',
        getByStore: 'GET /api/v2/visits/store/:storeId'
      },
      comments: {
        create: 'POST /api/v2/comments',
        list: 'GET /api/v2/comments'
      },
      reminders: {
        pending: 'GET /api/v2/reminders/pending'
      }
    }
  });
});

// ========================================
// HEALTH CHECK ENDPOINT
// ========================================

app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    stores: {
      visits: visitsStore.size,
      comments: commentsStore.length,
      reminders: remindersStore.size
    }
  });
});

// ========================================
// VISITS API (v2)
// ========================================

/**
 * POST /api/v2/visits
 * Create or reuse a visit for today
 * 
 * Body: {
 *   userId: string,
 *   storeId: string,
 *   storeName?: string,
 *   coordinates: { lat: number, lng: number }
 * }
 * 
 * Returns existing visit if one exists for today, or creates new one
 */
app.post('/api/v2/visits', (req, res) => {
  try {
    const { userId, storeId, storeName, coordinates } = req.body;

    // Validation
    if (!userId || !storeId) {
      return wrapError(res, 'userId and storeId are required', 400);
    }

    if (!coordinates || typeof coordinates.lat !== 'number' || typeof coordinates.lng !== 'number') {
      return wrapError(res, 'Valid coordinates (lat, lng) are required', 400);
    }

    const today = getLocalDate();
    const visitKey = getVisitKey(userId, storeId, today);

    // Check if visit already exists for today
    let visit = visitsStore.get(visitKey);
    
    if (visit) {
      console.log(`[Visits] Reusing existing visit for ${visitKey}`);
      return wrapResponse(res, { 
        visit, 
        created: false,
        message: 'Visit already exists for today'
      });
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
      commentStatus: 'pending', // 'pending' | 'completed'
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    visitsStore.set(visitKey, visit);
    console.log(`[Visits] Created new visit: ${visit.id} for ${visitKey}`);

    // Schedule reminders for this visit (HU5)
    scheduleVisitReminders(visit);

    return wrapResponse(res, { 
      visit, 
      created: true,
      message: 'Visit created successfully'
    }, 201);

  } catch (error) {
    console.error('[Visits] Error creating visit:', error);
    return wrapError(res, 'Failed to create visit', 500, error.message);
  }
});

/**
 * GET /api/v2/visits
 * Get visits for a user, optionally filtered by date
 * 
 * Query params:
 *   userId: string (required)
 *   date?: string (YYYY-MM-DD, defaults to today)
 *   status?: 'pending' | 'completed' | 'all' (defaults to 'all')
 */
app.get('/api/v2/visits', (req, res) => {
  try {
    const { userId, date, status = 'all' } = req.query;

    if (!userId) {
      return wrapError(res, 'userId is required', 400);
    }

    const targetDate = date || getLocalDate();
    
    // Filter visits
    const visits = [];
    for (const [key, visit] of visitsStore.entries()) {
      if (visit.userId === userId && visit.visitDate === targetDate) {
        if (status === 'all' || visit.commentStatus === status) {
          visits.push(visit);
        }
      }
    }

    // Sort by check-in time (most recent first)
    visits.sort((a, b) => new Date(b.checkInTimestamp) - new Date(a.checkInTimestamp));

    console.log(`[Visits] Found ${visits.length} visits for user ${userId} on ${targetDate}`);

    return wrapResponse(res, { 
      visits,
      date: targetDate,
      total: visits.length,
      pending: visits.filter(v => v.commentStatus === 'pending').length,
      completed: visits.filter(v => v.commentStatus === 'completed').length
    });

  } catch (error) {
    console.error('[Visits] Error fetching visits:', error);
    return wrapError(res, 'Failed to fetch visits', 500, error.message);
  }
});

/**
 * GET /api/v2/visits/:visitId
 * Get a specific visit by ID
 */
app.get('/api/v2/visits/:visitId', (req, res) => {
  try {
    const { visitId } = req.params;

    for (const visit of visitsStore.values()) {
      if (visit.id === visitId) {
        return wrapResponse(res, { visit });
      }
    }

    return wrapError(res, 'Visit not found', 404);

  } catch (error) {
    console.error('[Visits] Error fetching visit:', error);
    return wrapError(res, 'Failed to fetch visit', 500, error.message);
  }
});

/**
 * GET /api/v2/visits/store/:storeId
 * Get today's visit for a specific store (if exists)
 * 
 * Query params:
 *   userId: string (required)
 */
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

    if (visit) {
      return wrapResponse(res, { visit, hasVisitToday: true });
    }

    return wrapResponse(res, { visit: null, hasVisitToday: false });

  } catch (error) {
    console.error('[Visits] Error fetching store visit:', error);
    return wrapError(res, 'Failed to fetch store visit', 500, error.message);
  }
});

// ========================================
// COMMENTS API (v2)
// ========================================

/**
 * POST /api/v2/comments
 * Create a comment, optionally linked to a visit
 * 
 * Body: {
 *   userId: string,
 *   storeId: string,
 *   text: string,
 *   visitId?: string (if provided, comment is verified)
 * }
 */
app.post('/api/v2/comments', (req, res) => {
  try {
    const { userId, storeId, text, visitId } = req.body;

    // Validation
    if (!userId || !storeId || !text) {
      return wrapError(res, 'userId, storeId, and text are required', 400);
    }

    // Sanitize text (basic XSS prevention)
    const sanitizedText = text
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .substring(0, 1000); // Max 1000 characters

    if (sanitizedText.length < 1) {
      return wrapError(res, 'Comment text cannot be empty', 400);
    }

    const today = getLocalDate();
    let verified = false;
    let associatedVisit = null;

    // If visitId provided, verify it exists and belongs to user
    if (visitId) {
      for (const visit of visitsStore.values()) {
        if (visit.id === visitId && visit.userId === userId) {
          associatedVisit = visit;
          break;
        }
      }

      if (associatedVisit) {
        // Check if visit is from today and comment is before 23:59
        const visitDate = associatedVisit.visitDate;
        const endOfDay = getEndOfDay(visitDate);
        
        if (visitDate === today && Date.now() <= endOfDay) {
          verified = true;
          
          // Update visit status to completed if this is the first verified comment
          if (associatedVisit.commentStatus === 'pending') {
            associatedVisit.commentStatus = 'completed';
            associatedVisit.updatedAt = new Date().toISOString();
            
            // Update in store
            const visitKey = getVisitKey(associatedVisit.userId, associatedVisit.storeId, visitDate);
            visitsStore.set(visitKey, associatedVisit);
            
            console.log(`[Comments] Updated visit ${associatedVisit.id} commentStatus to 'completed'`);
            
            // Cancel pending reminders for this user if all visits are completed
            checkAndCancelReminders(userId, visitDate);
          }
        }
      }
    }

    // Create comment
    const comment = {
      id: generateId(),
      userId,
      storeId,
      visitId: associatedVisit ? associatedVisit.id : null,
      text: sanitizedText,
      verified,
      commentDate: today,
      createdAt: new Date().toISOString()
    };

    commentsStore.push(comment);
    console.log(`[Comments] Created comment ${comment.id}, verified: ${verified}`);

    return wrapResponse(res, { 
      comment,
      verified,
      visitUpdated: verified && associatedVisit?.commentStatus === 'completed'
    }, 201);

  } catch (error) {
    console.error('[Comments] Error creating comment:', error);
    return wrapError(res, 'Failed to create comment', 500, error.message);
  }
});

/**
 * GET /api/v2/comments
 * Get comments for a store
 * 
 * Query params:
 *   storeId: string (required)
 *   limit?: number (default 50)
 */
app.get('/api/v2/comments', (req, res) => {
  try {
    const { storeId, limit = 50 } = req.query;

    if (!storeId) {
      return wrapError(res, 'storeId is required', 400);
    }

    const comments = commentsStore
      .filter(c => c.storeId === storeId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, parseInt(limit));

    return wrapResponse(res, { 
      comments,
      total: comments.length 
    });

  } catch (error) {
    console.error('[Comments] Error fetching comments:', error);
    return wrapError(res, 'Failed to fetch comments', 500, error.message);
  }
});

// ========================================
// REMINDERS (HU5 - Internal functionality)
// ========================================

/**
 * Schedule reminders for a visit (3h and 6h after check-in)
 */
function scheduleVisitReminders(visit) {
  const checkInTime = new Date(visit.checkInTimestamp).getTime();
  const endOfDay = getEndOfDay(visit.visitDate);
  
  const reminders = [];
  
  // 3 hour reminder
  const reminder3h = checkInTime + (3 * 60 * 60 * 1000);
  if (reminder3h < endOfDay) {
    reminders.push({
      id: generateId(),
      visitId: visit.id,
      userId: visit.userId,
      storeId: visit.storeId,
      scheduledFor: new Date(reminder3h).toISOString(),
      type: '3h',
      sent: false
    });
  }
  
  // 6 hour reminder
  const reminder6h = checkInTime + (6 * 60 * 60 * 1000);
  if (reminder6h < endOfDay) {
    reminders.push({
      id: generateId(),
      visitId: visit.id,
      userId: visit.userId,
      storeId: visit.storeId,
      scheduledFor: new Date(reminder6h).toISOString(),
      type: '6h',
      sent: false
    });
  }
  
  if (reminders.length > 0) {
    remindersStore.set(visit.id, reminders);
    console.log(`[Reminders] Scheduled ${reminders.length} reminders for visit ${visit.id}`);
  }
}

/**
 * Check if all visits for a user/date are completed and cancel reminders
 */
function checkAndCancelReminders(userId, date) {
  let allCompleted = true;
  let pendingVisits = [];
  
  for (const visit of visitsStore.values()) {
    if (visit.userId === userId && visit.visitDate === date) {
      if (visit.commentStatus === 'pending') {
        allCompleted = false;
        pendingVisits.push(visit);
      }
    }
  }
  
  if (allCompleted) {
    // Cancel all reminders for this user's visits today
    for (const visit of visitsStore.values()) {
      if (visit.userId === userId && visit.visitDate === date) {
        remindersStore.delete(visit.id);
      }
    }
    console.log(`[Reminders] Cancelled all reminders for user ${userId} on ${date} - all visits completed`);
  }
  
  return { allCompleted, pendingCount: pendingVisits.length };
}

/**
 * GET /api/v2/reminders/pending
 * Get pending visits with reminders for a user (for banner display)
 */
app.get('/api/v2/reminders/pending', (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return wrapError(res, 'userId is required', 400);
    }

    const today = getLocalDate();
    const pendingVisits = [];

    for (const visit of visitsStore.values()) {
      if (visit.userId === userId && 
          visit.visitDate === today && 
          visit.commentStatus === 'pending') {
        pendingVisits.push({
          visitId: visit.id,
          storeId: visit.storeId,
          storeName: visit.storeName,
          checkInTimestamp: visit.checkInTimestamp
        });
      }
    }

    return wrapResponse(res, {
      pendingVisits,
      count: pendingVisits.length,
      date: today
    });

  } catch (error) {
    console.error('[Reminders] Error fetching pending visits:', error);
    return wrapError(res, 'Failed to fetch pending visits', 500, error.message);
  }
});

// ========================================
// GOOGLE DATASETS API PROXY
// ========================================

app.get('/api/dataset', async (req, res) => {
  try {
    console.log('Fetching dataset from Google Maps Platform Datasets API...');
    
    // Validate required environment variables
    const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;
    const datasetId = process.env.GOOGLE_DATASET_ID;
    const credentialsValue = process.env.GOOGLE_APPLICATION_CREDENTIALS;

    if (!projectId || !datasetId || !credentialsValue) {
      console.error('Missing required environment variables');
      return res.status(500).json({
        error: 'Server configuration error',
        message: 'Missing required environment variables. Please check GOOGLE_CLOUD_PROJECT_ID, GOOGLE_DATASET_ID, and GOOGLE_APPLICATION_CREDENTIALS.'
      });
    }

    // Initialize Google Auth with service account
    // Support both JSON string (Vercel) and file path (local dev)
    let auth;
    try {
      // Try to parse as JSON (for Vercel environment variable)
      try {
        const credentials = JSON.parse(credentialsValue);
        auth = new GoogleAuth({
          credentials: credentials,
          scopes: ['https://www.googleapis.com/auth/cloud-platform']
        });
      } catch (parseError) {
        // If parsing fails, assume it's a file path (for local development)
        auth = new GoogleAuth({
          keyFile: credentialsValue,
          scopes: ['https://www.googleapis.com/auth/cloud-platform']
        });
      }
    } catch (error) {
      console.error('Error initializing Google Auth:', error);
      return res.status(500).json({
        error: 'Authentication configuration error',
        message: 'Failed to initialize Google Auth. Check GOOGLE_APPLICATION_CREDENTIALS format.'
      });
    }

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

// ========================================
// ERROR HANDLERS
// ========================================

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

// ========================================
// START SERVER
// ========================================

// Only start server if not in Vercel (serverless) environment
if (process.env.VERCEL !== '1') {
  app.listen(PORT, () => {
    console.log(`🚀 DIME API Backend running on http://localhost:${PORT}`);
    console.log('');
    console.log('📍 Available endpoints:');
    console.log(`   GET  /health                     - Health check`);
    console.log(`   GET  /api/dataset                - Google Maps dataset proxy`);
    console.log('');
    console.log('   📌 Visits API (v2):');
    console.log(`   POST /api/v2/visits              - Create/reuse visit`);
    console.log(`   GET  /api/v2/visits              - Get user visits by date`);
    console.log(`   GET  /api/v2/visits/:visitId     - Get specific visit`);
    console.log(`   GET  /api/v2/visits/store/:id    - Get today's visit for store`);
    console.log('');
    console.log('   💬 Comments API (v2):');
    console.log(`   POST /api/v2/comments            - Create comment`);
    console.log(`   GET  /api/v2/comments            - Get store comments`);
    console.log('');
    console.log('   🔔 Reminders API (v2):');
    console.log(`   GET  /api/v2/reminders/pending   - Get pending visits for banner`);
    console.log('');
    console.log('Ready to serve requests from Angular frontend (http://localhost:4200)');
  });
}

// Export app for Vercel serverless
module.exports = app;
