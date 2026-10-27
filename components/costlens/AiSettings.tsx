'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ShieldCheck, Sparkles, LoaderCircle } from 'lucide-react';
import { setMaskPersonalData } from '@/app/(app)/settings/actions';
import { Button } from '@/components/ui/button';
export function AiSettings({mask,available=true}:{mask:boolean;available?:boolean}){
  const router=useRouter();const [enabled,setEnabled]=useState(mask),[saving,setSaving]=useState(false),[testing,setTesting]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  async function toggle(){
    const next=!enabled;setEnabled(next);setSaving(true);setError('');
    try{const result=await setMaskPersonalData(next);if(result.error){setEnabled(!next);setError(result.error);toast.error(result.error);}else{toast.success('Privacy setting saved');router.refresh();}}catch{setEnabled(!next);setError('Your privacy setting could not be saved.');toast.error('Your privacy setting could not be saved.');}finally{setSaving(false);}
  }
  async function test(){
    setTesting(true);setError('');setMessage('');
    try{
      const response=await fetch('/api/ai/test',{method:'POST'});const result=await response.json();
      if(!response.ok){const text=result.error??'The AI check could not be completed.';setError(text);toast.error(text);return;}
      const text=result.cached?'AI check passed — served from cache.':'AI check passed — validated JSON received.';setMessage(text);toast.success(text);router.refresh();
    }catch{setError('We could not reach the AI service. Please try again.');toast.error('We could not reach the AI service. Please try again.');}finally{setTesting(false);}
  }
  return <div className="space-y-6"><section className="space-y-4 rounded-2xl border bg-card p-6 shadow-sm"><div className="flex gap-3"><ShieldCheck className="mt-1 size-5 shrink-0 text-primary"/><div><h2 className="font-semibold">Privacy before AI</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Masking replaces detected emails, phone numbers, bank/card numbers and street addresses with placeholders. Detection is best-effort: review sensitive data before using AI.</p></div></div><div className="flex items-center justify-between gap-4 rounded-xl border p-4"><span id="mask-label" className="text-sm font-medium">Mask personal data before sending to AI</span><button type="button" role="switch" aria-labelledby="mask-label" aria-checked={enabled} disabled={saving||testing||!available} onClick={()=>void toggle()} className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${enabled?'bg-primary':'bg-muted-foreground'}`}><span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-transform ${enabled?'left-0.5 translate-x-5':'left-0.5'}`}/></button></div>{!available&&<p className="text-sm text-warn">Privacy settings are temporarily unavailable. AI requests are paused until they can be loaded.</p>}</section>
    <section className="space-y-3 rounded-2xl border bg-card p-6 shadow-sm"><div className="flex items-center gap-2"><Sparkles className="size-5 text-primary"/><h2 className="font-semibold">AI connection</h2></div><p className="text-sm text-muted-foreground">Run a small check to confirm AI returns valid data. Repeated checks can use the cache; each check counts toward your request quota.</p><Button onClick={()=>void test()} disabled={testing||saving||!available}>{testing&&<LoaderCircle className="animate-spin"/>}{testing?'Checking AI…':'Check AI connection'}</Button>{message&&<p role="status" className="text-sm text-under">{message}</p>}{error&&<p role="alert" className="text-sm text-destructive">{error}</p>}</section></div>;
}
