/**
 * Sponsors functions
 * Migrated from Mantle functions/sponsors
 */

import { getConnection, getDatabaseName, TYPES } from '../utils/mssql.js';
import { getEventResources } from './resources.js';

/**
 * Create sponsor
 */
export async function createSponsor(sponsor, vert) {
  try {
    const sql = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    const COLUMN_TYPES = {
      hostAffiliate_id: sql.Int,
      affiliate_name: sql.VarChar,
      affiliate_website: sql.VarChar,
      contact_name: sql.VarChar,
      defaultSponsorEmail: sql.VarChar,
      affiliate_phone: sql.VarChar,
      logos3: sql.VarChar
    };

    if (!sponsor.affiliate_name || !sponsor.affiliate_name.length) {
      return { success: false, message: 'Must provide a name' };
    }
    if (!sponsor.hostAffiliate_id || !sponsor.hostAffiliate_id) {
      return { success: false, message: 'Must provide an affiliate_id' };
    }

    const columns = Object.keys(sponsor).filter(key => key in COLUMN_TYPES);
    const values = columns.map(key => `@${key}`).join(', ');
    const columnNames = columns.join(', ');

    const request = new sql.Request();
    for (const key of columns) {
      request.input(key, COLUMN_TYPES[key], sponsor[key]);
    }

    const result = await request.query(`
      USE ${dbName};
      INSERT INTO b_sponsors (
          ${columnNames}
      )
      VALUES (
          ${values}
      );
      SELECT * FROM b_sponsors WHERE sponsorID = @@identity;
    `);
    const results = result.recordset;
    const newSponsor = results[0];

    return { success: true, sponsor: newSponsor };
  } catch (error) {
    console.error('Error creating sponsor:', error);
    throw error;
  }
}

/**
 * Update sponsor
 */
export async function updateSponsor(sponsorID, data, vert) {
  try {
    const sql = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    const COLUMN_TYPES = {
      affiliate_name: sql.VarChar,
      affiliate_website: sql.VarChar,
      contact_name: sql.VarChar,
      defaultSponsorEmail: sql.VarChar,
      affiliate_phone: sql.VarChar,
      logos3: sql.VarChar,
      logo: sql.VarChar
    };

    const updateFields = Object.keys(data)
      .filter(key => key in COLUMN_TYPES)
      .map(key => `${key} = @${key}`)
      .join(', ');

    if (!updateFields) {
      throw new Error('No valid columns to update');
    }

    const request = new sql.Request();
    request.input('sponsorID', sql.Int, Number(sponsorID));

    for (const key in data) {
      if (key in COLUMN_TYPES) {
        request.input(key, COLUMN_TYPES[key], data[key]);
      }
    }

    await request.query(`
      USE ${dbName};
      UPDATE b_sponsors
      SET ${updateFields}
      WHERE sponsorID = @sponsorID;
    `);

    return data;
  } catch (error) {
    console.error('Error updating sponsor:', error);
    throw error;
  }
}

/**
 * Get affiliate sponsors
 */
export async function getAffiliateSponsors(affiliateID, vert) {
  try {
    const sql = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    const request = new sql.Request();
    request.input('affiliateID', sql.Int, Number(affiliateID));
    const result = await request.query(`
      USE ${dbName};
      SELECT
          s.logo,
          s.logos3,
          s.affiliate_website,
          s.sponsorID,
          s.affiliate_name,
          s.affiliate_phone,
          s.defaultSponsorEmail
      FROM b_sponsors s
      WHERE s.hostAffiliate_id = @affiliateID
      ORDER BY s.affiliate_name
    `);
    const sponsors = result.recordset;

    return sponsors;
  } catch (error) {
    console.error('Error getting affiliate sponsors:', error);
    throw error;
  }
}

/**
 * Delete affiliate sponsor
 */
export async function deleteAffiliateSponsor(sponsorID, vert) {
  try {
    const sql = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    const request = new sql.Request();
    request.input('sponsorID', sql.Int, Number(sponsorID));
    await request.query(`
      USE ${dbName};
      DELETE FROM b_sponsors
      WHERE sponsorID = @sponsorID
    `);

    return { success: true };
  } catch (error) {
    console.error('Error deleting affiliate sponsor:', error);
    throw error;
  }
}

/**
 * Get event sponsors
 */
