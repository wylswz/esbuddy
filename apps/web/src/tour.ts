// The guided tour is shown once per browser; remembered here, not per canvas.

const STORAGE_KEY = 'esbuddy.tour.done';

export function isTourDone(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return true;
  }
}

export function markTourDone(): void {
  try {
    localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    // ignore storage errors
  }
}
