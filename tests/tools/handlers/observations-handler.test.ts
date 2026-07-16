import { handleGetObservations } from '../../../src/tools/handlers/observations-handler.js';
import { TidewaysClient } from '../../../src/lib/tideways-client.js';
import { ErrorHandler, TidewaysAPIError } from '../../../src/lib/errors.js';
import type { GetObservationsParams, TidewaysObservationsResponse } from '../../../src/types/index.js';

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

describe('handleGetObservations', () => {
  let mockClient: jest.Mocked<TidewaysClient>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockClient = new MockedTidewaysClient({} as any) as jest.Mocked<TidewaysClient>;
  });

  it('should return raw observations as pretty JSON', async () => {
    const response: TidewaysObservationsResponse = {
      observations: [
        {
          type: 'php.extension',
          source: 'tideways',
          label: 'Install ext-tideways',
          status: 'open',
          doc_link: 'https://support.tideways.com/',
          app_link: 'https://app.tideways.io/',
          origins: ['app'],
        },
      ],
      criteria: {
        environment: 'production',
        service: 'web',
      },
    };
    const params: GetObservationsParams = { env: 'production', s: 'web' };
    mockClient.getObservations.mockResolvedValue(response);

    const result = await handleGetObservations(mockClient, params);

    expect(mockClient.getObservations).toHaveBeenCalledWith(params);
    expect(result).toBe(JSON.stringify(response, null, 2));
  });

  it('should handle missing project configuration errors', async () => {
    const validationError = new TidewaysAPIError(
      'TIDEWAYS_ORG and TIDEWAYS_PROJECT are required for project-scoped Tideways API calls',
      'validation'
    );
    mockClient.getObservations.mockRejectedValue(validationError);

    await expect(handleGetObservations(mockClient, {})).rejects.toThrow();
    expect(mockedErrorHandler.handleApiError).toHaveBeenCalledWith(validationError);
  });
});
