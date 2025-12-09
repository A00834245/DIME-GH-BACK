// Vercel serverless function entry point
// Import all dependencies at the top level so Vercel bundles them correctly
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { GoogleAuth } = require('google-auth-library');
require('dotenv').config();

// Now require the server.js which exports the app
const app = require('../server.js');

// Export the app as the serverless function handler
module.exports = app;
