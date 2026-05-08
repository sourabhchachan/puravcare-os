import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'PuravCare OS',
  description: 'Hospital Operating System',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
