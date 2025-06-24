# Panoptic - Audio Meditation App

A web application that uses facial recognition to control audio playback - close your eyes to listen, open them to pause.

## Features

- Real-time facial detection and eye tracking
- Audio playback controlled by eye state (closed = play, open = pause)
- File upload system for custom audio files
- Persistent audio storage using AWS S3

## Setup for Persistent Audio Storage

### Option 1: AWS S3 (Recommended)

1. **Create an AWS S3 Bucket:**
   - Go to AWS S3 Console
   - Create a new bucket (e.g., `your-audio-bucket-name`)
   - Configure bucket permissions for public read access

2. **Create AWS IAM User:**
   - Go to AWS IAM Console
   - Create a new user with programmatic access
   - Attach the `AmazonS3FullAccess` policy (or create a custom policy with minimal permissions)

3. **Configure Environment Variables:**
   ```bash
   cp env.example .env
   ```
   
   Edit `.env` with your AWS credentials:
   ```
   AWS_ACCESS_KEY_ID=your_access_key_here
   AWS_SECRET_ACCESS_KEY=your_secret_key_here
   AWS_REGION=us-east-1
   S3_BUCKET_NAME=your-audio-bucket-name
   ```

4. **Install Dependencies:**
   ```bash
   npm install
   ```

5. **Run the Application:**
   ```bash
   npm start
   ```

### Option 2: Alternative Storage Solutions

#### Google Cloud Storage
- Similar setup to S3
- Use `@google-cloud/storage` package

#### Azure Blob Storage
- Use `@azure/storage-blob` package

#### Database Storage
- Store audio files as BLOBs in PostgreSQL/MySQL
- Use `pg` or `mysql2` packages

## Deployment

### Heroku
1. Set environment variables in Heroku dashboard
2. Deploy using Git:
   ```bash
   git push heroku main
   ```

### Vercel
1. Set environment variables in Vercel dashboard
2. Connect your GitHub repository

### Railway
1. Set environment variables in Railway dashboard
2. Connect your GitHub repository

## File Structure

```
panoptic/
├── public/           # Static files (HTML, CSS, JS)
├── uploads/          # Local file storage (not persisted)
├── server.js         # Express server
├── package.json      # Dependencies
├── metadata.json     # File metadata (persisted)
└── .env             # Environment variables (not in Git)
```

## API Endpoints

- `POST /upload` - Upload audio file
- `GET /audio/:fileId` - Stream audio file
- `GET /listen/:fileId` - Serve listening page
- `GET /info/:fileId` - Get file metadata

## Security Notes

- Never commit `.env` file to Git
- Use IAM roles with minimal required permissions
- Consider implementing file size limits and type validation
- Add authentication for production use

## Troubleshooting

### Audio Files Not Persisting
- Ensure S3 bucket is properly configured
- Check AWS credentials in environment variables
- Verify bucket permissions allow read/write access

### Face Detection Issues
- Ensure camera permissions are granted
- Check browser compatibility
- Verify face-api.js models are loaded correctly 