import { handleGetTokenCapabilities } from '../../../src/tools/handlers/token-capabilities-handler.js';
import { TidewaysClient } from '../../../src/lib/tideways-client.js';
import { ErrorHandler, TidewaysAPIError } from '../../../src/lib/errors.js';
import type { TidewaysTokenCapabilitiesResponse } from '../../../src/types/index.js';

jest.mock('../../../src/lib/tideways-client.js');

jest.mock('../../../src/lib/errors.js', () => ({
  ErrorHandler: {
    handleApiError: jest.fn((error) => {
      throw new TidewaysAPIError(error.message, 'api');
    })
  },
  TidewaysAPIError: jest.fn().mockImplementation((message, category, statusCode) => {
    const error = new Error(message);
    (error as any).category = category;
    (error as any).statusCode = statusCode;
    return error;
  })
}));

const MockedTidewaysClient = TidewaysClient as jest.MockedClass<typeof TidewaysClient>;
const mockedErrorHandler = ErrorHandler as jest.Mocked<typeof ErrorHandler>;

describe('handleGetTokenCapabilities', () => {
  let mockClient: jest.Mocked<TidewaysClient>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockClient = new MockedTidewaysClient({} as any) as jest.Mocked<TidewaysClient>;
  });

  it('should return raw token capabilities as pretty JSON', async () => {
    const response: TidewaysTokenCapabilitiesResponse = {
      scopes: ['metrics', 'traces', 'issues'],
      projects: [
        { name: 'test-org/test-project', license: 'pro' },
      ],
    };
    mockClient.getTokenCapabilities.mockResolvedValue(response);

    const result = await handleGetTokenCapabilities(mockClient);

    expect(mockClient.getTokenCapabilities).toHaveBeenCalledWith();
    expect(result).toBe(JSON.stringify(response, null, 2));
  });

  it('should handle API errors', async () => {
    const apiError = new Error('API Error');
    mockClient.getTokenCapabilities.mockRejectedValue(apiError);

    await expect(handleGetTokenCapabilities(mockClient)).rejects.toThrow();
    expect(mockedErrorHandler.handleApiError).toHaveBeenCalledWith(apiError);
  });
});
