import { rolesAllowedFor } from './action-permissions';

describe('rolesAllowedFor', () => {
  it.each(['steganography.analyze', 'steganography.results.read'])(
    '%s se permite a ADMIN y ANALYST, nunca a USER',
    (action) => {
      expect(rolesAllowedFor(action)).toEqual(['ADMIN', 'ANALYST']);
    },
  );

  it.each(['steganography.delete', '', 'constructor', '__proto__', 'toString'])(
    'la accion "%s" es desconocida',
    (action) => {
      expect(rolesAllowedFor(action)).toBeUndefined();
    },
  );
});
