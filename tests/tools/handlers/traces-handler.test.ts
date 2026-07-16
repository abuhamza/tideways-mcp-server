import { handleGetTraces } from '../../../src/tools/handlers/traces-handler.js';
import { TidewaysClient } from '../../../src/lib/tideways-client.js';
import type { TidewaysTracesResponse } from '../../../src/types/index.js';

jest.mock('../../../src/lib/tideways-client.js');

const MockedTidewaysClient = TidewaysClient as jest.MockedClass<typeof TidewaysClient>;

describe('handleGetTraces', () => {
  let mockClient: jest.Mocked<TidewaysClient>;
  const response: TidewaysTracesResponse = { traces: [] };

  beforeEach(() => {
    jest.clearAllMocks();
    mockClient = new MockedTidewaysClient({} as any) as jest.Mocked<TidewaysClient>;
    mockClient.getTraces.mockResolvedValue(response);
  });

  it('should accept valid explicit trace date bounds', async () => {
    const params = {
      min_date: '2025-08-10 09:00',
      max_date: '2025-08-10 11:00',
    };

    const result = await handleGetTraces(mockClient, params);

    expect(mockClient.getTraces).toHaveBeenCalledWith(params);
    expect(result).toBe(JSON.stringify(response, null, 2));
  });

  it('should reject invalid trace date formats', async () => {
    await expect(handleGetTraces(mockClient, {
      min_date: '2025-08-10T09:00:00.000Z',
      max_date: '2025-08-10 11:00',
    })).rejects.toThrow('Invalid min_date format. Expected YYYY-MM-DD HH:MM');
    expect(mockClient.getTraces).not.toHaveBeenCalled();
  });

  it('should reject one-sided trace date bounds', async () => {
    await expect(handleGetTraces(mockClient, {
      min_date: '2025-08-10 09:00',
    })).rejects.toThrow('min_date and max_date must be provided together');
    expect(mockClient.getTraces).not.toHaveBeenCalled();
  });

  it('should reject inverted trace date bounds', async () => {
    await expect(handleGetTraces(mockClient, {
      min_date: '2025-08-10 11:00',
      max_date: '2025-08-10 09:00',
    })).rejects.toThrow('min_date must be earlier than max_date');
    expect(mockClient.getTraces).not.toHaveBeenCalled();
  });

  it('should reject equal trace date bounds', async () => {
    await expect(handleGetTraces(mockClient, {
      min_date: '2025-08-10 09:00',
      max_date: '2025-08-10 09:00',
    })).rejects.toThrow('min_date must be earlier than max_date');
    expect(mockClient.getTraces).not.toHaveBeenCalled();
  });
});
