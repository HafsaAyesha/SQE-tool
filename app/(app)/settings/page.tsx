import Link from 'next/link';
import { PageHeader } from '@/components/costlens/PageHeader';
import { EmptyState } from '@/components/costlens/EmptyState';
import { Button } from '@/components/ui/button';
export default function Page() { return <><PageHeader title="Workspace settings"/><EmptyState title="Your workspace is just getting started" description="Account and workspace preferences will become available when authentication is connected." action={<Button asChild><Link href="/projects">Go to projects</Link></Button>}/></>; }
