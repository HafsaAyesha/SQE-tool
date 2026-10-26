import Link from 'next/link';
import { PageHeader } from '@/components/costlens/PageHeader';
import { EmptyState } from '@/components/costlens/EmptyState';
import { Button } from '@/components/ui/button';
export default function Page() { return <><PageHeader title="Import your data"/><EmptyState title="Your workspace is just getting started" description="Choose a project before bringing your cost data into CostLens." action={<Button asChild><Link href="/projects">Go to projects</Link></Button>}/></>; }
