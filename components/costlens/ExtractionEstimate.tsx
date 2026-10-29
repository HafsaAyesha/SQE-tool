'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import type { z } from 'zod';
import type { extractionEstimateSchema } from '@/lib/import/schema';
import { Button } from '@/components/ui/button';
export function ExtractionEstimate({estimate,pending,onConfirm}:{estimate:z.infer<typeof extractionEstimateSchema>;pending:boolean;onConfirm:()=>void}){
  const [confirmed,setConfirmed]=useState(false);
  return <section aria-label="AI extraction estimate" className="space-y-4 rounded-2xl border border-primary/30 bg-card p-5"><h2 className="text-lg font-semibold">Review AI extraction</h2><p className="text-sm">{estimate.units} {estimate.kind} · about {estimate.inputTokens.toLocaleString()} input tokens and {estimate.outputTokens.toLocaleString()} estimated output tokens · roughly ${estimate.estimatedUsd.toFixed(4)}.</p><p className="text-xs text-muted-foreground">Planning estimate at $0.50 / million input tokens and $3 / million output tokens. Actual Gemini pricing and usage vary. Structured tables are read locally first; only remaining content needs AI.</p>{estimate.visual&&<p className="text-sm text-warn">This source may need visual extraction. Pixels cannot be reliably masked; personal-data masking must be off in <Link href="/settings" className="underline">Settings</Link> before sending images or scanned pages to Gemini.</p>}{estimate.units>5&&<label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} disabled={pending} onChange={event=>setConfirmed(event.target.checked)}/>I confirm AI extraction of more than 5 pages, slides or images.</label>}<Button type="button" disabled={pending||estimate.units>5&&!confirmed} onClick={onConfirm}><Sparkles className="size-4"/>{pending?'Extracting…':'Extract costs with AI'}</Button></section>;
}
