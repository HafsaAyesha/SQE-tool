import { Check } from 'lucide-react';
const steps = ['Source', 'Mapping', 'Preview', 'Done'] as const;
export function Stepper({ currentStep = 0 }: { currentStep?: number }) {
  return <ol aria-label="Import progress" className="grid grid-cols-4 gap-2 rounded-2xl border bg-card p-4 sm:p-6">{steps.map((step, index) => <li key={step} aria-current={currentStep === index ? 'step' : undefined} className={`flex flex-col items-center gap-2 text-xs sm:flex-row sm:text-sm ${index <= currentStep ? 'font-medium text-foreground' : 'text-muted-foreground'}`}><span className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs ${index <= currentStep ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>{index < currentStep ? <Check className="size-4"/> : index + 1}</span>{step}</li>)}</ol>;
}
