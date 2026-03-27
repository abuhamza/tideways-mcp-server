import { GetTracesParams } from '../types/index.js';

export function formatDateForAPI(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d} ${h}:${min}`;
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
