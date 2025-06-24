require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const app = express();
const PORT = process.env.PORT || 3000;

// AWS S3 Configuration
console.log('Initializing S3 client...');
console.log('AWS Region:', process.env.AWS_REGION || 'us-east-1');
console.log('S3 Bucket:', process.env.S3_BUCKET_NAME || 'your-audio-bucket-name');
console.log('AWS Access Key ID configured:', !!process.env.AWS_ACCESS_KEY_ID);
console.log('AWS Secret Access Key configured:', !!process.env.AWS_SECRET_ACCESS_KEY);

const s3Client = new S3Client({
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    }
});

const BUCKET_NAME = process.env.S3_BUCKET_NAME || 'your-audio-bucket-name';

// Create uploads directory if it doesn't exist
const uploadsDir = './uploads';
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
}

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        // Generate unique filename with original extension
        const uniqueId = crypto.randomUUID();
        const extension = path.extname(file.originalname);
        cb(null, `${uniqueId}${extension}`);
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 50 * 1024 * 1024 // 50MB limit
    },
    fileFilter: (req, file, cb) => {
        // Accept only audio files
        if (file.mimetype.startsWith('audio/')) {
            cb(null, true);
        } else {
            cb(new Error('Only audio files are allowed!'), false);
        }
    }
});

// Store file metadata (in production, use a database)
const fileMetadata = new Map();
const metadataFile = './metadata.json';

// Load existing metadata from file
function loadMetadata() {
    try {
        if (fs.existsSync(metadataFile)) {
            const data = fs.readFileSync(metadataFile, 'utf8');
            const metadata = JSON.parse(data);
            metadata.forEach(([key, value]) => {
                fileMetadata.set(key, value);
            });
            console.log(`Loaded ${fileMetadata.size} file metadata entries`);
        }
    } catch (error) {
        console.error('Error loading metadata:', error);
    }
}

// Save metadata to file
function saveMetadata() {
    try {
        const data = JSON.stringify(Array.from(fileMetadata.entries()));
        fs.writeFileSync(metadataFile, data);
    } catch (error) {
        console.error('Error saving metadata:', error);
    }
}

// Rebuild metadata from existing files
function rebuildMetadataFromFiles() {
    try {
        if (fs.existsSync(uploadsDir)) {
            const files = fs.readdirSync(uploadsDir);
            files.forEach(filename => {
                const fileId = path.parse(filename).name;
                const filePath = path.join(uploadsDir, filename);
                const stats = fs.statSync(filePath);
                
                // Only add if not already in metadata
                if (!fileMetadata.has(fileId)) {
                    fileMetadata.set(fileId, {
                        originalName: filename, // We don't have the original name, so use filename
                        filename: filename,
                        size: stats.size,
                        mimetype: 'audio/mpeg', // Default to MP3, adjust as needed
                        uploadDate: stats.birthtime
                    });
                }
            });
            console.log(`Rebuilt metadata for ${files.length} files`);
            saveMetadata();
        }
    } catch (error) {
        console.error('Error rebuilding metadata:', error);
    }
}

// Load metadata on startup
loadMetadata();
rebuildMetadataFromFiles();

// Serve static files with proper MIME types
app.use(express.static('public', {
    setHeaders: (res, path, stat) => {
        if (path.endsWith('.css')) {
            res.set('Content-Type', 'text/css');
        } else if (path.endsWith('.js')) {
            res.set('Content-Type', 'application/javascript');
        } else if (path.endsWith('.html')) {
            res.set('Content-Type', 'text/html');
        }
    }
}));
app.use(express.json());

