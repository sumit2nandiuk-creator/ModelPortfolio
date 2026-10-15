// Reads and writes models/<slug>/model.json in the GitHub repository through the
// GitHub Contents API. Each save is a commit, so the usual Pages deploy runs.

import { base64ToUtf8, utf8ToBase64 } from './model.mjs';

const API = 'https://api.github.com';

function headers(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'portfolio-admin',
  };
}

function contentsUrl(repo, path, branch) {
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  return `${API}/repos/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`;
}

// Model slugs = folders in models/, minus templates and hidden folders.
export async function listModelSlugs({ repo, branch, token, fetchImpl }) {
  const res = await fetchImpl(contentsUrl(repo, 'models', branch), { headers: headers(token) });
  if (!res.ok) throw new HttpError(res.status, `GitHub could not list models (${res.status}).`);
  const items = await res.json();
  return items
    .filter((i) => i.type === 'dir' && !i.name.startsWith('_') && !i.name.startsWith('.'))
    .map((i) => i.name)
    .sort();
}

// Returns { model, sha } for a profile, or null if it does not exist yet.
export async function getModelFile({ repo, branch, token, fetchImpl, slug }) {
  const res = await fetchImpl(contentsUrl(repo, `models/${slug}/model.json`, branch), { headers: headers(token) });
  if (res.status === 404) return null;
  if (!res.ok) throw new HttpError(res.status, `GitHub could not read the profile (${res.status}).`);
  const file = await res.json();
  return { model: JSON.parse(base64ToUtf8(file.content)), sha: file.sha };
}

// Creates (sha omitted) or updates (sha given) models/<slug>/model.json. Returns the new blob sha.
export async function putModelFile({ repo, branch, token, fetchImpl, slug, model, sha, message }) {
  const body = {
    message,
    branch,
    content: utf8ToBase64(`${JSON.stringify(model, null, 2)}\n`),
  };
  if (sha) body.sha = sha;
  const res = await fetchImpl(`${API}/repos/${repo}/contents/models/${encodeURIComponent(slug)}/model.json`, {
    method: 'PUT',
    headers: { ...headers(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (res.status === 409) {
    throw new HttpError(409, 'This profile changed since you opened it. Reload it, then apply your changes again.');
  }
  if (res.status === 422 && !sha) {
    throw new HttpError(409, 'A profile with this address already exists. Open it from the list instead.');
  }
  if (!res.ok) throw new HttpError(res.status, `GitHub could not save the profile (${res.status}).`);
  const result = await res.json();
  return result.content.sha;
}

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
