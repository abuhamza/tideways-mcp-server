import { TidewaysClient } from '../../lib/tideways-client.js';
import { ErrorHandler } from '../../lib/errors.js';
import { addDefaultDateRange } from '../../utils/date-utils.js';
import { GetTracesParams } from '../../types/index.js';
import { TRACE_CONFIG } from '../definitions.js';
export async function handleGetTraces(
  client: TidewaysClient,
  params: GetTracesParams
): Promise<string> {
  try {
    const paramsWithDefaults = addDefaultDateRange(params);

    if (paramsWithDefaults.min_date && paramsWithDefaults.max_date) {
      const minDate = new Date(paramsWithDefaults.min_date);
      const maxDate = new Date(paramsWithDefaults.max_date);

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

