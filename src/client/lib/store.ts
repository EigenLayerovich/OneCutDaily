// localStorage can throw (private mode, blocked storage); never let it break play.
export const load = <T,>(key: string, fallback: T): T => {
  try {
    const raw = window.localStorage.getItem(`onecut:${key}`);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
};

export const save = (key: string, value: unknown) => {
  try {
    window.localStorage.setItem(`onecut:${key}`, JSON.stringify(value));
  } catch {
    /* ignore */
  }
};
