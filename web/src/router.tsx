import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router';
import { App } from './App';

const rootRoute = createRootRoute({ component: App });
const homeRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: () => null });
const zukanRoute = createRoute({ getParentRoute: () => rootRoute, path: '/zukan', component: () => null });
const cardRoute = createRoute({ getParentRoute: () => rootRoute, path: '/zukan/$cardId', component: () => null });

export const router = createRouter({ routeTree: rootRoute.addChildren([homeRoute, zukanRoute, cardRoute]) });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
