const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

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
app.post('/upload', upload.single('audio'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No audio file uploaded' });
    }

    // Store metadata
    const fileId = path.parse(req.file.filename).name;
    fileMetadata.set(fileId, {
        originalName: req.file.originalname,
        filename: req.file.filename,
        size: req.file.size,
        mimetype: req.file.mimetype,
        uploadDate: new Date()
    });

    // Save metadata to file
    saveMetadata();

    // Generate unique URL
    const uniqueUrl = `/listen/${fileId}`;
    
    res.json({
        success: true,
        url: `${req.protocol}://${req.get('host')}${uniqueUrl}`,
        fileId: fileId
    });
});

// Serve audio files
app.get('/audio/:fileId', (req, res) => {
    const fileId = req.params.fileId;
    const metadata = fileMetadata.get(fileId);
    
    if (!metadata) {
        return res.status(404).json({ error: 'Audio file not found 1' });
    }

    const filePath = path.join(uploadsDir, metadata.filename);
    
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Audio file not found 2' });
    }

    // Set appropriate headers
    res.setHeader('Content-Type', metadata.mimetype);
    res.setHeader('Content-Disposition', `inline; filename="${metadata.originalName}"`);
    
    // Stream the file
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
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