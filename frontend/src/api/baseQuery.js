import { api } from './client';

/** RTK Query base query over the shared API client: `prefix` + the endpoint's url, with the
 *  server's message on failure as `error.data.message`. */
export const restBaseQuery = (prefix) => async (args) => {
  try {
    const request = typeof args === 'string' ? { url: args } : args;
    const method = (request.method || 'GET').toLowerCase();
    const path = `${prefix}${request.url || ''}`;
    const data = method === 'get'
      ? await api.get(path, { headers: request.headers })
      : await api[method](path, request.body, { headers: request.headers });
    return { data };
  } catch (error) {
    return { error: { status: error.status || 500, data: { message: error.message } } };
  }
};
