import Link from 'next/link';
import { PageHeader } from '@/components/costlens/PageHeader';
import { EmptyState } from '@/components/costlens/EmptyState';
import { Button } from '@/components/ui/button';
export default function Page() { return <><PageHeader title="Your reports"/><EmptyState title="Your workspace is just getting started" description="Your cost reports will live here once you have a project." action={<Button asChild><Link href="/projects">Go to projects</Link></Button>}/></>; }
