// Vercel serverless function entry point
// Import all dependencies at the top level so Vercel bundles them correctly
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { GoogleAuth } = require('google-auth-library');
require('dotenv').config();

// Now require the server.js which exports the app
const app = require('../server.js');

// For Vercel, we need to export the app as a handler function
// Vercel will call this function with (req, res) for each request
module.exports = (req, res) => {
  // Delegate to Express app
  app(req, res);
};
