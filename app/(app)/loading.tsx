import { Skeleton } from '@/components/ui/skeleton';
export default function Loading() { return <div aria-label="Loading workspace" className="space-y-6"><Skeleton className="h-10 w-48"/><div className="grid gap-6 sm:grid-cols-3">{[0,1,2].map(i => <Skeleton key={i} className="h-32 rounded-2xl"/>)}</div><Skeleton className="h-80 w-full rounded-2xl"/></div>; }
