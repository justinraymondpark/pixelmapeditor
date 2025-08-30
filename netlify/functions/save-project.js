import { getStore } from '@netlify/blobs';

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  try {
    const { id, payload } = JSON.parse(event.body || '{}');
    if (!id || typeof id !== 'string' || !/^[a-zA-Z0-9_-]{3,64}$/.test(id)) {
      return { statusCode: 400, body: 'Invalid id' };
    }
    if (!payload || typeof payload !== 'object') {
      return { statusCode: 400, body: 'Invalid payload' };
    }
    const store = getStore('pixelmapeditor-projects');
    await store.set(id, JSON.stringify(payload), { contentType: 'application/json' });
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true })
    };
  } catch (err) {
    console.error('save-project error', err);
    return { statusCode: 500, body: 'Server error' };
  }
};


