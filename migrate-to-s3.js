require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

// AWS S3 Configuration
const s3Client = new S3Client({
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    }
});

const BUCKET_NAME = process.env.S3_BUCKET_NAME || 'your-audio-bucket-name';
const uploadsDir = './uploads';

async function migrateFilesToS3() {
    console.log('Starting migration to S3...');
    
    if (!fs.existsSync(uploadsDir)) {
        console.log('No uploads directory found. Nothing to migrate.');
        return;
    }

    const files = fs.readdirSync(uploadsDir);
    console.log(`Found ${files.length} files to migrate`);

    for (const filename of files) {
        try {
            const filePath = path.join(uploadsDir, filename);
            const fileContent = fs.readFileSync(filePath);
            const fileId = path.parse(filename).name;
            const extension = path.extname(filename);

            const uploadParams = {
                Bucket: BUCKET_NAME,
                Key: `audio/${fileId}${extension}`,
                Body: fileContent,
                ContentType: 'audio/mpeg', // Adjust based on your file types
                Metadata: {
                    originalName: filename,
                    uploadDate: new Date().toISOString(),
                    migrated: 'true'
                }
            };

            await s3Client.send(new PutObjectCommand(uploadParams));
            console.log(`✓ Migrated: ${filename}`);
        } catch (error) {
            console.error(`✗ Failed to migrate ${filename}:`, error.message);
        }
    }

    console.log('Migration completed!');
}

// Run migration if this script is executed directly
if (require.main === module) {
    migrateFilesToS3().catch(console.error);
}

module.exports = { migrateFilesToS3 }; 