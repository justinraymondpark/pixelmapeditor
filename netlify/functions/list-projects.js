import { connectLambda, getStore } from '@netlify/blobs';

export const handler = async (event) => {
  try { connectLambda(event); } catch {}
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  try {
    const store = getStore('pixelmapeditor-projects');
    const list = await store.list();
    const ids = (list.blobs || []).map(b => b.key).sort();
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids })
    };
  } catch (err) {
    console.error('list-projects error', err);
    return { statusCode: 500, body: 'Server error' };
  }
};