export async function getEventSponsors(eventID, vert) {
  try {
    const sql = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    const request1 = new sql.Request();
    request1.input('eventID', sql.Int, Number(eventID));
    const result1 = await request1.query(`
      USE ${dbName};
      SELECT
          s.logo,
          s.logos3,
          s.affiliate_website,
          s.sponsorID,
          s.affiliate_name,
          s.contact_name,
          s.affiliate_phone,
          s.defaultSponsorEmail,
          es.event_sponsor_id,
          es.level_id,
          es.sponsor_order,
          es.sponsorPromo,
          es.webLogoClickAction,
          es.veoLogoClickAction,
          es.veoDisplayOnRollup,
          es.veoShowNameUnderLogo,
          es.showOrgNameUnderLogo,
          es.logoDescriptionOrLabel,
          es.displayLogoGrayscale,
          es.hideOnOverview,
          es.showPhraseUnderLogo,
          es.liveMeetingLink,
          ISNULL(es.featureOnMobile, 0) featureOnMobile,
          ISNULL(es.hideOnOverview, 0) featureOnWeb,
          es.instantContactActive
      FROM event_sponsor es
      LEFT JOIN b_sponsors s on s.sponsorID = es.sponsorID
      WHERE es.event_id = @eventID
      AND es.sponsorID IS NOT NULL
      ORDER BY es.sponsor_order;
    `);
    const sponsors = result1.recordset;

    const request2 = new sql.Request();
    request2.input('eventID', sql.Int, Number(eventID));
    const result2 = await request2.query(`
      USE ${dbName};
      SELECT *
      FROM slotSponsor
      WHERE event_id = @eventID
    `);
    const slotAssignments = result2.recordset;

    const request3 = new sql.Request();
    request3.input('eventID', sql.Int, Number(eventID));
    const result3 = await request3.query(`
      USE ${dbName};
      SELECT *
      FROM sponsorLiveMeetingDates
      WHERE event_id = @eventID
    `);
    const liveMeetingDates = result3.recordset;

    // Get all event resources
    const resources = await getEventResources(Number(eventID), [], vert);

    return sponsors.map(sponsor => {
      sponsor['slots'] = slotAssignments
        .filter(slot => slot.sponsor_id === sponsor.sponsorID)
        .map(slot => slot.slot_id);
      sponsor['liveMeetings'] = liveMeetingDates
        .filter(meeting => meeting.event_sponsor_id === sponsor.event_sponsor_id);
      sponsor['resources'] = resources
        .filter(resource => resource.sponsorID === sponsor.sponsorID)
        .map(resource => ({
          title: resource.uploadTitle,
          docType: resource.uploadType,
          resourceType: resource.resource_type
        }));
      
      sponsor.webLogoClickAction = Number(sponsor.webLogoClickAction);
      sponsor.veoLogoClickAction = Number(sponsor.veoLogoClickAction);
      sponsor.veoDisplayOnRollup = Number(sponsor.veoDisplayOnRollup);
      sponsor.veoShowNameUnderLogo = Number(sponsor.veoShowNameUnderLogo);
      sponsor.showOrgNameUnderLogo = Number(sponsor.showOrgNameUnderLogo);
      sponsor.displayLogoGrayscale = Number(sponsor.displayLogoGrayscale);
      sponsor.featureOnMobile = Number(sponsor.featureOnMobile);
      sponsor.hideOnOverview = Number(sponsor.hideOnOverview);
      sponsor.showPhraseUnderLogo = Number(sponsor.showPhraseUnderLogo);
      
      return sponsor;
    });
  } catch (error) {
    console.error('Error getting event sponsors:', error);
    throw error;
  }
}

/**
 * Get event sponsor levels
 */
export async function getEventSponsorLevels(eventID, vert) {
  try {
    const sql = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    const request = new sql.Request();
    request.input('eventID', sql.Int, Number(eventID));
    const result = await request.query(`
      USE ${dbName};
      SELECT * FROM b_sponsorLevels 
      WHERE event_id = @eventID 
      ORDER BY level_order ASC, level_id DESC;
    `);
    const levels = result.recordset;

    return levels;
  } catch (error) {
    console.error('Error getting event sponsor levels:', error);
    throw error;
  }
}

/**
 * Create event sponsor level
 */
