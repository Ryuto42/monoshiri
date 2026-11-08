import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router';
import { App } from './App';

const rootRoute = createRootRoute({ component: App });
const homeRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: () => null });
const zukanRoute = createRoute({ getParentRoute: () => rootRoute, path: '/zukan', component: () => null });
const cardRoute = createRoute({ getParentRoute: () => rootRoute, path: '/zukan/$cardId', component: () => null });
const accountRoute = createRoute({ getParentRoute: () => rootRoute, path: '/account', component: () => null });
const privacyRoute = createRoute({ getParentRoute: () => rootRoute, path: '/privacy', component: () => null });
// Opened from the links in Firebase's emails (verify the address, reset the password).
const authActionRoute = createRoute({ getParentRoute: () => rootRoute, path: '/auth/action', component: () => null });

export const router = createRouter({ routeTree: rootRoute.addChildren([homeRoute, zukanRoute, cardRoute, accountRoute, privacyRoute, authActionRoute]) });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
