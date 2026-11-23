import type {
  CreateShapeRequest,
  CreateShapeResponse,
  CutResponse,
  FlairResponse,
  LeaderboardResponse,
  ShareResponse,
  StateResponse,
} from '../../shared/api';
import type { Line } from '../../shared/geometry';

const call = async <T,>(path: string, body?: unknown): Promise<T> => {
  const init: RequestInit =
    body === undefined
      ? { method: 'GET' }
      : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
  const res = await fetch(`/api/${path}`, init);
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      typeof data === 'object' && data !== null && 'message' in data && typeof data.message === 'string'
        ? data.message
        : `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data as T;
};

export const api = {
  state: () => call<StateResponse>('state'),
  cut: (line: Line) => call<CutResponse>('cut', { line }),
  leaderboard: () => call<LeaderboardResponse>('leaderboard'),
  share: () => call<ShareResponse>('share', {}),
  flair: () => call<FlairResponse>('flair', {}),
  createShape: (req: CreateShapeRequest) => call<CreateShapeResponse>('shape', req),
};
