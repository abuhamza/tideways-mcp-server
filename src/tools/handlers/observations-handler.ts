import { TidewaysClient } from '../../lib/tideways-client.js';
import { ErrorHandler } from '../../lib/errors.js';
import { GetObservationsParams } from '../../types/index.js';

export async function handleGetObservations(
  client: TidewaysClient,
  params: GetObservationsParams
): Promise<string> {
  try {
    const observations = await client.getObservations(params);
    return JSON.stringify(observations, null, 2);
  } catch (error) {
    throw ErrorHandler.handleApiError(error);
  }
}
