/**
 * Sign-out endpoint.
 *
 * A POST route rather than a link: signing out is a state change, and a GET
 * would let a prefetcher or an <img> tag end someone's session.
 */
import { logoutAction } from '../actions';

export async function POST(): Promise<Response> {
  await logoutAction();
  // logoutAction() redirects; this satisfies the route's return type.
  return new Response(null, { status: 303, headers: { location: '/auth/login' } });
}
