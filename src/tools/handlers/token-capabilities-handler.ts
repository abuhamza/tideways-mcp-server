import { TidewaysClient } from '../../lib/tideways-client.js';
import { ErrorHandler } from '../../lib/errors.js';

export async function handleGetTokenCapabilities(
  client: TidewaysClient
): Promise<string> {
  try {
    const tokenCapabilities = await client.getTokenCapabilities();
    return JSON.stringify(tokenCapabilities, null, 2);
  } catch (error) {
    throw ErrorHandler.handleApiError(error);
  }
}
