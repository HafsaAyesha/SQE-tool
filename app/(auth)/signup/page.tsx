import Link from 'next/link';
import { Brand } from '@/components/costlens/Brand';
import { Button } from '@/components/ui/button';
export default function Page() { return <main className="mx-auto flex min-h-svh max-w-lg flex-col justify-center gap-6 p-8"><Brand/><h1 className="text-3xl font-semibold">A little clarity goes a long way</h1><p className="text-muted-foreground">Authentication is coming in a later step. You can explore the workspace shell now.</p><Button asChild><Link href="/projects">Explore workspace</Link></Button><Link href="/" className="text-sm text-muted-foreground underline">Back to home</Link></main>; }
