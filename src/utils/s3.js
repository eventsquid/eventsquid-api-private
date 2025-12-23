/**
 * S3 utility for file operations
 * Handles uploads, downloads, deletes, copies, and presigned URLs
 * Migrated from Mantle functions/uploads
 */

import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, CopyObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';

// S3 clients for public and private buckets
const s3PublicClient = new S3Client({ 
  region: process.env.AWS_REGION || 'us-west-2' 
});

const s3PrivateClient = new S3Client({ 
  region: process.env.AWS_REGION || 'us-west-2' 
});

// Bucket names
const PUBLIC_BUCKET = process.env.S3_PUBLIC_BUCKET || 'eventsquid';
const PRIVATE_BUCKET = process.env.S3_PRIVATE_BUCKET || 'eventsquid-private';
const S3_BASE_URL = process.env.S3_BASE_URL || 'https://s3-us-west-2.amazonaws.com/eventsquid/';

/**
 * Upload a file to S3
 * @param {string|Buffer} data - File data (base64 string or Buffer)
 * @param {string} subFolder - Subfolder path (e.g., 's3domain' or 'resources')
 * @param {string} ext - File extension (e.g., 'png', 'pdf')
 * @param {string} contentType - MIME type (e.g., 'image/png', 'application/pdf')
 * @param {string} name - Optional custom filename (if not provided, generates UUID)
 * @param {boolean} isPrivate - Whether to use private bucket (default: false)
 * @returns {Promise<{name: string, url: string, eTag: string}>}
 */
export async function uploadS3(data, subFolder = '', ext, contentType, name = '', isPrivate = false) {
  try {
    const fileName = name.length ? name : `${uuidv4()}.${ext}`;
    const subFolderPath = subFolder.length ? `${subFolder}/` : '';
    const key = `${subFolderPath}${fileName}`;
    const bucket = isPrivate ? PRIVATE_BUCKET : PUBLIC_BUCKET;
    const client = isPrivate ? s3PrivateClient : s3PublicClient;

    // Convert base64 string to Buffer if needed
    let body;
    if (typeof data === 'string') {
      // Remove data URI prefix if present (e.g., "data:image/png;base64,")
      const base64Data = data.replace(/^data:.+;base64,/, '');
      body = Buffer.from(base64Data, 'base64');
    } else if (Buffer.isBuffer(data)) {
      body = data;
    } else {
      throw new Error('Invalid data type. Expected string or Buffer.');
    }

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      ContentEncoding: 'base64'
    });

    const response = await client.send(command);
    
    // Construct URL
    const url = isPrivate 
      ? await getPresignedUrl(key, isPrivate)
      : `${S3_BASE_URL}${key}`;

    return {
      name: fileName,
      url: url,
      eTag: response.ETag,
      key: key
    };
  } catch (error) {
    console.error('Error uploading to S3:', error);
    throw new Error(`Failed to upload file to S3: ${error.message}`);
  }
}

/**
 * Download a file from S3
 * @param {string} name - Filename
 * @param {string} subFolder - Subfolder path
 * @param {boolean} isPrivate - Whether to use private bucket (default: false)
 * @returns {Promise<{type: string, data: string}>} - Returns base64 encoded file data
 */
export async function downloadS3(name, subFolder = '', isPrivate = false) {
  try {
    const subFolderPath = subFolder.length ? `${subFolder}/` : '';
    const key = `${subFolderPath}${name}`;
    const bucket = isPrivate ? PRIVATE_BUCKET : PUBLIC_BUCKET;
    const client = isPrivate ? s3PrivateClient : s3PublicClient;

    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key
    });

    const response = await client.send(command);
    
    // Convert stream to buffer, then to base64
    const chunks = [];
    for await (const chunk of response.Body) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    const base64Data = buffer.toString('base64');

    return {
      type: response.ContentType || 'application/octet-stream',
      data: base64Data,
      size: response.ContentLength
    };
  } catch (error) {
    console.error('Error downloading from S3:', error);
    throw new Error(`Failed to download file from S3: ${error.message}`);
  }
}

/**
 * Download a file from S3 as a stream (for Lambda responses)
 * @param {string} name - Filename
 * @param {string} subFolder - Subfolder path
 * @param {boolean} isPrivate - Whether to use private bucket (default: false)
 * @returns {Promise<{type: string, body: string, isBase64Encoded: boolean}>} - Returns base64 encoded body for Lambda
 */
export async function downloadS3ForLambda(name, subFolder = '', isPrivate = false) {
  try {
    const fileData = await downloadS3(name, subFolder, isPrivate);
    
    return {
      type: fileData.type,
      body: fileData.data,
      isBase64Encoded: true,
      size: fileData.size
    };
  } catch (error) {
    console.error('Error downloading from S3 for Lambda:', error);
    throw error;
  }
}

