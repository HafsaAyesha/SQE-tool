import {escapeFormula} from '@/lib/security/sanitize';
import type {ReportModel} from './model';
function cell(value:unknown){if(value==null)return '';const text=typeof value==='number'?String(value):escapeFormula(String(value));return /[",\r\n]/.test(text)?'"'+text.replace(/"/g,'""')+'"':text;}
export function reportCsv(model:ReportModel){
 const rows:unknown[][]=[['Item','Group','Category','Estimated','Actual','Variance','% Variance','Status','Date','Source','Currency','Source reference','Confidence','Notes'],...model.computed.map(row=>[row.item,row.group,row.category,row.estimated,row.actual,row.variance,row.variancePct??'n/a',row.status,row.date,row.sourceName??(row.sourceId===null?'Manual':row.type),row.currency,row.sourceRef,row.confidence,row.notes])];
 return '\ufeff'+rows.map(row=>row.map(cell).join(',')).join('\r\n')+'\r\n';
}
