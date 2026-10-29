import React from 'react';
import sharp from 'sharp';
import type {ReportModel} from './model';
import type {ReportChart} from './options';
const colors=['#4F46E5','#059669','#D97706','#0891B2','#7C3AED','#E11D48','#475569'];
/** Fixed dimensions, disabled animation and literal print colours make the same
 * Recharts primitives usable without a browser or untrusted uploaded SVG. */
export async function reportChartSvg(kind:ReportChart,model:ReportModel){
 const {BarChart,Bar,XAxis,YAxis,CartesianGrid,Legend,ReferenceLine,LineChart,Line,PieChart,Pie,Cell}=await import(/* webpackIgnore: true */ 'recharts');
 const grid=<CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3"/>,axis={tick:{fontSize:10,fill:'#475569'},axisLine:{stroke:'#cbd5e1'},tickLine:false};let chart:React.ReactNode;
 if(kind==='estimated')chart=<BarChart width={720} height={280} data={model.groups.slice(0,12)} margin={{top:18,right:16,bottom:28,left:10}}>{grid}<XAxis dataKey="key" {...axis} interval={0}/><YAxis {...axis} width={68}/><Legend/><Bar dataKey="estimated" name="Estimated" fill={colors[0]} isAnimationActive={false}/><Bar dataKey="actual" name="Actual" fill={colors[1]} isAnimationActive={false}/></BarChart>;
 else if(kind==='variance')chart=<BarChart width={720} height={280} layout="vertical" data={[...model.categories].filter(row=>row.variancePct!==null).sort((a,b)=>b.variancePct!-a.variancePct!).slice(0,10)} margin={{top:10,right:35,bottom:16,left:10}}>{grid}<XAxis type="number" unit="%" {...axis}/><YAxis type="category" dataKey="key" width={160} {...axis}/><ReferenceLine x={0} stroke="#475569"/><Bar dataKey="variancePct" name="Variance %" isAnimationActive={false}>{[...model.categories].filter(row=>row.variancePct!==null).sort((a,b)=>b.variancePct!-a.variancePct!).slice(0,10).map(row=><Cell key={row.key} fill={row.variancePct!>0?'#E11D48':'#059669'}/>)}</Bar></BarChart>;
 else if(kind==='burn')chart=<LineChart width={720} height={280} data={model.cumulative} margin={{top:18,right:16,bottom:16,left:10}}>{grid}<XAxis dataKey="date" {...axis}/><YAxis width={68} {...axis}/><Legend/><Line dataKey="cumEstimated" name="Cumulative estimated" stroke={colors[0]} dot={false} strokeWidth={2} isAnimationActive={false}/><Line dataKey="cumActual" name="Cumulative actual" stroke={colors[1]} dot={false} strokeWidth={2} isAnimationActive={false}/></LineChart>;
 else {const data=model.categories.filter(row=>row.actual>0);chart=<PieChart width={720} height={280}><Pie data={data} dataKey="actual" nameKey="key" innerRadius={64} outerRadius={108} cx={240} cy={130} isAnimationActive={false}>{data.map((row,index)=><Cell key={row.key} fill={colors[index%colors.length]}/>)}</Pie><Legend layout="vertical" align="right" verticalAlign="middle"/></PieChart>;}
 const {renderToStaticMarkup}=await import(/* webpackIgnore: true */ 'react-dom/server');
 const markup=renderToStaticMarkup(<>{chart}</>),svg=markup.match(/<svg\b[\s\S]*?<\/svg>/)?.[0];
 if(!svg)throw new Error('The report chart could not be rendered.');
 return /<svg[^>]*xmlns=/.test(svg)?svg:svg.replace('<svg ','<svg xmlns="http://www.w3.org/2000/svg" ');
}
export async function reportChartImages(model:ReportModel){
 const entries=await Promise.all(model.options.charts.map(async kind=>[kind,await sharp(Buffer.from(await reportChartSvg(kind,model))).resize(1440,560).png().toBuffer()] as const));return Object.fromEntries(entries) as Partial<Record<ReportChart,Buffer>>;
}
