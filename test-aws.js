require('dotenv').config();
const { S3Client, ListBucketsCommand, HeadBucketCommand } = require('@aws-sdk/client-s3');

console.log('Testing AWS S3 Configuration...\n');

// Check environment variables
console.log('Environment Variables:');
console.log('AWS_REGION:', process.env.AWS_REGION || 'not set');
console.log('S3_BUCKET_NAME:', process.env.S3_BUCKET_NAME || 'not set');
console.log('AWS_ACCESS_KEY_ID:', process.env.AWS_ACCESS_KEY_ID ? 'set' : 'not set');
console.log('AWS_SECRET_ACCESS_KEY:', process.env.AWS_SECRET_ACCESS_KEY ? 'set' : 'not set');
console.log('');

// Create S3 client
const s3Client = new S3Client({
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    }
});

async function testAWS() {
    try {
        // Test 1: List buckets (tests credentials)
        console.log('Test 1: Testing credentials by listing buckets...');
        const listCommand = new ListBucketsCommand({});
        const listResponse = await s3Client.send(listCommand);
        console.log('✓ Credentials are valid');
        console.log('Available buckets:', listResponse.Buckets.map(b => b.Name));
        console.log('');

        // Test 2: Check if our bucket exists
        console.log('Test 2: Checking if bucket exists...');
        const bucketName = process.env.S3_BUCKET_NAME;
        if (!bucketName) {
            console.log('✗ S3_BUCKET_NAME not set in environment variables');
            return;
        }

        const headCommand = new HeadBucketCommand({ Bucket: bucketName });
        await s3Client.send(headCommand);
        console.log(`✓ Bucket "${bucketName}" exists and is accessible`);
        console.log('');

        console.log('🎉 All tests passed! Your AWS S3 configuration is working correctly.');
        
    } catch (error) {
        console.error('✗ Test failed:', error.message);
        
        if (error.name === 'InvalidAccessKeyId') {
            console.log('💡 This usually means your AWS Access Key ID is incorrect');
        } else if (error.name === 'SignatureDoesNotMatch') {
            console.log('💡 This usually means your AWS Secret Access Key is incorrect');
        } else if (error.name === 'NoSuchBucket') {
            console.log('💡 The bucket does not exist. You need to create it first.');
        } else if (error.name === 'AccessDenied') {
            console.log('💡 Your IAM user does not have permission to access S3');
        }
        
        console.log('\nTroubleshooting steps:');
        console.log('1. Verify your AWS credentials in the .env file');
        console.log('2. Make sure the S3 bucket "panoptic-audio" exists');
        console.log('3. Ensure your IAM user has S3 permissions');
        console.log('4. Check if your AWS account is active');
    }
}

testAWS(); 