import application from '../../server/index.js';

export const config = {
  path: [
    '/api/*',
    '/store/:slug/api/*',
    '/robots.txt',
    '/sitemap.xml',
    '/store/:slug/robots.txt',
    '/store/:slug/sitemap.xml',
  ],
};

export default async function api(request) {
  return application.handleNetlifyRequest(request);
}
