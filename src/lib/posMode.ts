export function getPosMode(): 'HOST' | 'CLIENT' | null {
  return localStorage.getItem('pos_mode') as any;
}

export function isHost(): boolean {
  return getPosMode() === 'HOST';
}

export function isClient(): boolean {
  return getPosMode() === 'CLIENT';
}
