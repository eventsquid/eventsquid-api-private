/**
 * Conversion utility functions
 * Migrated from Mantle functions/conversions
 */

import moment from 'moment-timezone';

/**
 * Convert UTC date to timezone
 * @param {Date|string} utcDate - UTC date
 * @param {string} zone - Timezone (e.g., 'America/New_York')
 * @param {string} format - Output format (e.g., 'YYYY-MM-DD HH:mm:ss')
 * @returns {string} Formatted date in specified timezone
 */
export function utcToTimezone(utcDate, zone, format) {
  if (!zone || !zone.length) {
    return moment(utcDate).utc(true).format(format);
  }
  return moment(utcDate).utc(true).tz(zone).format(format);
}

/**
 * Convert timezone date to UTC
 * @param {Date|string} date - Date in specified timezone
 * @param {string} zone - Timezone (e.g., 'America/New_York')
 * @param {string} format - Output format (e.g., 'YYYY-MM-DD HH:mm:ss')
 * @returns {string} Formatted date in UTC
 */
export function timezoneToUTC(date, zone, format) {
  if (!zone || !zone.length) {
    return moment(date).utc(true).format(format);
  }
  return moment(date).tz(zone, true).utc().format(format);
}

