# Video Generator App

A web application for generating videos using the Kie.ai API, built with Supabase Edge Functions and a modern frontend.

## Features

- 🎬 Generate videos from text prompts using Kie.ai API
- 📊 View all video generation tasks in a dashboard
- 🔄 Automatic status polling for pending videos
- 📹 Video preview and download when generation completes
- 🎨 Modern, responsive UI

## Setup

### Prerequisites

- Supabase CLI installed and configured
- Supabase project created
- Kie.ai API key

### Configuration

1. **Get your Supabase Anon Key:**
   - Go to your [Supabase Dashboard](https://supabase.com/dashboard/project/xpkvqfkhbfvjqkeqsomb/settings/api)
   - Copy the "anon/public" key
   - Update `public/app.js` line 4 with your anon key:
     ```javascript
     const SUPABASE_ANON_KEY = 'your-anon-key-here'
     ```

2. **API Key is already stored:**
   - The Kie.ai API key has been stored in Supabase secrets
   - No additional configuration needed

### Running the Application

1. **Serve the frontend:**
   ```bash
   # Using Python
   cd public
   python3 -m http.server 8000
   
   # Or using Node.js
   npx serve public
   
   # Or using any static file server
   ```

2. **Open in browser:**
   - Navigate to `http://localhost:8000`
   - Enter your Supabase anon key when prompted (or update app.js)

## Project Structure

```
video-1/
├── supabase/
│   ├── functions/
│   │   ├── generate-video/    # Edge Function to generate videos
│   │   ├── check-status/      # Edge Function to check video status
│   │   └── hello-test/        # Test function
│   └── migrations/
│       └── 20250101000000_create_video_generations_table.sql
├── public/
│   ├── index.html             # Main frontend page
│   ├── styles.css             # Styling
│   └── app.js                 # Frontend JavaScript
└── README.md
```

## API Endpoints

### Generate Video
- **URL:** `https://xpkvqfkhbfvjqkeqsomb.supabase.co/functions/v1/generate-video`
- **Method:** POST
- **Body:**
  ```json
  {
    "prompt": "A dog playing in a park",
    "imageUrls": ["http://example.com/image1.jpg"],
    "model": "veo3_fast",
    "watermark": "MyBrand",
    "aspectRatio": "16:9",
    "seeds": 12345,
    "enableFallback": false,
    "enableTranslation": true,
    "generationType": "REFERENCE_2_VIDEO"
  }
  ```

### Check Status
- **URL:** `https://xpkvqfkhbfvjqkeqsomb.supabase.co/functions/v1/check-status?taskId=<task_id>`
- **Method:** GET

## Database Schema

The `video_generations` table stores:
- Task information (task_id, prompt, model, etc.)
- Status tracking (pending, processing, completed, failed)
- Result URLs and metadata
- Timestamps

## Usage

1. Fill out the generation form with:
   - Prompt (required)
   - Optional image URLs
   - Model settings
   - Aspect ratio
   - Other options

2. Click "Generate Video"

3. The app will:
   - Submit the request to Kie.ai
   - Store the task in the database
   - Start polling for status updates
   - Display the video when complete

4. View all generations in the dashboard below the form

## Troubleshooting

- **CORS errors:** Make sure you're using the correct Supabase URL and anon key
- **API errors:** Check that the Kie.ai API key is correctly stored in Supabase secrets
- **Status not updating:** Check browser console for errors, ensure polling is active

## Deployment

The Edge Functions are already deployed. To redeploy:

```bash
supabase functions deploy generate-video
supabase functions deploy check-status
```

To update the database:

```bash
supabase db push
```

