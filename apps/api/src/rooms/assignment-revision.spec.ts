import { assignmentRevision } from './assignment-revision';

describe('assignment revisions', () => {
  const first = {
    id: 'first-assignment',
    isActive: true,
    roomId: 'first-room',
    startDate: new Date('2027-01-01'),
    endDate: new Date('2027-01-04'),
  };
  const second = {
    id: 'second-assignment',
    isActive: false,
    roomId: 'second-room',
    startDate: new Date('2027-01-02'),
    endDate: new Date('2027-01-04'),
  };

  it('identifies the same assignment history regardless of row order', () => {
    const revision = assignmentRevision('booking', [first, second]);
    expect(revision).toMatch(/^[0-9a-f]{64}$/);
    expect(assignmentRevision('booking', [second, first])).toBe(revision);
  });

  it('changes when any row, room, effective boundary or active status changes', () => {
    const revision = assignmentRevision('booking', [first, second]);
    for (const changed of [
      { id: 'replacement-history-row' },
      { isActive: true },
      { roomId: 'different-room' },
      { startDate: new Date('2027-01-03') },
      { endDate: new Date('2027-01-05') },
    ]) {
      expect(assignmentRevision('booking', [first, { ...second, ...changed }])).not.toBe(revision);
    }
    expect(assignmentRevision('booking', [first])).not.toBe(revision);
  });

  it('scopes an empty set to its own booking', () => {
    expect(assignmentRevision('first-booking', [])).not.toBe(
      assignmentRevision('other-booking', []),
    );
  });
});
