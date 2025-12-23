/**
 * QR Service
 * Migrated from Mantle QRService.js
 */

import { getDatabase } from '../utils/mongodb.js';
import qr from 'qr-image';

// Domain names by vertical (from old CONSTANTS._dm)
const DOMAINS_BY_VERTICAL = {
  cn: 'https://www.connectmeetings.events',
  es: 'https://www.eventsquid.com',
  fd: 'https://www.rcnation.com',
  ft: 'https://www.fitsquid.com',
  ir: 'https://inreachce.events',
  kt: 'https://app.mykindercamps.com',
  ln: 'https://www.launchsquid.com'
};

class QRService {
  /**
   * Generate mobile attendee QR code
   */
  async generateMobileAttendeeQR(request) {
    const { attendeeGUID } = request.pathParameters || {};
    const vert = request.headers?.['vert'] || request.headers?.['Vert'] || request.headers?.['VERT'];
    
    if (!vert || !attendeeGUID) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'text/plain',
          'Access-Control-Allow-Origin': '*'
        },
        body: 'Bad QR Request'
      };
    }

    try {
      const db = await getDatabase(null, vert);
      const attendeesCollection = db.collection('attendees');

      // Get the contestant ID and event ID for this attendee
      const attendee = await attendeesCollection.findOne(
        { cg: String(attendeeGUID) },
        { projection: { _id: 0, c: 1, e: 1 } }
      );

      if (!attendee) {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'text/plain',
            'Access-Control-Allow-Origin': '*'
          },
          body: 'Bad QR Request'
        };
      }

      // Generate QR code URL
      const domain = DOMAINS_BY_VERTICAL[vert.toLowerCase()] || DOMAINS_BY_VERTICAL.es;
      const qrUrl = `${domain}/mobileAttendeeQR.cfm?cid=${attendee.c}&eid=${attendee.e}`;

      // Generate QR code image
      const qrCode = qr.image(qrUrl, { type: 'png' });
      
      // Convert stream to buffer, then to base64
      const chunks = [];
      for await (const chunk of qrCode) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);
      const base64Image = buffer.toString('base64');

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'image/png',
          'Access-Control-Allow-Origin': '*'
        },
        body: base64Image,
        isBase64Encoded: true
      };
    } catch (error) {
      console.error('Error generating mobile attendee QR:', error);
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

  /**
   * Generate mobile spectator QR code
   */
  async generateMobileSpecQR(request) {
    const { orderGUID } = request.pathParameters || {};
    const vert = request.headers?.['vert'] || request.headers?.['Vert'] || request.headers?.['VERT'];
    
    if (!vert || !orderGUID) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'text/plain',
          'Access-Control-Allow-Origin': '*'
        },
        body: 'Bad QR Request'
      };
    }

    try {
      const db = await getDatabase(null, vert);
      const ticketsCollection = db.collection('tickets');

      // Get the ticket information
      const ticket = await ticketsCollection.findOne(
        { og: String(orderGUID) },
        { projection: { _id: 0, spi: 1, e: 1, oi: 1 } }
      );

      if (!ticket) {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'text/plain',
            'Access-Control-Allow-Origin': '*'
          },
          body: 'Bad QR Request'
        };
      }

      // Generate QR code URL
      const domain = DOMAINS_BY_VERTICAL[vert.toLowerCase()] || DOMAINS_BY_VERTICAL.es;
      const qrUrl = `${domain}/mobileSpecQR.cfm?sid=${ticket.spi}&eid=${ticket.e}&esid=${ticket.oi}`;

      // Generate QR code image
      const qrCode = qr.image(qrUrl, { type: 'png' });
      
      // Convert stream to buffer, then to base64
      const chunks = [];
      for await (const chunk of qrCode) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);
      const base64Image = buffer.toString('base64');

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'image/png',
          'Access-Control-Allow-Origin': '*'
        },
        body: base64Image,
        isBase64Encoded: true
      };
    } catch (error) {
      console.error('Error generating mobile spec QR:', error);
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

  /**
   * Generate check-in spectator QR code
   */
  async generateCheckinSpecQR(request) {
    const { orderGUID, ticketItemGUID } = request.pathParameters || {};
    const vert = request.headers?.['vert'] || request.headers?.['Vert'] || request.headers?.['VERT'];
    
    if (!vert || !orderGUID || !ticketItemGUID) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'text/plain',
          'Access-Control-Allow-Origin': '*'
        },
        body: 'Bad QR Request'
      };
    }

    try {
      const db = await getDatabase(null, vert);
      const ticketsCollection = db.collection('tickets');

      // Get the ticket information
      const ticket = await ticketsCollection.findOne(
        { og: String(orderGUID) },
        { projection: { _id: 0, spi: 1, e: 1, oi: 1, feet: 1 } }
      );

      if (!ticket) {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'text/plain',
            'Access-Control-Allow-Origin': '*'
          },
          body: 'Bad QR Request'
        };
      }

      // Find matching ticket item
      const matchingTicket = ticket.feet?.find(t => t.tg === ticketItemGUID);

      if (!matchingTicket) {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'text/plain',
            'Access-Control-Allow-Origin': '*'
          },
          body: 'Bad QR Request: No Matching Ticket'
        };
      }

      // Generate QR code URL
      const domain = DOMAINS_BY_VERTICAL[vert.toLowerCase()] || DOMAINS_BY_VERTICAL.es;
      const qrUrl = `${domain}/checkin-spectator.cfm?sid=${ticket.spi}&eid=${ticket.e}&esid=${ticket.oi}&tg=${ticketItemGUID}`;

      // Generate QR code image
      const qrCode = qr.image(qrUrl, { type: 'png' });
      
      // Convert stream to buffer, then to base64
      const chunks = [];
      for await (const chunk of qrCode) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);
      const base64Image = buffer.toString('base64');

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'image/png',
          'Access-Control-Allow-Origin': '*'
        },
        body: base64Image,
        isBase64Encoded: true
      };
    } catch (error) {
      console.error('Error generating checkin spec QR:', error);
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

export default new QRService();

