import { Skeleton } from '@/components/ui/skeleton';
export default function Loading() { return <main aria-label="Loading page" className="mx-auto max-w-6xl space-y-6 p-8"><Skeleton className="h-10 w-40"/><Skeleton className="mt-24 h-32 w-3/4"/><Skeleton className="h-80 rounded-2xl"/></main>; }
