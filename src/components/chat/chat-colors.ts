/** Name/avatar accents, picked deterministically so a player keeps their colour.
 *  Mostly white like the reference, with the odd gold/pink/blue highlight. */
const ACCENTS = ['#f7c948', '#eef1f5', '#eef1f5', '#c3cad6', '#f472b6', '#eef1f5', '#9ecbff']

export function chatAccent(id: string): string {
  let hash = 0
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) >>> 0
  }
  return ACCENTS[hash % ACCENTS.length]
}
