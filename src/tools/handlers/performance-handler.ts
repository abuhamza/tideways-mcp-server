import { TidewaysClient } from '../../lib/tideways-client.js';
import { ErrorHandler } from '../../lib/errors.js';
import { GetPerformanceMetricsParams } from '../../types/index.js';
export async function handleGetPerformanceMetrics(
  client: TidewaysClient,
  params: GetPerformanceMetricsParams
): Promise<string> {
  try {
    const performanceData = await client.getPerformanceMetrics(params);
    return JSON.stringify(performanceData, null, 2);
  } catch (error) {
    throw ErrorHandler.handleApiError(error);
  }
}