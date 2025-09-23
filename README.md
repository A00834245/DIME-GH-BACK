# DIME API Backend

A Node.js Express backend API that serves as a proxy to Google Maps Platform Datasets API. This backend provides secure access to Google Maps location data for the DIME Angular frontend application.

## Features

- 🔐 **Secure Authentication**: Uses Google Cloud Service Account for OAuth2 authentication
- 🌍 **Google Maps Integration**: Proxies requests to Google Maps Platform Datasets API
- 🗺️ **GeoJSON Support**: Returns properly formatted GeoJSON data for map visualization
- 🚀 **CORS Enabled**: Configured for Angular frontend running on `localhost:4200`
- 📝 **Comprehensive Logging**: Detailed request/response logging for debugging
- ⚠️ **Error Handling**: Proper HTTP status codes and error messages

## Prerequisites

Before setting up the backend, ensure you have:

1. **Node.js** (v16 or higher)
2. **npm** (v8 or higher)
3. **Google Cloud Project** with Maps Platform Datasets API enabled
4. **Service Account** with appropriate permissions

## Google Cloud Setup

### 1. Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Note your Project ID for later use

### 2. Enable APIs

Enable the following APIs in your Google Cloud project:
```bash
# Via gcloud CLI
gcloud services enable mapsplatformdatasets.googleapis.com
```

Or through the [Google Cloud Console](https://console.cloud.google.com/apis/library):
- Maps Platform Datasets API

### 3. Create Service Account

1. Navigate to **IAM & Admin > Service Accounts**
2. Click **Create Service Account**
3. Fill in the details:
   - Name: `dime-api-service-account`
   - Description: `Service account for DIME API backend`
4. Click **Create and Continue**

### 4. Grant Permissions

Grant the following roles to your service account:
- **Maps Platform Datasets Viewer**
- **Cloud Platform Viewer** (if needed)

### 5. Generate Key File

1. Click on your service account
2. Go to **Keys** tab
3. Click **Add Key > Create new key**
4. Choose **JSON** format
5. Download the key file and save it securely

## Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd AC-DN-SRVC-DIME-API
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   # Copy the example file
   cp .env.example .env
   
   # Edit .env with your actual values
   ```

4. **Configure environment variables**
   
   Edit `.env` file with your Google Cloud details:
   ```env
   # Server Configuration
   PORT=3000
   
   # Google Cloud Configuration
   GOOGLE_CLOUD_PROJECT_ID=your-actual-project-id
   GOOGLE_DATASET_ID=178b4e63-b3c2-4372-a978-320286213f77
   GOOGLE_APPLICATION_CREDENTIALS=./path/to/your/service-account-key.json
   ```

5. **Place your service account key**
   
   Create a secure location for your service account JSON file:
   ```bash
   mkdir keys
   # Copy your service account JSON file to keys/
   # Update GOOGLE_APPLICATION_CREDENTIALS path in .env
   ```

## Usage

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
npm start
```

The server will start on `http://localhost:3000` (or the port specified in your `.env` file).

## API Endpoints

### Dataset Proxy
- **GET** `/api/dataset`
- **Description**: Fetches GeoJSON data from Google Maps Platform Datasets API
- **Response**: GeoJSON FeatureCollection with location data
- **Headers**: `Content-Type: application/geo+json`

**Example Request:**
```bash
curl http://localhost:3000/api/dataset
```

**Example Response:**
```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "Point",
        "coordinates": [-122.4194, 37.7749]
      },
      "properties": {
        "name": "Sample Location",
        "type": "parking"
      }
    }
  ]
}
```

### Health Check
- **GET** `/health`
- **Description**: Server health status
- **Response**: `{"status": "OK", "timestamp": "..."}`

## Error Handling

The API returns appropriate HTTP status codes:

- **200**: Success
- **404**: Dataset not found
- **500**: Authentication failed or server configuration error
- **502**: Unable to reach Google API or invalid response

**Error Response Format:**
```json
{
  "error": "Error Type",
  "message": "Detailed error description"
}
```

## CORS Configuration

The server is configured to accept requests from:
- `http://localhost:4200` (Angular dev server)
- `http://127.0.0.1:4200`

## Frontend Integration

Your Angular frontend can consume the API like this:

```typescript
// Angular service example
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class DatasetService {
  private apiUrl = 'http://localhost:3000/api/dataset';

  constructor(private http: HttpClient) {}

  getDataset(): Observable<any> {
    return this.http.get(this.apiUrl);
  }
}
```

## Troubleshooting

### Common Issues

1. **Authentication Error (500)**
   - Verify service account key file path
   - Check service account permissions
   - Ensure APIs are enabled in Google Cloud

2. **Dataset Not Found (404)**
   - Verify `GOOGLE_DATASET_ID` in `.env`
   - Ensure dataset exists in your Google Cloud project

3. **CORS Error**
   - Check if Angular is running on `localhost:4200`
   - Verify CORS configuration in `server.js`

4. **Cannot Reach Google API (502)**
   - Check internet connection
   - Verify Google Cloud APIs are accessible

### Debug Mode

The server provides detailed logging. Check console output for:
- Request URLs
- Authentication status
- Response details
- Error messages

## Dependencies

- **express**: Web framework
- **google-auth-library**: Google Cloud authentication
- **axios**: HTTP client for API requests
- **cors**: Cross-origin resource sharing
- **dotenv**: Environment variable management

## Security Notes

- Never commit `.env` files or service account keys to version control
- Store service account keys in a secure location
- Use environment variables for sensitive configuration
- Regularly rotate service account keys

## License

MIT License
