export function PageHeader({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><h1 className="break-words text-3xl font-semibold tracking-tight">{title}</h1>{description && <p className="mt-2 text-muted-foreground">{description}</p>}</div>{action && <div>{action}</div>}</div>;
}
