import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { Providers } from '@/components/costlens/Providers';
import './globals.css';
const inter = localFont({ src: './fonts/InterVariable.woff2', variable: '--font-inter', display: 'swap' });
export const metadata: Metadata = { title: { default: 'CostLens — Clarity in every cost', template: '%s | CostLens' }, description: 'Analyse costs from any file, tool or recording.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" suppressHydrationWarning><body className={inter.variable}><Providers>{children}</Providers></body></html>;
}
