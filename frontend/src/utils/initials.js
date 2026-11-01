/** Up to two initials for an avatar: the first letter of the first two words. Words are split on
 *  anything that isn't a letter or digit, so "Msetu / SRM team" gives "MS", not "M/". */
export function initialsOf(name) {
  return String(name || '').split(/[^\p{L}\p{N}]+/u).filter(Boolean).slice(0, 2).map((word) => word[0]).join('').toUpperCase();
}
