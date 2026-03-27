import { TidewaysClient } from '../../lib/tideways-client.js';
import { TidewaysAPIError, ErrorHandler } from '../../lib/errors.js';
import { GetIssuesParams } from '../../types/index.js';
export async function handleGetIssues(
  client: TidewaysClient,
  params: GetIssuesParams
): Promise<string> {
  try {
    const issuesData = await client.getIssues(params);
    return JSON.stringify(issuesData, null, 2);
  } catch (error) {
    if (error instanceof TidewaysAPIError) throw error;
    throw ErrorHandler.handleApiError(error);
  }
}