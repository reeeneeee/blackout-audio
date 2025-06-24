require('dotenv').config();
const { S3Client, HeadBucketCommand } = require('@aws-sdk/client-s3');

console.log('Finding the correct region for your S3 bucket...\n');

const BUCKET_NAME = process.env.S3_BUCKET_NAME;
const regions = [
    'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2',
    'af-south-1', 'ap-east-1', 'ap-south-1', 'ap-northeast-1',
    'ap-northeast-2', 'ap-northeast-3', 'ap-southeast-1', 'ap-southeast-2',
    'ca-central-1', 'eu-central-1', 'eu-west-1', 'eu-west-2',
    'eu-west-3', 'eu-north-1', 'eu-south-1', 'me-south-1',
    'sa-east-1'
];

async function findBucketRegion() {
    console.log(`Searching for bucket: ${BUCKET_NAME}\n`);
    
    for (const region of regions) {
        try {
            console.log(`Trying region: ${region}...`);
            
            const s3Client = new S3Client({
                region: region,
                credentials: {
                    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
                }
            });

            const command = new HeadBucketCommand({ Bucket: BUCKET_NAME });
            await s3Client.send(command);
            
            console.log(`\n🎉 Found bucket in region: ${region}`);
            console.log(`\nUpdate your .env file with:`);
            console.log(`AWS_REGION=${region}`);
            
            return region;
            
        } catch (error) {
            if (error.name === 'PermanentRedirect') {
                // This means the bucket exists in a different region
                continue;
            } else if (error.name === 'NoSuchBucket') {
                console.log(`  ✗ Bucket not found in ${region}`);
                continue;
            } else {
                console.log(`  ✗ Error in ${region}: ${error.name}`);
                continue;
            }
        }
    }
    
    console.log('\n❌ Could not find the bucket in any common region.');
    console.log('Please check:');
    console.log('1. The bucket name is correct');
    console.log('2. The bucket exists in your AWS account');
    console.log('3. Your credentials have access to the bucket');
}

findBucketRegion(); 