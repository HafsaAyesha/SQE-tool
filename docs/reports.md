# Reports — Step 2.6

`/projects/[id]/report` is linked from the dashboard Export menu and keeps source/category/group/search/date filters. The preview has AI, anomaly, full-PDF-table and chart options. Its chart components are the dashboard's components. The PDF uses the same Recharts primitives at fixed dimensions with print colours, rasterized in memory with Sharp. Uploaded SVG and client-supplied chart URLs are never accepted.

All downloads call requireProject and the distributed report limiter (10 per ten minutes per verified owner):

- GET `/api/projects/[id]/report.pdf`
- GET `/api/projects/[id]/report.xlsx`
- GET `/api/projects/[id]/report.csv`

Responses are private/no-store attachments. Options are Zod-validated and source rows are always loaded under RLS. A GET cannot silently generate a paid AI summary: enable and generate the AI section explicitly in the preview first. PDF/Excel downloads read the current validated cache via the safe gateway; a miss or a changed data snapshot asks for regeneration. CSV never invokes AI. AI text includes its disclaimer and generation timestamp.

PDF pages include local licensed Inter fonts, branded cover/owner/date/sources, KPIs, chart images, group and category variance tables, deterministic anomalies and available AI explanations, recommendations, and an optional full cost appendix. Page numbers and confidential-data footers repeat. Undated data receives an explanatory time-chart placeholder. Chart print limits are disclosed; complete group/category data remains in the tables. Other-currency rows stay in the appendix and exports while monetary aggregates use the project currency.

Excel has Summary, Costs, By group, By category and Anomalies sheets. It writes literal escaped user/AI strings, styled headers, frozen header rows and money/percentage/date formats. Variance and percentage cells contain IF-guarded Excel formulas with calc.ts-derived cached results. Full recalculation is requested in the workbook XML so edits recalculate in Excel. The ExcelJS reader does not retain every calculation-property attribute, so tests inspect the OOXML itself. CSV includes the computed table and UTF-8 BOM; formula-like text is escaped while numeric negative costs remain numbers.

The HTML preview shows up to 500 appendix rows; downloads contain every selected row. A 10,000-item project guard prevents unbounded in-function export work. Live Excel desktop opening is not available in this environment; generated workbooks are round-tripped through ExcelJS and formula references, cached results, literal-cell types and OOXML recalculation settings are checked. PDF tests verify page text and raster chart output. Browser tests download actual files in both viewports.
