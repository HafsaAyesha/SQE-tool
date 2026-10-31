import { redirect } from 'next/navigation';
// Login was removed: visitors get a guest workspace automatically (see lib/supabase/middleware.ts).
export default function Page() { redirect('/projects'); }
