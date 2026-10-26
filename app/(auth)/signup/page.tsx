import { AuthForm } from '@/components/costlens/AuthForm';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
export default function Page() { return <Card><CardHeader><CardTitle><h1 className="text-2xl font-semibold tracking-tight">A little clarity goes a long way</h1></CardTitle><CardDescription>Create your CostLens account and bring your costs together.</CardDescription></CardHeader><CardContent><AuthForm mode="signup"/></CardContent></Card>; }