export async function createEventSponsorLevel(eventID, name, description = '', iconSize, iconsPerRow, vert) {
  try {
    const sql = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    if (!name) return { success: false, message: 'Must provide a name' };
    if (!iconSize) return { success: false, message: 'Must provide an iconSize' };
    if (!iconsPerRow) return { success: false, message: 'Must provide an iconsPerRow' };

    const request = new sql.Request();
    request.input('eventID', sql.Int, Number(eventID));
    request.input('name', sql.VarChar, name);
    request.input('description', sql.VarChar, description);
    request.input('iconSize', sql.Int, Number(iconSize));
    request.input('iconsPerRow', sql.Int, Number(iconsPerRow));
    const result = await request.query(`
      USE ${dbName};
      INSERT INTO b_sponsorLevels (
          event_id,
          level_name,
          level_description,
          iconSize,
          iconsPerRow
      ) VALUES (
          @eventID,
          @name,
          @description,
          @iconSize,
          @iconsPerRow
      );
      SELECT * FROM b_sponsorLevels WHERE level_id = @@identity;
    `);
    const results = result.recordset;

    return { success: true, level: results.length ? results[0] : {} };
  } catch (error) {
    console.error('Error creating event sponsor level:', error);
    throw error;
  }
}

/**
 * Update sponsor level
 */
export async function updateSponsorLevel(levelID, data, vert) {
  try {
    const sql = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    const COLUMN_TYPES = {
      level_name: sql.VarChar,
      level_description: sql.VarChar,
      iconsPerRow: sql.Int,
      iconSize: sql.Int
    };

    const updateFields = Object.keys(data)
      .filter(key => key in COLUMN_TYPES)
      .map(key => `${key} = @${key}`)
      .join(', ');

    if (!updateFields) {
      throw new Error('No valid columns to update');
    }

    const request = new sql.Request();
    request.input('levelID', sql.Int, Number(levelID));

    for (const key in data) {
      if (key in COLUMN_TYPES) {
        request.input(key, COLUMN_TYPES[key], data[key]);
      }
    }

    await request.query(`
      USE ${dbName};
      UPDATE b_sponsorLevels
      SET ${updateFields}
      WHERE level_id = @levelID
    `);
    return { success: true };
  } catch (error) {
    console.error('Error updating sponsor level:', error);
    throw error;
  }
}

/**
 * Delete event sponsor level
 */
export async function deleteEventSponsorLevel(levelID, vert) {
  try {
    const sql = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    const request = new sql.Request();
    request.input('levelID', sql.Int, Number(levelID));
    await request.query(`
      USE ${dbName};
      DELETE FROM b_sponsorLevels WHERE level_id = @levelID;
      DELETE FROM event_sponsor WHERE level_id = @levelID;
    `);

    return { success: true };
  } catch (error) {
    console.error('Error deleting event sponsor level:', error);
    throw error;
  }
}

/**
 * Move event sponsor level
 */
export async function moveEventSponsorLevel(eventID, levelID, sortOrder, vert) {
  try {
    const sql = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    const request = new sql.Request();
    request.input('eventID', sql.Int, Number(eventID));
    request.input('levelID', sql.Int, Number(levelID));
    request.input('sortOrder', sql.Int, Number(sortOrder));
    await request.query(`
      USE ${dbName};
      EXEC dbo.node_moveSponsorLevel
          @eventID,
          @levelID,
          @sortOrder
    `);

    return { success: true };
  } catch (error) {
    console.error('Error moving event sponsor level:', error);
    throw error;
  }
}

/**
 * Move event sponsor
 */
export async function moveEventSponsor(eventID, sponsorID, levelID, sortOrder, vert) {
  try {
    const sql = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    const request = new sql.Request();
    request.input('eventID', sql.Int, Number(eventID));
    request.input('sponsorID', sql.Int, Number(sponsorID));
    request.input('levelID', sql.Int, Number(levelID));
    request.input('sortOrder', sql.Int, Number(sortOrder));
    await request.query(`
      USE ${dbName};
      EXEC dbo.node_moveEventSponsor
          @eventID,
          @sponsorID,
          @levelID,
          @sortOrder
    `);

    return { success: true };
  } catch (error) {
    console.error('Error moving event sponsor:', error);
    throw error;
  }
}

/**
 * Add sponsor to level
 */
export async function addSponsorToLevel(sponsorID, levelID, affiliateID, vert) {
  try {
    const sql = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    const request = new sql.Request();
    request.input('sponsorID', sql.Int, Number(sponsorID));
    request.input('levelID', sql.Int, Number(levelID));
    request.input('affiliateID', sql.Int, Number(affiliateID));
    const result = await request.query(`
      USE ${dbName};
      INSERT INTO event_sponsor (
          sponsorID,
          level_id,
          event_id,
          hostAffiliateID
      ) VALUES (
          @sponsorID,
          @levelID,
          (
              SELECT event_id FROM b_sponsorLevels WHERE level_id = @levelID
          ),
          @affiliateID
      );
      SELECT * FROM event_sponsor WHERE event_sponsor_id = @@identity;
    `);
    const results = result.recordset;

    return results[0];
  } catch (error) {
    console.error('Error adding sponsor to level:', error);
    throw error;
  }
}

