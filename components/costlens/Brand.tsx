import Link from 'next/link';
import { ChartNoAxesCombined } from 'lucide-react';
export function Brand() { return <Link href="/" className="flex items-center gap-2.5 text-xl font-bold tracking-tight" aria-label="CostLens home"><span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground"><ChartNoAxesCombined className="size-5"/></span>CostLens<span className="text-primary">.</span></Link>; }
