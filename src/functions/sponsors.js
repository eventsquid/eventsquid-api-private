/**
 * Sponsors functions
 * Migrated from Mantle functions/sponsors
 */

import { getConnection, getDatabaseName, TYPES } from '../utils/mssql.js';

/**
 * Create sponsor
 */
export async function createSponsor(sponsor, vert) {
  try {
    const connection = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    const COLUMN_TYPES = {
      hostAffiliate_id: TYPES.Int,
      affiliate_name: TYPES.VarChar,
      affiliate_website: TYPES.VarChar,
      contact_name: TYPES.VarChar,
      defaultSponsorEmail: TYPES.VarChar,
      affiliate_phone: TYPES.VarChar,
      logos3: TYPES.VarChar
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

    let query = connection.sql(`
      USE ${dbName};
      INSERT INTO b_sponsors (
          ${columnNames}
      )
      VALUES (
          ${values}
      );
      SELECT * FROM b_sponsors WHERE sponsorID = @@identity;
    `);

    for (const key of columns) {
      query = query.parameter(key, COLUMN_TYPES[key], sponsor[key]);
    }

    const results = await query.execute();
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
    const connection = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    const COLUMN_TYPES = {
      affiliate_name: TYPES.VarChar,
      affiliate_website: TYPES.VarChar,
      contact_name: TYPES.VarChar,
      defaultSponsorEmail: TYPES.VarChar,
      affiliate_phone: TYPES.VarChar,
      logos3: TYPES.VarChar,
      logo: TYPES.VarChar
    };

    const updateFields = Object.keys(data)
      .filter(key => key in COLUMN_TYPES)
      .map(key => `${key} = @${key}`)
      .join(', ');

    if (!updateFields) {
      throw new Error('No valid columns to update');
    }

    let updateRequest = connection.sql(`
      USE ${dbName};
      UPDATE b_sponsors
      SET ${updateFields}
      WHERE sponsorID = @sponsorID;
    `)
    .parameter('sponsorID', TYPES.Int, Number(sponsorID));

    for (const key in data) {
      if (key in COLUMN_TYPES) {
        updateRequest = updateRequest.parameter(key, COLUMN_TYPES[key], data[key]);
      }
    }

    await updateRequest.execute();

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
    const connection = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    const sponsors = await connection.sql(`
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
    `)
    .parameter('affiliateID', TYPES.Int, Number(affiliateID))
    .execute();

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
    const connection = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    await connection.sql(`
      USE ${dbName};
      DELETE FROM b_sponsors
      WHERE sponsorID = @sponsorID
    `)
    .parameter('sponsorID', TYPES.Int, Number(sponsorID))
    .execute();

    return { success: true };
  } catch (error) {
    console.error('Error deleting affiliate sponsor:', error);
    throw error;
  }
}

/**
 * Get event sponsors
 * Note: This is a simplified version - full version needs getEventResources
 */
export async function getEventSponsors(eventID, vert) {
  try {
    const connection = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    const sponsors = await connection.sql(`
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
    `)
    .parameter('eventID', TYPES.Int, Number(eventID))
    .execute();

    const slotAssignments = await connection.sql(`
      USE ${dbName};
      SELECT *
      FROM slotSponsor
      WHERE event_id = @eventID
    `)
    .parameter('eventID', TYPES.Int, Number(eventID))
    .execute();

    const liveMeetingDates = await connection.sql(`
      USE ${dbName};
      SELECT *
      FROM sponsorLiveMeetingDates
      WHERE event_id = @eventID
    `)
    .parameter('eventID', TYPES.Int, Number(eventID))
    .execute();

    // TODO: Get resources when getEventResources is implemented
    // const resources = await getEventResources(Number(eventID), [], vert);

    return sponsors.map(sponsor => {
      sponsor['slots'] = slotAssignments
        .filter(slot => slot.sponsor_id === sponsor.sponsorID)
        .map(slot => slot.slot_id);
      sponsor['liveMeetings'] = liveMeetingDates
        .filter(meeting => meeting.event_sponsor_id === sponsor.event_sponsor_id);
      sponsor['resources'] = []; // TODO: Add when getEventResources is implemented
        // .filter(resource => resource.sponsorID === sponsor.sponsorID)
        // .map(resource => ({title: resource.uploadTitle, docType: resource.uploadType, resourceType: resource.resource_type}));
      
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
    const connection = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    const levels = await connection.sql(`
      USE ${dbName};
      SELECT * FROM b_sponsorLevels 
      WHERE event_id = @eventID 
      ORDER BY level_order ASC, level_id DESC;
    `)
    .parameter('eventID', TYPES.Int, Number(eventID))
    .execute();

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
    const connection = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    if (!name) return { success: false, message: 'Must provide a name' };
    if (!iconSize) return { success: false, message: 'Must provide an iconSize' };
    if (!iconsPerRow) return { success: false, message: 'Must provide an iconsPerRow' };

    const results = await connection.sql(`
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
    `)
    .parameter('eventID', TYPES.Int, Number(eventID))
    .parameter('name', TYPES.VarChar, name)
    .parameter('description', TYPES.VarChar, description)
    .parameter('iconSize', TYPES.Int, Number(iconSize))
    .parameter('iconsPerRow', TYPES.Int, Number(iconsPerRow))
    .execute();

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
    const connection = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    const COLUMN_TYPES = {
      level_name: TYPES.VarChar,
      level_description: TYPES.VarChar,
      iconsPerRow: TYPES.Int,
      iconSize: TYPES.Int
    };

    const updateFields = Object.keys(data)
      .filter(key => key in COLUMN_TYPES)
      .map(key => `${key} = @${key}`)
      .join(', ');

    if (!updateFields) {
      throw new Error('No valid columns to update');
    }

    let updateRequest = connection.sql(`
      USE ${dbName};
      UPDATE b_sponsorLevels
      SET ${updateFields}
      WHERE level_id = @levelID
    `)
    .parameter('levelID', TYPES.Int, Number(levelID));

    for (const key in data) {
      if (key in COLUMN_TYPES) {
        updateRequest = updateRequest.parameter(key, COLUMN_TYPES[key], data[key]);
      }
    }

    await updateRequest.execute();
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
    const connection = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    await connection.sql(`
      USE ${dbName};
      DELETE FROM b_sponsorLevels WHERE level_id = @levelID;
      DELETE FROM event_sponsor WHERE level_id = @levelID;
    `)
    .parameter('levelID', TYPES.Int, Number(levelID))
    .execute();

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
    const connection = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    await connection.sql(`
      USE ${dbName};
      EXEC dbo.node_moveSponsorLevel
          @eventID,
          @levelID,
          @sortOrder
    `)
    .parameter('eventID', TYPES.Int, Number(eventID))
    .parameter('levelID', TYPES.Int, Number(levelID))
    .parameter('sortOrder', TYPES.Int, Number(sortOrder))
    .execute();

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
    const connection = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    await connection.sql(`
      USE ${dbName};
      EXEC dbo.node_moveEventSponsor
          @eventID,
          @sponsorID,
          @levelID,
          @sortOrder
    `)
    .parameter('eventID', TYPES.Int, Number(eventID))
    .parameter('sponsorID', TYPES.Int, Number(sponsorID))
    .parameter('levelID', TYPES.Int, Number(levelID))
    .parameter('sortOrder', TYPES.Int, Number(sortOrder))
    .execute();

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
    const connection = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    const results = await connection.sql(`
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
    `)
    .parameter('sponsorID', TYPES.Int, Number(sponsorID))
    .parameter('levelID', TYPES.Int, Number(levelID))
    .parameter('affiliateID', TYPES.Int, Number(affiliateID))
    .execute();

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
    const connection = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    await connection.sql(`
      USE ${dbName};
      DELETE FROM event_sponsor WHERE level_id = @levelID AND sponsorID = @sponsorID;
    `)
    .parameter('levelID', TYPES.Int, Number(levelID))
    .parameter('sponsorID', TYPES.Int, Number(sponsorID))
    .execute();

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
    const connection = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    const COLUMN_TYPES = {
      sponsorPromo: TYPES.VarChar,
      hideOnOverview: TYPES.Int,
      featureOnMobile: TYPES.Int,
      showOrgNameUnderLogo: TYPES.Bit,
      logoDescriptionOrLabel: TYPES.VarChar,
      webLogoClickAction: TYPES.TinyInt,
      veoLogoClickAction: TYPES.TinyInt,
      veoDisplayOnRollup: TYPES.Bit,
      veoShowNameUnderLogo: TYPES.Bit,
      displayLogoGrayscale: TYPES.Bit,
      showPhraseUnderLogo: TYPES.Bit,
      instantContactActive: TYPES.Int,
      liveMeetingLink: TYPES.VarChar
    };

    const updateFields = Object.keys(data)
      .filter(key => key in COLUMN_TYPES)
      .map(key => `${key} = @${key}`)
      .join(', ');

    if (!updateFields) {
      throw new Error('No valid columns to update');
    }

    let updateRequest = connection.sql(`
      USE ${dbName};
      UPDATE event_sponsor
      SET ${updateFields}
      WHERE sponsorID = @sponsorID
          AND level_id = @levelID;
    `)
    .parameter('sponsorID', TYPES.Int, Number(sponsorID))
    .parameter('levelID', TYPES.Int, Number(levelID));

    for (const key in data) {
      if (key in COLUMN_TYPES) {
        updateRequest = updateRequest.parameter(key, COLUMN_TYPES[key], data[key]);
      }
    }

    await updateRequest.execute();
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
    const connection = await getConnection(vert);
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

    let query = connection.sql(qryStr);
    
    meetings.forEach((meeting, index) => {
      query = query.parameter(`eventID${index}`, TYPES.Int, Number(eventID));
      query = query.parameter(`sponsorID${index}`, TYPES.Int, Number(sponsorID));
      query = query.parameter(`startDateLocal${index}`, TYPES.VarChar, meeting.startDateLocal);
      query = query.parameter(`endDateLocal${index}`, TYPES.VarChar, meeting.endDateLocal);
      query = query.parameter(`startDateUTC${index}`, TYPES.DateTime, new Date(meeting.startDateUTC));
      query = query.parameter(`endDateUTC${index}`, TYPES.DateTime, new Date(meeting.endDateUTC));
    });

    const results = await query.execute();
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
    const connection = await getConnection(vert);
    const dbName = getDatabaseName(vert);

    await connection.sql(`
      USE ${dbName};
      DELETE FROM sponsorLiveMeetingDates WHERE meeting_id = @meetingID;
    `)
    .parameter('meetingID', TYPES.Int, Number(meetingID))
    .execute();

    return { success: true };
  } catch (error) {
    console.error('Error deleting live meeting:', error);
    throw error;
  }
}

