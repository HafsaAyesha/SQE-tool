import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { monthlyAiUsage } from '@/lib/ai/usage';
import { getMaskingPreference } from '@/lib/ai/preferences';
import { dailyAiRemaining } from '@/lib/security/rateLimit';
import { PageHeader } from '@/components/costlens/PageHeader';
import { AiSettings } from '@/components/costlens/AiSettings';
import { KpiCard } from '@/components/costlens/KpiCard';
import { Sparkles, Gauge, Coins } from 'lucide-react';
export default async function SettingsPage(){
  const supabase=await createClient();const {data:{user},error}=await supabase.auth.getUser();if(error||!user)redirect('/');
  const [usage,preference,quota]=await Promise.allSettled([monthlyAiUsage(user.id),getMaskingPreference(user.id),dailyAiRemaining(user.id)]);
  const available=preference.status==='fulfilled',mask=available?preference.value:true;
  const stats=usage.status==='fulfilled'?usage.value:null,daily=quota.status==='fulfilled'?quota.value:null;
  return <><PageHeader title="Workspace settings" description="Your AI usage and privacy preferences."/><section aria-label="AI usage" className="space-y-4"><h2 className="text-lg font-semibold">AI usage</h2><div className="grid gap-4 sm:grid-cols-3"><KpiCard title="AI calls this month" value={stats?String(stats.calls):'Unavailable'} caption={stats?`${stats.cached} served from cache · UTC calendar month`:'Usage is temporarily unavailable'} icon={Sparkles}/><KpiCard title="Tokens this month" value={stats?new Intl.NumberFormat('en-US').format(stats.tokens):'Unavailable'} caption="Input and output tokens, including retries" icon={Coins}/><KpiCard title="Daily AI quota remaining" value={daily?`${daily.remaining} of ${daily.limit}`:'Unavailable'} caption="Resets at midnight UTC · cached checks count" icon={Gauge}/></div></section><AiSettings key={`${mask}:${available}`} mask={mask} available={available}/></>;
}