/**
 * Remove sponsor from level
 */
export async function removeSponsorFromLevel(levelID, sponsorID, vert) {
  try {
    const sql = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    const request = new sql.Request();
    request.input('levelID', sql.Int, Number(levelID));
    request.input('sponsorID', sql.Int, Number(sponsorID));
    await request.query(`
      USE ${dbName};
      DELETE FROM event_sponsor WHERE level_id = @levelID AND sponsorID = @sponsorID;
    `);

    return { success: true };
  } catch (error) {
    console.error('Error removing sponsor from level:', error);
    throw error;
  }
}

/**
 * Update event sponsor
 */
export async function updateEventSponsor(sponsorID, levelID, data, vert) {
  try {
    const sql = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    const COLUMN_TYPES = {
      sponsorPromo: sql.VarChar,
      hideOnOverview: sql.Int,
      featureOnMobile: sql.Int,
      showOrgNameUnderLogo: sql.Bit,
      logoDescriptionOrLabel: sql.VarChar,
      webLogoClickAction: sql.TinyInt,
      veoLogoClickAction: sql.TinyInt,
      veoDisplayOnRollup: sql.Bit,
      veoShowNameUnderLogo: sql.Bit,
      displayLogoGrayscale: sql.Bit,
      showPhraseUnderLogo: sql.Bit,
      instantContactActive: sql.Int,
      liveMeetingLink: sql.VarChar
    };

    const updateFields = Object.keys(data)
      .filter(key => key in COLUMN_TYPES)
      .map(key => `${key} = @${key}`)
      .join(', ');

    if (!updateFields) {
      throw new Error('No valid columns to update');
    }

    const request = new sql.Request();
    request.input('sponsorID', sql.Int, Number(sponsorID));
    request.input('levelID', sql.Int, Number(levelID));

    for (const key in data) {
      if (key in COLUMN_TYPES) {
        request.input(key, COLUMN_TYPES[key], data[key]);
      }
    }

    await request.query(`
      USE ${dbName};
      UPDATE event_sponsor
      SET ${updateFields}
      WHERE sponsorID = @sponsorID
          AND level_id = @levelID;
    `);
    return data;
  } catch (error) {
    console.error('Error updating event sponsor:', error);
    throw error;
  }
}

/**
 * Add live meeting
 */
export async function addLiveMeeting(eventID, sponsorID, meetings, vert) {
  try {
    const sql = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    let qryStr = `USE ${dbName};`;
    for (let i = 0; i < meetings.length; i++) {
      qryStr += `
        INSERT INTO sponsorLiveMeetingDates (
            event_id,
            event_sponsor_id,
            startDateLocal,
            endDateLocal,
            startDateUTC,
            endDateUTC
        )
        OUTPUT 
            inserted.meeting_id, 
            inserted.startDateLocal,
            inserted.endDateLocal,
            inserted.startDateUTC,
            inserted.endDateUTC
        VALUES (
            @eventID${i},
            @sponsorID${i},
            @startDateLocal${i},
            @endDateLocal${i},
            @startDateUTC${i},
            @endDateUTC${i}
        );`;
    }

    const request = new sql.Request();
    
    meetings.forEach((meeting, index) => {
      request.input(`eventID${index}`, sql.Int, Number(eventID));
      request.input(`sponsorID${index}`, sql.Int, Number(sponsorID));
      request.input(`startDateLocal${index}`, sql.VarChar, meeting.startDateLocal);
      request.input(`endDateLocal${index}`, sql.VarChar, meeting.endDateLocal);
      request.input(`startDateUTC${index}`, sql.DateTime, new Date(meeting.startDateUTC));
      request.input(`endDateUTC${index}`, sql.DateTime, new Date(meeting.endDateUTC));
    });

    const result = await request.query(qryStr);
    const results = result.recordset;
    return results;
  } catch (error) {
    console.error('Error adding live meeting:', error);
    throw error;
  }
}

/**
 * Delete live meeting
 */
export async function deleteLiveMeeting(meetingID, vert) {
  try {
    const sql = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    const request = new sql.Request();
    request.input('meetingID', sql.Int, Number(meetingID));
    await request.query(`
      USE ${dbName};
      DELETE FROM sponsorLiveMeetingDates WHERE meeting_id = @meetingID;
    `);

    return { success: true };
  } catch (error) {
    console.error('Error deleting live meeting:', error);
    throw error;
  }
}

