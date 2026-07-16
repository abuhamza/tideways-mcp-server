import { GetTracesParams } from '../types/index.js';
export function formatDateForAPI(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

export function addDefaultDateRange(params: GetTracesParams): GetTracesParams {
  if (!params.min_date && !params.max_date) {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    return {
      ...params,
      min_date: formatDateForAPI(yesterday),
      max_date: formatDateForAPI(now),
    };
  }
  return params;
}
