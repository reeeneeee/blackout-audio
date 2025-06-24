require('dotenv').config();
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');

console.log('Testing S3 Bucket Permissions...\n');

const s3Client = new S3Client({
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    }
});

const BUCKET_NAME = process.env.S3_BUCKET_NAME;

async function testBucketPermissions() {
    try {
        console.log(`Testing permissions for bucket: ${BUCKET_NAME}\n`);

        // Test 1: Try to upload a small test file
        console.log('Test 1: Testing upload permission...');
        const testKey = 'test-permissions.txt';
        const testContent = 'This is a test file to check permissions';
        
        const uploadParams = {
            Bucket: BUCKET_NAME,
            Key: testKey,
            Body: testContent,
            ContentType: 'text/plain'
        };

        await s3Client.send(new PutObjectCommand(uploadParams));
        console.log('✓ Upload permission: OK');
        console.log('');

        // Test 2: Try to read the test file
        console.log('Test 2: Testing read permission...');
        const getParams = {
            Bucket: BUCKET_NAME,
            Key: testKey
        };

        const getResponse = await s3Client.send(new GetObjectCommand(getParams));
        const bodyContents = await getResponse.Body.transformToString();
        console.log('✓ Read permission: OK');
        console.log('');

        // Test 3: Try to delete the test file
        console.log('Test 3: Testing delete permission...');
        const deleteParams = {
            Bucket: BUCKET_NAME,
            Key: testKey
        };

        await s3Client.send(new DeleteObjectCommand(deleteParams));
        console.log('✓ Delete permission: OK');
        console.log('');

        console.log('🎉 All bucket permissions are working correctly!');
        console.log('Your S3 configuration should work with the upload endpoint.');
        
    } catch (error) {
        console.error('✗ Permission test failed:', error.message);
        console.error('Error name:', error.name);
        
        if (error.name === 'AccessDenied') {
            console.log('\n💡 Your IAM user lacks the necessary S3 permissions.');
            console.log('Required permissions:');
            console.log('- s3:PutObject');
            console.log('- s3:GetObject');
            console.log('- s3:DeleteObject');
            console.log('\nYou can add these permissions by:');
            console.log('1. Going to AWS IAM Console');
            console.log('2. Finding your user');
            console.log('3. Adding the "AmazonS3FullAccess" policy (or create a custom one)');
        } else if (error.name === 'NoSuchBucket') {
            console.log('\n💡 The bucket does not exist or you cannot access it.');
        } else {
            console.log('\n💡 This might be a network or configuration issue.');
        }
    }
}

testBucketPermissions(); 