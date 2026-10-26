import { AuthForm } from '@/components/costlens/AuthForm';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
export default async function Page({ searchParams }: { searchParams: Promise<{ confirmation?: string }> }) {
  const { confirmation } = await searchParams;
  return <Card><CardHeader><CardTitle><h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1></CardTitle><CardDescription>Your projects. Your numbers. A clearer picture.</CardDescription></CardHeader><CardContent>{confirmation === 'failed' && <p role="alert" className="mb-5 text-sm text-destructive">That confirmation link is invalid or has expired. Try signing in, or request a new confirmation email from your administrator.</p>}<AuthForm mode="login"/></CardContent></Card>;
}
