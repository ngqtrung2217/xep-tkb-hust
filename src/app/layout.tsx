import type { Metadata } from 'next'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Xếp TKB HUST - Công cụ xếp thời khóa biểu Đại học Bách Khoa Hà Nội',
  description: 'Xếp thời khóa biểu HUST tự động. Upload file Excel, chọn môn học, tìm tổ hợp tối ưu không trùng lịch. Hỗ trợ xếp ít ngày, ít cửa sổ trống, xem heatmap, export ICS.',
  keywords: ['xếp thời khóa biểu', 'TKB HUST', 'Đại học Bách Khoa Hà Nội', 'hust tkb', 'xếp lịch học', 'thời khóa biểu sinh viên'],
  authors: [{ name: 'ngqtrung2217' }],
  openGraph: {
    title: 'Xếp TKB HUST',
    description: 'Công cụ xếp thời khóa biểu tự động cho sinh viên Đại học Bách Khoa Hà Nội',
    type: 'website',
    locale: 'vi_VN',
    siteName: 'Xếp TKB HUST',
  },
  twitter: {
    card: 'summary',
    title: 'Xếp TKB HUST',
    description: 'Công cụ xếp thời khóa biểu tự động cho sinh viên Đại học Bách Khoa Hà Nội',
  },
  robots: { index: true, follow: true },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <head>
        <script type="application/ld+json" dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'WebApplication',
            name: 'Xếp TKB HUST',
            description: 'Công cụ xếp thời khóa biểu tự động cho sinh viên Đại học Bách Khoa Hà Nội',
            url: 'https://xep-tkb-hust.vercel.app',
            applicationCategory: 'EducationalApplication',
            operatingSystem: 'All',
            author: { '@type': 'Person', name: 'ngqtrung2217' },
          })
        }} />
      </head>
      <body className="bg-gray-50 text-gray-900">
        {children}
        <Analytics />
      </body>
    </html>
  )
}
