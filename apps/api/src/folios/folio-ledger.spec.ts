import { calculateFolioBalance, withRunningBalances } from './folio-ledger';

describe('folio ledger arithmetic', () => {
  it('calculates debits minus credits with BigInt only', () => {
    expect(
      calculateFolioBalance([
        { direction: 'DEBIT', amountToman: 125_000n },
        { direction: 'CREDIT', amountToman: 25_000n },
        { direction: 'DEBIT', amountToman: 3_000_000_000_000_001n },
      ]),
    ).toBe(3_000_000_000_100_001n);
  });

  it('returns stable running balances in posting order', () => {
    expect(
      withRunningBalances([
        { id: 'a', direction: 'DEBIT', amountToman: 40n },
        { id: 'b', direction: 'CREDIT', amountToman: 10n },
        { id: 'c', direction: 'CREDIT', amountToman: 5n },
      ]),
    ).toEqual([
      { id: 'a', direction: 'DEBIT', amountToman: 40n, balanceAfterToman: 40n },
      { id: 'b', direction: 'CREDIT', amountToman: 10n, balanceAfterToman: 30n },
      { id: 'c', direction: 'CREDIT', amountToman: 5n, balanceAfterToman: 25n },
    ]);
  });

  it('rejects zero or negative ledger amounts', () => {
    expect(() => calculateFolioBalance([{ direction: 'DEBIT', amountToman: 0n }])).toThrow(
      'Folio entries must have a positive integer amount.',
    );
    expect(() => calculateFolioBalance([{ direction: 'CREDIT', amountToman: -1n }])).toThrow(
      'Folio entries must have a positive integer amount.',
    );
  });
});
