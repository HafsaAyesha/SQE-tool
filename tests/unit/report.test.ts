import {expect,it} from 'vitest';
import {unzipSync} from 'fflate';
import ExcelJS from 'exceljs';
import Papa from 'papaparse';
import {reportModel} from '@/lib/report/model';
import {reportOptions} from '@/lib/report/options';
import {reportCsv} from '@/lib/report/csv';
import {reportWorkbook} from '@/lib/report/excel';
import {reportChartImages,reportChartSvg} from '@/lib/report/charts';
import {reportPdf} from '@/lib/report/pdf';
import {readPdf} from '@/lib/import/pdfDocument';
import type {CostTableRow} from '@/lib/costs/types';
const rows:CostTableRow[]=[{id:'a',item:'AI API',group:'Build',category:'AI',estimated:100,actual:300,currency:'USD',date:'2026-10-01',notes:'Check invoice',sourceRef:'00:15',confidence:.9,sourceId:null,sourceName:null,type:'manual'},{id:'b',item:' =HYPERLINK("https://example.test","bad")',group:'+cmd',category:'Tools',estimated:0,actual:20,currency:'USD',date:'2026-10-02',notes:'\t@SUM(A1:A9)',sourceRef:'-region',confidence:null,sourceId:null,sourceName:null,type:'manual'},{id:'c',item:'Missing actual',group:'Build',category:'Tools',estimated:50,actual:null,currency:'USD',date:null,notes:null,sourceRef:null,confidence:null,sourceId:null,sourceName:null,type:'manual'}];
const model=reportModel({name:'CodeAudit',currency:'USD',ownerEmail:'owner@example.test',rows,options:reportOptions(new URLSearchParams()),generatedAt:'2026-10-28T00:00:00Z'});
it('exports computed CSV with literal formula-like text, null percentages and decimal-safe totals',()=>{
 const parsed=Papa.parse<string[]>(reportCsv(model),{skipEmptyLines:true}).data;expect(parsed[0]).toContain('% Variance');expect(parsed[1][5]).toBe('200');expect(parsed[1][6]).toBe('200');expect(parsed[2][0]).toMatch(/^'/);expect(parsed[2][1]).toBe("'+cmd");expect(parsed[2][6]).toBe('n/a');expect(parsed[2][13]).toMatch(/^'/);expect(model.totals.estimated).toBe(150);expect(model.totals.actual).toBe(320);
});
it('writes five styled/frozen Excel sheets with working formula references and safe literal strings',async()=>{
 const output=await reportWorkbook(model).xlsx.writeBuffer(),book=new ExcelJS.Workbook();await book.xlsx.load(output);expect(book.worksheets.map(sheet=>sheet.name)).toEqual(['Summary','Costs','By group','By category','Anomalies']);
 const costs=book.getWorksheet('Costs')!;expect(costs.getCell('F2').formula).toBe('IF(OR(D2="",E2=""),"",E2-D2)');expect(costs.getCell('F2').result).toBe(200);expect(costs.getCell('G2').result).toBe(2);expect(costs.getCell('G3').result).toBe('n/a');expect(costs.getCell('F4').result??'').toBe('');expect(costs.getCell('A3').value).toMatch(/^'/);expect(costs.getCell('A3').formula).toBeUndefined();expect(costs.views[0]).toMatchObject({state:'frozen',ySplit:1});expect(costs.getRow(1).fill).toMatchObject({type:'pattern'});expect(costs.getCell('G2').numFmt).toContain('%');expect(Buffer.from(unzipSync(new Uint8Array(output))['xl/workbook.xml']).toString()).toContain('fullCalcOnLoad="1"');
});
it('renders the four real Recharts SVGs and a paginated branded PDF with text and appendix',async()=>{
 for(const kind of model.options.charts)expect(await reportChartSvg(kind,model)).toContain('<svg');const images=await reportChartImages(model);expect(Object.keys(images)).toHaveLength(4);for(const image of Object.values(images))expect(image!.subarray(1,4).toString()).toBe('PNG');
 const bytes=await reportPdf(model,images);expect(bytes.subarray(0,5).toString()).toBe('%PDF-');const pdf=await readPdf(bytes);expect(pdf.units).toBeGreaterThanOrEqual(5);const text=pdf.pages.map(page=>page.text).join('\n');for(const expected of ['CostLens','CodeAudit','owner@example.test','Variance by group','Variance by category','Anomalies','Appendix','AI API'])expect(text).toContain(expected);
},60000);
it('rejects invalid report options and preserves explicit chart/section selections',()=>{
 expect(()=>reportOptions(new URLSearchParams('charts=not-a-chart'))).toThrow();expect(reportOptions(new URLSearchParams('charts=estimated,burn&table=0&anomalies=0'))).toMatchObject({charts:['estimated','burn'],includeTable:false,includeAnomalies:false,includeAi:false});
});
