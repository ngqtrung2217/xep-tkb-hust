import type { Metadata } from 'next'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Xếp TKB HUST',
  description: 'Công cụ xếp thời khóa biểu cho sinh viên Đại học Bách Khoa Hà Nội',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body className="bg-gray-50 text-gray-900">
        {children}
        <Analytics />
      </body>
    </html>
  )
}
