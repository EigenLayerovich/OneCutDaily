// Thin, defensive wrappers around Devvit client effects so the same UI also
// runs in a plain browser during local development.
import {
  context,
  navigateTo,
  requestExpandedMode,
  showLoginPrompt,
  showToast,
  type Context,
} from '@devvit/web/client';

const ctx: Context | undefined = context;

export const inReddit = (): boolean => ctx !== undefined && ctx !== null;

export const postData = (): unknown => ctx?.postData;

export const openEntry = (event: MouseEvent, entry: 'game' | 'forge' | 'default', title?: string) => {
  if (inReddit()) {
    try {
      requestExpandedMode(event, entry, title ? { title } : undefined);
      return;
    } catch (e) {
      console.error('requestExpandedMode failed', e);
    }
  }
  const page = entry === 'default' ? 'splash' : entry;
  window.location.href = `${page}.html${window.location.search}`;
};

export const go = (url: string) => {
  if (inReddit()) navigateTo(url);
  else window.open(url, '_blank');
};

export const askLogin = () => {
  if (inReddit()) showLoginPrompt();
  else toast('Login prompt (only on Reddit)');
};

type ToastListener = (text: string) => void;
let listener: ToastListener | null = null;
export const onToast = (l: ToastListener | null) => {
  listener = l;
};

export const toast = (text: string) => {
  if (inReddit()) {
    showToast(text);
    return;
  }
  listener?.(text);
};
