import { getStore } from '@netlify/blobs';

export const handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  try {
    const id = (event.queryStringParameters && event.queryStringParameters.id) || '';
    if (!id || typeof id !== 'string' || !/^[a-zA-Z0-9_-]{3,64}$/.test(id)) {
      return { statusCode: 400, body: 'Invalid id' };
    }
    const store = getStore('pixelmapeditor-projects');
    const value = await store.get(id);
    if (!value) return { statusCode: 404, body: 'Not found' };
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: value
    };
  } catch (err) {
    console.error('load-project error', err);
    return { statusCode: 500, body: 'Server error' };
  }
};


