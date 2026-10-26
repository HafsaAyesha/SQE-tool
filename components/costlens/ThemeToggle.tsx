'use client';
import { Moon, Sun, Monitor } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
export function ThemeToggle() {
  const { setTheme } = useTheme();
  return <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Choose theme"><Sun className="size-4 dark:hidden"/><Moon className="hidden size-4 dark:block"/></Button></DropdownMenuTrigger><DropdownMenuContent align="end">{[{name:'Light', icon:Sun}, {name:'Dark', icon:Moon}, {name:'System', icon:Monitor}].map(({name,icon:Icon}) => <DropdownMenuItem key={name} onClick={() => setTheme(name.toLowerCase())}><Icon className="size-4"/>{name}</DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu>;
}
