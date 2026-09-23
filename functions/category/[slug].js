export function onRequest({ params, request }) {
  const url = new URL('/apps.html', request.url);
  url.searchParams.set('category', params.slug);
  return Response.redirect(url.toString(), 302);
}
