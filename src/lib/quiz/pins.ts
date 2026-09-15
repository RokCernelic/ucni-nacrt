/** Naključni 4-mestni PIN-i učencev (1000–9999, brez vodilne ničle), edinstveni znotraj razreda. */

const TRIVIAL = new Set(['1234', '4321', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999', '1000', '2000', '9876']);

export function generatePin(taken: Set<string>, rand: () => number = Math.random): string {
  for (let i = 0; i < 10000; i++) {
    const pin = String(1000 + Math.floor(rand() * 9000));
    if (!taken.has(pin) && !TRIVIAL.has(pin)) return pin;
  }
  throw new Error('Ni več prostih PIN-ov');
}

/** Dodeli PIN vsem, ki ga še nimajo. Obstoječi PIN-i se nikoli ne spremenijo. */
export function withPins<T extends { pin?: string }>(students: T[], rand: () => number = Math.random): T[] {
  const taken = new Set(students.map(s => s.pin).filter((p): p is string => !!p));
  return students.map(s => {
    if (s.pin) return s;
    const pin = generatePin(taken, rand);
    taken.add(pin);
    return { ...s, pin };
  });
}