// Upload endpoint
app.post('/upload', upload.single('audio'), async (req, res) => {
    console.log('Upload request received');
    
    if (!req.file) {
        console.log('No file in request');
        return res.status(400).json({ error: 'No audio file uploaded' });
    }

    console.log('File received:', req.file.originalname, 'Size:', req.file.size);

    try {
        // Check if AWS credentials are configured
        if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
            console.error('AWS credentials not configured');
            return res.status(500).json({ error: 'AWS credentials not configured' });
        }

        if (!process.env.S3_BUCKET_NAME) {
            console.error('S3 bucket name not configured');
            return res.status(500).json({ error: 'S3 bucket name not configured' });
        }

        console.log('AWS credentials found, proceeding with upload');

        // Generate unique file ID
        const fileId = path.parse(req.file.filename).name;
        console.log('Generated file ID:', fileId);
        
        // Upload to S3
        const fileContent = fs.readFileSync(req.file.path);
        console.log('File read, size:', fileContent.length);
        
        const uploadParams = {
            Bucket: BUCKET_NAME,
            Key: `audio/${fileId}${path.extname(req.file.originalname)}`,
            Body: fileContent,
            ContentType: req.file.mimetype,
            Metadata: {
                originalName: req.file.originalname,
                uploadDate: new Date().toISOString()
            }
        };

        console.log('Uploading to S3 with params:', {
            Bucket: uploadParams.Bucket,
            Key: uploadParams.Key,
            ContentType: uploadParams.ContentType
        });

        await s3Client.send(new PutObjectCommand(uploadParams));
        console.log('S3 upload successful');

        // Store metadata locally (or in a database)
        fileMetadata.set(fileId, {
            originalName: req.file.originalname,
            filename: `${fileId}${path.extname(req.file.originalname)}`,
            size: req.file.size,
            mimetype: req.file.mimetype,
            uploadDate: new Date(),
            s3Key: uploadParams.Key
        });

        // Save metadata to file
        saveMetadata();
        console.log('Metadata saved');

        // Clean up local file
        fs.unlinkSync(req.file.path);
        console.log('Local file cleaned up');

        // Generate unique URL
        const uniqueUrl = `/listen/${fileId}`;
        
        console.log('Upload completed successfully');
        res.json({
            success: true,
            url: `https://${req.get('host')}${uniqueUrl}`,
            fileId: fileId
        });
    } catch (error) {
        console.error('Error in upload endpoint:', error);
        console.error('Error stack:', error.stack);
        res.status(500).json({ 
            error: 'Failed to upload file',
            details: error.message 
        });
    }
});

// Serve audio files
app.get('/audio/:fileId', async (req, res) => {
    const fileId = req.params.fileId;
    const metadata = fileMetadata.get(fileId);
    
    if (!metadata) {
        return res.status(404).json({ error: 'Audio file not found 1' });
    }

    try {
        // Get file from S3
        const getObjectParams = {
            Bucket: BUCKET_NAME,
            Key: metadata.s3Key || `audio/${metadata.filename}`
        };

        const command = new GetObjectCommand(getObjectParams);
        const response = await s3Client.send(command);

        // Set appropriate headers
        res.setHeader('Content-Type', metadata.mimetype);
        res.setHeader('Content-Disposition', `inline; filename="${metadata.originalName}"`);
        
        // Stream the file from S3
        response.Body.pipe(res);
    } catch (error) {
        console.error('Error serving audio from S3:', error);
        res.status(404).json({ error: 'Audio file not found 2' });
    }
});

// Listen page
app.get('/listen/:fileId', (req, res) => {
    const fileId = req.params.fileId;
    const metadata = fileMetadata.get(fileId);
    
    if (!metadata) {
        return res.status(404).send('Audio file not found 3');
    }

    // Serve a simple HTML page with audio player
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="icon" type="image/x-icon" href="/favicon.ico" />
    <title>Listening to - ${metadata.originalName}</title>
    <style>
      body {
          font-family: Arial, sans-serif;
          max-width: 600px;
          margin: 50px auto;
          padding: 20px;
          background-color: #f5f5f5;
      }
      .player-container {
          background: white;
          padding: 30px;
          border-radius: 10px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          text-align: center;
      }
      audio {
          width: 100%;
          margin: 20px 0;
      }
      .file-info {
          color: #666;
          font-size: 14px;
          margin-top: 20px;
      }
      .back-link {
          display: inline-block;
          margin-top: 20px;
          color: #007bff;
          text-decoration: none;
      }
      .back-link:hover {
          text-decoration: underline;
      }
  </style>
</head>
<script type="module" src="https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/vision_bundle.js" crossorigin="anonymous"></script>
<script defer src="/face-api.min.js"></script>
<script type="module" defer src="/listen.js"></script>
<link rel="stylesheet" href="/style.css" />
<body>
    <div id="message"></div>
    <div id="meditation-buttons"></div>
    <div
      style="font-size: 60px; position: absolute; z-index: 5; visibility: hidden;"
      id="title"
      class="pulse top-center"
    >
      W A I T
    </div>
    <video id="video" autoplay playsinline></video>
    <div
      style="font-size: 40px; position: absolute; bottom: 20px; z-index: 5"
      id="bottomNote"
      class="pulse bottom-center"
    ></div>
</body>
</html>
    `;
    
    res.send(html);
});

// Get file info endpoint
app.get('/info/:fileId', (req, res) => {
    const fileId = req.params.fileId;
    const metadata = fileMetadata.get(fileId);
    
    if (!metadata) {
        return res.status(404).json({ error: 'Audio file not found 4' });
    }
    
    res.json(metadata);
});

// Error handling middleware
app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'File too large. Maximum size is 50MB.' });
        }
    }
    res.status(500).json({ error: error.message });
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});