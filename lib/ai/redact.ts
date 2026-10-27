/** Best-effort text masking, not an anonymisation guarantee. No original-value map is retained. */
export function redactPersonalData(input: string): string {
  let text=input.replace(/(?<![A-Z0-9.!#$%&'*+/=?^_`{|}~-])[A-Z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[A-Z0-9](?:[A-Z0-9.-]{0,251}[A-Z0-9])?\.[A-Z]{2,63}/gi,'[EMAIL]');
  const ibanLengths:Record<string,number>={GB:22,DE:22,FR:27,PK:24,AE:23,NL:18,IT:27,ES:24,SA:24,CH:21,BE:16,AT:20,IE:22,PT:25,TR:26,QA:29,PL:28,SE:24,NO:15,DK:18,FI:18};
  for(const [country,length] of Object.entries(ibanLengths))text=text.replace(new RegExp(`\\b${country}\\d{2}(?:[ -]?[A-Z0-9]){${length-4}}\\b`,'gi'),'[IBAN]');
  text=text.replace(/\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/gi,'[IBAN]');
  text=text.replace(/\b(?:\d[ -]?){12,18}\d\b/g,'[CARD_NUMBER]');
  text=text.replace(/\b(?:House|Flat|Apartment|Unit|Plot)[ \t]*#?[ \t]*\d+[A-Z]?(?:[, \t]+(?:Street|St|Road|Rd|Block|Sector|Phase)[ \t]+[A-Z0-9-]+){1,4}\b/gi,'[ADDRESS]');
  text=text.replace(/\b\d{1,6}[A-Z]?[ \t]+(?:[\p{L}\d][\p{L}\d.'-]*[ \t]+){0,7}(?:Street|St|Road|Rd|Avenue|Ave|Lane|Ln|Drive|Dr|Boulevard|Blvd|Way|Court|Ct|Close|Crescent|Terrace|Place|Pl)\b\.?([, \t]+(?:Apt|Suite|Unit|Flat)[ \t#]*[A-Z0-9-]+)?/giu,'[ADDRESS]');
  text=text.replace(/(?<![\w])\+?\(?\d[\d () .-]{7,}\d\)?(?![\w])/g,value=>{
    const digits=value.replace(/\D/g,'');
    if(digits.length>15)return value.replace(/\b\d{10,15}\b/g,'[PHONE]');
    if(digits.length<10||/^\d{4}-\d{2}-\d{2}$/.test(value)||/^\d+\.\d{1,2}$/.test(value))return value;
    return '[PHONE]';
  });
  return text;
}
