import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Coffee Ride',
  description:
    'Платформа для поиска, организации и участия в групповых велозаездах.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
