'use client';
import { useState, useTransition } from 'react';
import { Menu, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { signOut } from '@/app/(auth)/actions';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle, SheetTrigger, SheetDescription } from '@/components/ui/sheet';
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuTrigger, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { ThemeToggle } from './ThemeToggle';
import type { ProjectOption } from '@/lib/projects/schema';
import { ProjectSwitcher } from './ProjectSwitcher';
import { Sidebar } from './Sidebar';
export function TopBar({ email, guest = false, projects }: { email: string; guest?: boolean; projects: ProjectOption[] }) {
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  return <header className="flex h-20 shrink-0 items-center justify-between gap-3 border-b bg-background px-4 sm:px-8"><div className="flex min-w-0 items-center gap-3"><Sheet open={open} onOpenChange={setOpen}><SheetTrigger asChild><Button variant="ghost" size="icon" className="md:hidden" aria-label="Open navigation"><Menu/></Button></SheetTrigger><SheetContent side="left" className="w-72 p-0"><SheetTitle className="sr-only">Workspace navigation</SheetTitle><SheetDescription className="sr-only">Navigate your CostLens workspace.</SheetDescription><Sidebar onNavigate={() => setOpen(false)}/></SheetContent></Sheet><ProjectSwitcher projects={projects}/><span className="hidden text-xs text-muted-foreground lg:block">Your cost workspace</span></div><div className="flex shrink-0 items-center gap-2"><ThemeToggle/><DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" size="icon" className="rounded-full" aria-label="User menu"><UserRound className="size-4"/></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuLabel className="max-w-64 truncate">{email}</DropdownMenuLabel>{guest ? <p className="max-w-64 px-2 pb-2 text-xs text-muted-foreground">Your projects are saved to this browser&apos;s guest session.</p> : <><DropdownMenuSeparator/><DropdownMenuItem disabled={pending} onSelect={() => startTransition(async () => { const result = await signOut(); if (result.error) toast.error(result.error); })}>{pending ? 'Signing out…' : 'Sign out'}</DropdownMenuItem></>}</DropdownMenuContent></DropdownMenu></div></header>;
}
