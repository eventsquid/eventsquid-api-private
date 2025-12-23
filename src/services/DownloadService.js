/**
 * Download Service
 * Migrated from Mantle DownloadService.js
 * 
 * Note: In Lambda, we can't use filesystem temp directories like the old Mantle app.
 * Files should be stored in S3 or generated on-the-fly.
 * For now, this implementation assumes files are in S3 or need to be generated.
 */

import { downloadS3ForLambda } from '../utils/s3.js';

class DownloadService {
  /**
   * Download file
   * In the old app, this reads from temp directory: ${CONSTANTS.tempDir}/${fileGUID}-${checkID}-${t}-${i}.${format}
   * In Lambda, we'll need to either:
   * 1. Store files in S3 and download from there
   * 2. Generate files on-the-fly
   * 3. Use a different storage mechanism
   */
  async downloadFile(request) {
    try {
      const { fileGUID, checkID } = request.pathParameters || {};
      const { t, i, format, name, e } = request.queryStringParameters || {};
      
      if (!fileGUID || !checkID) {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'text/plain',
            'Access-Control-Allow-Origin': '*'
          },
          body: 'Missing fileGUID or checkID'
        };
      }

      // Construct filename as it would be in the old system
      // Format: ${fileGUID}-${checkID}-${t}-${i}.${format}
      const fileName = `${fileGUID}-${checkID}-${t || ''}-${i || ''}.${format || 'xlsx'}`;
      
      // Try to download from S3 (assuming files are stored there)
      // The subfolder might be 'temp' or 'downloads' or similar
      try {
        const fileData = await downloadS3ForLambda(fileName, 'temp');
        const downloadName = name && e ? `${name} ${e}.${format || 'xlsx'}` : fileName;
        
        return {
          statusCode: 200,
          headers: {
            'Content-Type': fileData.type || 'application/octet-stream',
            'Content-Disposition': `attachment; filename="${downloadName}"`,
            'Access-Control-Allow-Origin': '*'
          },
          body: fileData.body,
          isBase64Encoded: fileData.isBase64Encoded
        };
      } catch (s3Error) {
        // If file not in S3, return error
        // In production, you might want to generate the file on-the-fly here
        console.error('File not found in S3:', s3Error);
        return {
          statusCode: 404,
          headers: {
            'Content-Type': 'text/plain',
            'Access-Control-Allow-Origin': '*'
          },
          body: 'File not found'
        };
      }
    } catch (error) {
      console.error('Error downloading file:', error);
      return {
        statusCode: 500,
        headers: {
          'Content-Type': 'text/plain',
          'Access-Control-Allow-Origin': '*'
        },
        body: 'Internal Server Error'
      };
    }
  }
}

export default new DownloadService();

