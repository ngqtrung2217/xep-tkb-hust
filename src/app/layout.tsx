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
        <link rel="llms" href="/llms.txt" />
        <link rel="llms-full" href="/llms.txt" />
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
        <script type="application/ld+json" dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'HowTo',
            name: 'Cách xếp thời khóa biểu HUST',
            description: 'Các bước để xếp thời khóa biểu tối ưu',
            step: [
              { '@type': 'HowToStep', position: 1, name: 'Upload file', text: 'Tải lên file Excel thời khóa biểu từ thông báo đăng ký tín chỉ HUST' },
              { '@type': 'HowToStep', position: 2, name: 'Chọn môn', text: 'Nhập mã học phần cần đăng ký hoặc paste danh sách' },
              { '@type': 'HowToStep', position: 3, name: 'Tuỳ chỉnh', text: 'Cài đặt nghỉ buổi, ưu tiên ít ngày, ít cửa sổ trống' },
              { '@type': 'HowToStep', position: 4, name: 'Xếp tự động', text: 'Bấm nút xếp, duyệt kết quả và chọn phương án phù hợp' },
            ],
          })
        }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: [
              {
                '@type': 'Question',
                name: 'Làm sao để xếp thời khóa biểu HUST?',
                acceptedAnswer: { '@type': 'Answer', text: 'Tải file Excel từ thông báo đăng ký tín chỉ, upload lên web, chọn môn và bấm xếp tự động.' },
              },
              {
                '@type': 'Question',
                name: 'Có thể xếp ít ngày học nhất không?',
                acceptedAnswer: { '@type': 'Answer', text: 'Có. Bật tuỳ chọn "Ưu tiên xếp ít ngày nhất" để hệ thống tìm tổ hợp có ít ngày học nhất.' },
              },
              {
                '@type': 'Question',
                name: 'Cửa sổ trống là gì?',
                acceptedAnswer: { '@type': 'Answer', text: 'Là khoảng thời gian trống giữa 2 tiết học trong cùng ngày, VD học tiết 1-2, trống tiết 3, học tiết 4.' },
              },
              {
                '@type': 'Question',
                name: 'Xếp được bao nhiêu cách?',
                acceptedAnswer: { '@type': 'Answer', text: 'Hệ thống có thể tìm ra hàng nghìn cách xếp khác nhau, hiển thị tối đa 500 kết quả tốt nhất.' },
              },
            ],
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
