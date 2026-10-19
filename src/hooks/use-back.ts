import { useNavigate } from 'react-router';

/**
 * "Back" that also works when the page was opened directly (a shared link, a reload in a new tab):
 * steps back through history when there is some inside the app, else goes to `fallback`.
 */
export function useBack(fallback = '/') {
  const navigate = useNavigate();
  return () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) void navigate(-1);
    else void navigate(fallback, { replace: true });
  };
}
