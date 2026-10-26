import Link from 'next/link';
import { Brand } from '@/components/costlens/Brand';
import { ThemeToggle } from '@/components/costlens/ThemeToggle';
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-svh flex-col bg-muted/30"><header className="flex items-center justify-between px-6 py-6"><Brand/><ThemeToggle/></header><main className="flex flex-1 items-center justify-center px-4 py-10"><div className="w-full max-w-md">{children}<p className="mt-6 text-center text-sm text-muted-foreground"><Link href="/" className="hover:underline">Back to home</Link></p></div></main></div>;
}
