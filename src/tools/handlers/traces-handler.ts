import { TidewaysClient } from '../../lib/tideways-client.js';
import { ErrorHandler } from '../../lib/errors.js';
import { addDefaultDateRange } from '../../utils/date-utils.js';
import { GetTracesParams } from '../../types/index.js';
import { TRACE_CONFIG } from '../definitions.js';

const TIDEWAYS_DATE_PATTERN = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/;

function parseTidewaysDate(value: string, fieldName: string): Date {
  if (!TIDEWAYS_DATE_PATTERN.test(value)) {
    throw ErrorHandler.handleValidationError(`Invalid ${fieldName} format. Expected YYYY-MM-DD HH:MM`);
  }

  const [datePart, timePart] = value.split(' ');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hours, minutes] = timePart.split(':').map(Number);

  const date = new Date(year, month - 1, day, hours, minutes);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hours ||
    date.getMinutes() !== minutes
  ) {
    throw ErrorHandler.handleValidationError(`Invalid ${fieldName} value. Expected a real YYYY-MM-DD HH:MM date`);
  }

  return date;
}

export async function handleGetTraces(
  client: TidewaysClient,
  params: GetTracesParams
): Promise<string> {
  try {
    const paramsWithDefaults = addDefaultDateRange(params);

    if (!!paramsWithDefaults.min_date !== !!paramsWithDefaults.max_date) {
      throw ErrorHandler.handleValidationError('min_date and max_date must be provided together');
    }

    if (paramsWithDefaults.min_date && paramsWithDefaults.max_date) {
      const minDate = parseTidewaysDate(paramsWithDefaults.min_date, 'min_date');
      const maxDate = parseTidewaysDate(paramsWithDefaults.max_date, 'max_date');

      if (minDate >= maxDate) {
        throw ErrorHandler.handleValidationError('min_date must be earlier than max_date');
      }

      const daysDiff = (maxDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24);
      if (daysDiff > TRACE_CONFIG.MAX_DATE_RANGE_DAYS) {
        throw ErrorHandler.handleValidationError(`Date range cannot exceed ${TRACE_CONFIG.MAX_DATE_RANGE_DAYS} days`);
      }
    }

    if (paramsWithDefaults.min_response_time_ms && paramsWithDefaults.max_response_time_ms) {
      if (paramsWithDefaults.min_response_time_ms >= paramsWithDefaults.max_response_time_ms) {
        throw ErrorHandler.handleValidationError('min_response_time_ms must be less than max_response_time_ms');
      }
    }

    const tracesData = await client.getTraces(paramsWithDefaults);

    return JSON.stringify(tracesData, null, 2);
  } catch (error) {
    throw ErrorHandler.handleApiError(error);
  }
}
