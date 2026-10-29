// Synthetic documents only; no real invoices or personal data.
import {writeFileSync} from 'node:fs';
import {zipSync,strToU8} from 'fflate';
import {PDFDocument,StandardFonts} from 'pdf-lib';
import sharp from 'sharp';
const out=new URL('../tests/fixtures/',import.meta.url);
const save=(name,bytes)=>writeFileSync(new URL(name,out),bytes);
const types=(extra)=>`<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${extra}</Types>`;
const zip=(files)=>zipSync(Object.fromEntries(Object.entries(files).map(([name,text])=>[name,strToU8(text)])));
const paragraph=text=>`<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;
const tr=cells=>`<w:tr>${cells.map(text=>`<w:tc>${paragraph(text)}</w:tc>`).join('')}</w:tr>`;
save('codeaudit-budget.docx',zip({
 '[Content_Types].xml':types('<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'),
 '_rels/.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
 'word/document.xml':`<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraph('CodeAudit budget')}<w:tbl>${tr(['Item','Estimated','Actual'])}${tr(['Cloud hosting','100','80'])}${tr(['Test tooling','200','220'])}</w:tbl>${paragraph('The planned accessibility audit costs USD 75. The team paid USD 40 for domain registration.')}</w:body></w:document>`,
 'word/_rels/document.xml.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>'
}));
const invoice=await PDFDocument.create();const font=await invoice.embedFont(StandardFonts.Helvetica);const page=invoice.addPage([600,800]);
for(const [n,text] of ['CodeAudit invoice','Actual cost paid: Cloud hosting USD 120.00','Actual cost paid: Security review USD 250.00','Invoice date: 2026-10-01'].entries())page.drawText(text,{x:40,y:740-n*40,font,size:16});
const invoiceBytes=await invoice.save();save('codeaudit-invoice.pdf',invoiceBytes);
const receiptSvg=`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000"><rect width="100%" height="100%" fill="white"/><g font-family="sans-serif" font-size="30" fill="black"><text x="70" y="100">CodeAudit receipt</text><text x="70" y="180">PAID - actual costs (USD)</text><text x="70" y="270">Domain registration     25.00</text><text x="70" y="340">Test cloud credits        22.50</text><text x="70" y="440">TOTAL PAID                 47.50</text><text x="70" y="540">2026-10-01</text></g></svg>`;
const receipt=await sharp(Buffer.from(receiptSvg)).jpeg({quality:95}).toBuffer();save('receipt.jpg',receipt);
const scan=await PDFDocument.create();const photo=await scan.embedJpg(receipt);scan.addPage([600,750]).drawImage(photo,{x:0,y:0,width:600,height:750});save('codeaudit-scan.pdf',await scan.save());
const aP=text=>`<a:p><a:r><a:t>${text}</a:t></a:r></a:p>`;
const slideTable=`<a:tbl><a:tblPr/><a:tblGrid><a:gridCol w="2000"/><a:gridCol w="2000"/><a:gridCol w="2000"/></a:tblGrid>${[['Item','Estimated','Actual'],['API integration','300','350']].map(cells=>`<a:tr h="1000">${cells.map(text=>`<a:tc><a:txBody><a:bodyPr/><a:lstStyle/>${aP(text)}</a:txBody><a:tcPr/></a:tc>`).join('')}</a:tr>`).join('')}</a:tbl>`;
save('budget-slide.pptx',zip({
 '[Content_Types].xml':types('<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>'),
 '_rels/.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>',
 'ppt/presentation.xml':'<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst></p:presentation>',
 'ppt/_rels/presentation.xml.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>',
 'ppt/slides/slide1.xml':`<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody><a:bodyPr/><a:lstStyle/>${aP('CodeAudit planned presentation design costs USD 90.')}</p:txBody></p:sp><p:graphicFrame><a:graphic><a:graphicData>${slideTable}</a:graphicData></a:graphic></p:graphicFrame></p:spTree></p:cSld></p:sld>`
}));
save('invoice-email.eml',Buffer.from(['From: billing@example.test','To: costs@example.test','Subject: CodeAudit invoice','MIME-Version: 1.0','Content-Type: multipart/mixed; boundary="codeaudit-boundary"','','--codeaudit-boundary','Content-Type: text/plain; charset=utf-8','','The team paid USD 15 for delivery. Invoice attached.','--codeaudit-boundary','Content-Type: application/pdf; name="codeaudit-invoice.pdf"','Content-Disposition: attachment; filename="codeaudit-invoice.pdf"','Content-Transfer-Encoding: base64','',Buffer.from(invoiceBytes).toString('base64').match(/.{1,76}/g).join('\r\n'),'--codeaudit-boundary--',''].join('\r\n')));
console.log('Created six synthetic unstructured document fixtures.');
