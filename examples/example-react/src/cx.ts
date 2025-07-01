export function cx(...classes: (string | undefined | false | null)[]) {
  return classes.filter(Boolean).join(' ');
}
