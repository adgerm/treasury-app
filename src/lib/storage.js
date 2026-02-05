const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || 'us-east-1',
});

const BUCKET = process.env.AWS_S3_BUCKET;
const PRESIGN_EXPIRY = 60 * 60 * 24 * 7; // 7 days

/**
 * Upload file to S3 and return presigned GET URL and key.
 * @param {Express.Multer.File} file
 * @param {string} keyPrefix - e.g. 'receipts' or 'chat-attachments'
 * @returns {{ url: string, key: string }}
 */
async function uploadToS3(file, keyPrefix = 'uploads') {
  if (!BUCKET) throw new Error('AWS_S3_BUCKET not configured');
  const ext = (file.originalname && file.originalname.split('.').pop()) || 'bin';
  const key = `${keyPrefix}/${uuidv4()}.${ext}`;
  await s3.putObject({
    Bucket: BUCKET,
    Key: key,
    Body: file.buffer,
    ContentType: file.mimetype || 'application/octet-stream',
  }).promise();
  const url = s3.getSignedUrl('getObject', {
    Bucket: BUCKET,
    Key: key,
    Expires: PRESIGN_EXPIRY,
  });
  return { url, key };
}

/**
 * Get a fresh presigned URL for an existing key (e.g. for Sheets refresh).
 */
function getPresignedUrl(key) {
  return s3.getSignedUrl('getObject', {
    Bucket: BUCKET,
    Key: key,
    Expires: PRESIGN_EXPIRY,
  });
}

module.exports = { uploadToS3, getPresignedUrl };
