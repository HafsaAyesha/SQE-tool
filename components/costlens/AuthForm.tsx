'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { ArrowRight, LoaderCircle } from 'lucide-react';
import { authSchema, type AuthInput } from '@/lib/auth/schema';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
export function AuthForm({ mode }: { mode: 'login' | 'signup' }) {
  const [feedback, setFeedback] = useState<{ error?: string; message?: string }>({});
  const form = useForm<AuthInput>({ resolver: zodResolver(authSchema), defaultValues: { email: '', password: '' } });
  async function onSubmit(values: AuthInput) {
    setFeedback({});
    let result: {error?:string;message?:string;success?:boolean};
    try {const response=await fetch('/api/auth/authenticate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode,...values})});result=await response.json();}
    catch {result={error:'We could not reach the sign-in service. Please try again.'};}
    if(result.success){window.location.assign('/projects');return;}
    setFeedback(result);
    if (result.error) toast.error(result.error);
    if (result.message) { toast.success(result.message); form.resetField('password'); }
  }
  return <Form {...form}><form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
    <FormField control={form.control} name="email" render={({ field }) => <FormItem><FormLabel>Email</FormLabel><FormControl><Input {...field} type="email" autoComplete="email" placeholder="you@example.com" maxLength={254}/></FormControl><FormMessage/></FormItem>}/>
    <FormField control={form.control} name="password" render={({ field }) => <FormItem><FormLabel>Password</FormLabel><FormControl><Input {...field} type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder="At least 10 characters" maxLength={128}/></FormControl><FormMessage/></FormItem>}/>
    {feedback.error && <p role="alert" className="text-sm text-destructive">{feedback.error}</p>}
    {feedback.message && <p role="status" className="rounded-xl bg-accent p-4 text-sm text-accent-foreground">{feedback.message}</p>}
    <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>{form.formState.isSubmitting ? <LoaderCircle className="animate-spin"/> : <ArrowRight/>}{mode === 'login' ? 'Log in' : 'Create account'}</Button>
    <p className="text-center text-sm text-muted-foreground">{mode === 'login' ? 'New to CostLens? ' : 'Already have an account? '}<Link className="font-medium text-primary underline-offset-4 hover:underline" href={mode === 'login' ? '/signup' : '/login'}>{mode === 'login' ? 'Create an account' : 'Log in'}</Link></p>
  </form></Form>;
}
