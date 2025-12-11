export default defineNuxtRouteMiddleware((to) => {
  const authToken = useCookie('auth_token');

  // Public routes that don't require authentication
  const publicRoutes = ['/auth/login', '/auth/register', '/auth/forgot-password'];

  // Check if route is public
  const isPublicRoute = publicRoutes.some((route) => to.path.startsWith(route));

  // If not authenticated and trying to access protected route
  if (!authToken.value && !isPublicRoute) {
    return navigateTo('/auth/login');
  }

  // If authenticated and trying to access auth pages, redirect to dashboard
  if (authToken.value && isPublicRoute) {
    return navigateTo('/');
  }
});
