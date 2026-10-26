'use client';
import { useState } from 'react';
import { Menu, ChevronsUpDown, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle, SheetTrigger, SheetDescription } from '@/components/ui/sheet';
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ThemeToggle } from './ThemeToggle';
import { Sidebar } from './Sidebar';
export function TopBar() {
  const [open, setOpen] = useState(false);
  return <header className="flex h-20 shrink-0 items-center justify-between gap-3 border-b bg-background px-4 sm:px-8"><div className="flex min-w-0 items-center gap-3"><Sheet open={open} onOpenChange={setOpen}><SheetTrigger asChild><Button variant="ghost" size="icon" className="md:hidden" aria-label="Open navigation"><Menu/></Button></SheetTrigger><SheetContent side="left" className="w-72 p-0"><SheetTitle className="sr-only">Workspace navigation</SheetTitle><SheetDescription className="sr-only">Navigate your CostLens workspace.</SheetDescription><Sidebar onNavigate={() => setOpen(false)}/></SheetContent></Sheet><Button variant="outline" disabled className="max-w-full gap-3"><span className="truncate">Select a project</span><ChevronsUpDown className="size-4 shrink-0"/></Button><span className="hidden text-xs text-muted-foreground lg:block">Your cost workspace</span></div><div className="flex shrink-0 items-center gap-2"><ThemeToggle/><DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" size="icon" className="rounded-full" aria-label="User menu"><UserRound className="size-4"/></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuLabel>Guest workspace</DropdownMenuLabel><p className="max-w-56 px-2 pb-2 text-xs text-muted-foreground">Account controls will be available after authentication is connected.</p></DropdownMenuContent></DropdownMenu></div></header>;
}