/**
 * Delete a file from S3
 * @param {string} name - Filename
 * @param {string} subFolder - Subfolder path
 * @param {boolean} isPrivate - Whether to use private bucket (default: false)
 * @returns {Promise<void>}
 */
export async function deleteS3(name, subFolder = '', isPrivate = false) {
  try {
    const subFolderPath = subFolder.length ? `${subFolder}/` : '';
    const key = `${subFolderPath}${name}`;
    const bucket = isPrivate ? PRIVATE_BUCKET : PUBLIC_BUCKET;
    const client = isPrivate ? s3PrivateClient : s3PublicClient;

    const command = new DeleteObjectCommand({
      Bucket: bucket,
      Key: key
    });

    await client.send(command);
    return { success: true };
  } catch (error) {
    console.error('Error deleting from S3:', error);
    throw new Error(`Failed to delete file from S3: ${error.message}`);
  }
}

/**
 * Copy a file within S3
 * @param {string} sourceName - Source filename
 * @param {string} subFolder - Subfolder path
 * @param {boolean} isPrivate - Whether to use private bucket (default: false)
 * @returns {Promise<{name: string, url: string}>}
 */
export async function copyS3(sourceName, subFolder = '', isPrivate = false) {
  try {
    const subFolderPath = subFolder.length ? `${subFolder}/` : '';
    const sourceKey = `${subFolderPath}${sourceName}`;
    const bucket = isPrivate ? PRIVATE_BUCKET : PUBLIC_BUCKET;
    const client = isPrivate ? s3PrivateClient : s3PublicClient;

    // Generate new filename with UUID
    const ext = sourceName.split('.').pop();
    const newName = `${uuidv4()}.${ext}`;
    const destKey = `${subFolderPath}${newName}`;

    const command = new CopyObjectCommand({
      Bucket: bucket,
      CopySource: `/${bucket}/${sourceKey}`,
      Key: destKey
    });

    await client.send(command);

    // Construct URL
    const url = isPrivate 
      ? await getPresignedUrl(destKey, isPrivate)
      : `${S3_BASE_URL}${destKey}`;

    return {
      name: newName,
      url: url
    };
  } catch (error) {
    console.error('Error copying in S3:', error);
    throw new Error(`Failed to copy file in S3: ${error.message}`);
  }
}

/**
 * Get presigned URL for private bucket access
 * @param {string} key - S3 object key
 * @param {boolean} isPrivate - Whether to use private bucket (default: false)
 * @param {number} expiresIn - URL expiration in seconds (default: 3600 = 1 hour)
 * @returns {Promise<string>}
 */
export async function getPresignedUrl(key, isPrivate = false, expiresIn = 3600) {
  try {
    const bucket = isPrivate ? PRIVATE_BUCKET : PUBLIC_BUCKET;
    const client = isPrivate ? s3PrivateClient : s3PublicClient;

    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key
    });

    const url = await getSignedUrl(client, command, { expiresIn });
    return url;
  } catch (error) {
    console.error('Error generating presigned URL:', error);
    throw new Error(`Failed to generate presigned URL: ${error.message}`);
  }
}

/**
 * Check if a file exists in S3
 * @param {string} name - Filename
 * @param {string} subFolder - Subfolder path
 * @param {boolean} isPrivate - Whether to use private bucket (default: false)
 * @returns {Promise<boolean>}
 */
export async function fileExists(name, subFolder = '', isPrivate = false) {
  try {
    const subFolderPath = subFolder.length ? `${subFolder}/` : '';
    const key = `${subFolderPath}${name}`;
    const bucket = isPrivate ? PRIVATE_BUCKET : PUBLIC_BUCKET;
    const client = isPrivate ? s3PrivateClient : s3PublicClient;

    const command = new HeadObjectCommand({
      Bucket: bucket,
      Key: key
    });

    await client.send(command);
    return true;
  } catch (error) {
    if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
      return false;
    }
    throw error;
  }
}

/**
 * Get file metadata from S3
 * @param {string} name - Filename
 * @param {string} subFolder - Subfolder path
 * @param {boolean} isPrivate - Whether to use private bucket (default: false)
 * @returns {Promise<{contentType: string, contentLength: number, lastModified: Date, eTag: string}>}
 */
export async function getFileMetadata(name, subFolder = '', isPrivate = false) {
  try {
    const subFolderPath = subFolder.length ? `${subFolder}/` : '';
    const key = `${subFolderPath}${name}`;
    const bucket = isPrivate ? PRIVATE_BUCKET : PUBLIC_BUCKET;
    const client = isPrivate ? s3PrivateClient : s3PublicClient;

    const command = new HeadObjectCommand({
      Bucket: bucket,
      Key: key
    });

    const response = await client.send(command);
    
    return {
      contentType: response.ContentType,
      contentLength: response.ContentLength,
      lastModified: response.LastModified,
      eTag: response.ETag
    };
  } catch (error) {
    console.error('Error getting file metadata:', error);
    throw new Error(`Failed to get file metadata: ${error.message}`);
  }
}

