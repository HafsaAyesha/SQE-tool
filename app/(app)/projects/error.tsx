'use client';
import { Button } from '@/components/ui/button';
export default function ProjectsError({ reset }: { reset: () => void }) {
  return <div className="rounded-2xl border bg-card p-8 text-center"><h2 className="text-xl font-semibold">We couldn’t load your projects</h2><p className="my-4 text-muted-foreground">Please check your connection and try again.</p><Button onClick={reset}>Try again</Button></div>;
}
