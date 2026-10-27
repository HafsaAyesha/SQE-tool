import { decodeText, guardedAdapter } from '@/lib/security/fileGuard';
import { ImportError } from '../errors';
import { inputBytes, inputName, objectRecord, tableFromRecords } from '../table';
import { parseXmlText } from './xml';
function currency(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' && typeof value !== 'number') throw new ImportError('A Microsoft Project cost value is invalid. Export the project again.');
  const number = Number(value);
  if (!Number.isFinite(number)) throw new ImportError('A Microsoft Project cost value is not a valid number.');
  return number / 100;
}
export const msprojectAdapter = guardedAdapter({ id: 'msproject', label: 'MS Project XML', icon: 'ListTree', kind: 'structured', accepts: { extensions: ['.xml'], mimeTypes: ['application/xml', 'text/xml'] }, async parse(input, options) {
  const root = parseXmlText(decodeText(await inputBytes(input)));
  if (!objectRecord(root) || !objectRecord(root.Project) || !objectRecord(root.Project.Tasks)) throw new ImportError('No Microsoft Project task table was found in this XML.');
  const raw = root.Project.Tasks.Task;
  const tasks = Array.isArray(raw) ? raw : [raw];
  const rows = tasks.filter(objectRecord).filter(task => String(task.UID ?? '') !== '0').map(task => {
    const baselines = Array.isArray(task.Baseline) ? task.Baseline : task.Baseline ? [task.Baseline] : [];
    const baseline = baselines.find(value => objectRecord(value) && String(value.Number ?? '0') === '0');
    return { Name: task.Name ?? '', WBS: task.WBS ?? null, OutlineLevel: task.OutlineLevel ?? null, BaselineCost: currency(task.BaselineCost ?? (objectRecord(baseline) ? baseline.Cost : null)), ActualCost: currency(task.ActualCost), Cost: currency(task.Cost), Start: task.Start ?? null };
  });
  return tableFromRecords(rows, { sourceType: 'msproject', fileName: inputName(input, options), warnings: ['MS Project monetary values were converted from hundredths by dividing by 100. Project summary task UID 0 is excluded; review other summary tasks before mapping.'] });
} }, ['msproject']);
