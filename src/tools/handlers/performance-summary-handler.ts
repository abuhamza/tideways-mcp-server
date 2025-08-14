import { TidewaysClient } from '../../lib/tideways-client.js';
import { ErrorHandler } from '../../lib/errors.js';
import { GetPerformanceSummaryParams } from '../../types/index.js';
export async function handleGetPerformanceSummary(
  client: TidewaysClient,
  params: GetPerformanceSummaryParams
): Promise<string> {
  try {
    const summaryData = await client.getPerformanceSummary(params);
    return JSON.stringify(summaryData, null, 2);
  } catch (error) {
    throw ErrorHandler.handleApiError(error);
  }
}