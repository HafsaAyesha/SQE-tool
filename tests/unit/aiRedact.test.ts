import { describe,expect,it } from 'vitest';
import { redactPersonalData } from '@/lib/ai/redact';
describe('AI personal-data masking',()=>{
  it('replaces emails, local/international phones, IBANs, cards and street addresses',()=>{
    const cases=[['alice+cost@example.com','[EMAIL]'],['+92 300 1234567','[PHONE]'],['(212) 555-0199','[PHONE]'],['03001234567','[PHONE]'],['GB82 WEST 1234 5698 7654 32','[IBAN]'],['DE89370400440532013000','[IBAN]'],['4111 1111 1111 1111','[CARD_NUMBER]'],['221B Baker Street','[ADDRESS]'],['123 Main Street, Apt 4','[ADDRESS]'],['House 12, Street 5, Block D','[ADDRESS]']];
    for(const [input,expected]of cases)expect(redactPersonalData(input),input).toBe(expected);
  });
  it('bounds email matching on large non-email input and masks adjacent phone numbers',()=>{
    const text='a'.repeat(100000);expect(redactPersonalData(text)).toBe(text);
    expect(redactPersonalData('03001234567 03007654321')).toBe('[PHONE] [PHONE]');
  });
  it('keeps cost amounts/dates, is deterministic and does not retain a value map',()=>{
    const input='Cloud USD 1,234.50 on 2026-10-27. Actual 123456789.00.';
    expect(redactPersonalData(input)).toBe(input);
    const masked=redactPersonalData('alice@example.com paid $12.50');expect(redactPersonalData(masked)).toBe(masked);
  });
});
