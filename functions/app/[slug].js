export function onRequest({ params, request }) {
  const url = new URL('/app.html', request.url);
  url.searchParams.set('slug', params.slug);
  return Response.redirect(url.toString(), 302);
}
