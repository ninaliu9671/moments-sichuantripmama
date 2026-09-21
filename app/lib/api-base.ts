export function apiUrl(path: string) {
  return path.startsWith('/') ? path : `/${path}`;
}

export function apiCredentials(): RequestCredentials {
  return 'same-origin';
}
