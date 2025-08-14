import { TidewaysClient } from '../../lib/tideways-client.js';
import { ErrorHandler } from '../../lib/errors.js';
import { GetHistoricalDataParams } from '../../types/index.js';
export async function handleGetHistoricalData(
  client: TidewaysClient,
  params: GetHistoricalDataParams
): Promise<string> {
  try {
    const { date, granularity = 'day' } = params;
    const historicalData = await client.getHistoricalData(date, granularity);
    return JSON.stringify(historicalData, null, 2);
  } catch (error) {
    throw ErrorHandler.handleApiError(error);
  }
}