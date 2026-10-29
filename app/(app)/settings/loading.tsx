import { Skeleton } from '@/components/ui/skeleton';
export default function LoadingSettings(){return <div role="status" aria-label="Loading settings" className="space-y-6"><Skeleton className="h-12 w-64"/><div className="grid gap-4 sm:grid-cols-3">{[0,1,2].map(key=><Skeleton key={key} className="h-36 rounded-2xl"/>)}</div><Skeleton className="h-56 rounded-2xl"/></div>;}
