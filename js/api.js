import { API_URL } from './config.js';

export async function fetchHouseholdData() {
  const res = await fetch(API_URL);
  if (!res.ok) throw new Error('Failed to fetch data from Cloudflare Worker API.');
  return await res.json();
}

export async function saveHouseholdData(payload) {
  const res = await fetch(API_URL, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error('Failed to save updates to Cloudflare Worker API.');
}