export type FolioDirection = 'DEBIT' | 'CREDIT';

export interface FolioAmountLine {
  direction: FolioDirection;
  amountToman: bigint;
}

export interface FolioRunningLine extends FolioAmountLine {
  id: string;
  balanceAfterToman: bigint;
}

function signedAmount({ direction, amountToman }: FolioAmountLine): bigint {
  if (amountToman <= 0n) {
    throw new Error('Folio entries must have a positive integer amount.');
  }
  return direction === 'DEBIT' ? amountToman : -amountToman;
}

export function calculateFolioBalance(lines: readonly FolioAmountLine[]): bigint {
  return lines.reduce((balance, line) => balance + signedAmount(line), 0n);
}

export function withRunningBalances<T extends FolioAmountLine & { id: string }>(
  lines: readonly T[],
): Array<T & { balanceAfterToman: bigint }> {
  let balance = 0n;
  return lines.map((line) => {
    balance += signedAmount(line);
    return { ...line, balanceAfterToman: balance };
  });
}
