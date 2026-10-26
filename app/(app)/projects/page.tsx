import Link from 'next/link';
import { ArrowUpRight, Plus } from 'lucide-react';
import { PageHeader } from '@/components/costlens/PageHeader';
import { EmptyState } from '@/components/costlens/EmptyState';
import { Button } from '@/components/ui/button';
export default function ProjectsPage() { return <><PageHeader title="Your projects" description="Big picture clarity. Down to the last detail." action={<Button asChild><Link href="/signup"><Plus/>New project</Link></Button>}/><EmptyState title="Every great project starts with a clear picture" description="Bring your estimated and actual costs together. Your first project will appear here." action={<Button asChild><Link href="/signup">Get started<ArrowUpRight/></Link></Button>}/><p className="text-center text-xs text-muted-foreground">CSV, spreadsheets, documents, recordings — all roads lead to clarity.</p></>; }
