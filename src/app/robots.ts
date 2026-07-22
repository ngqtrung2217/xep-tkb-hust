import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: '/_next/' },
    sitemap: 'https://xep-tkb-hust.vercel.app/sitemap.xml',
  }
}
