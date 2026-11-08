import { useRouter } from '@tanstack/react-router';

// Closing a route screen should step back through history (like the app), not push a new entry the back button would return to.
export function useBackTo() {
  const router = useRouter();
  return (to: '/' | '/zukan') => {
    if (router.history.canGoBack()) router.history.back();
    else void router.navigate({ to, replace: true });
  };
}
