export function fullName(firstName: string, middleName: string | null, lastName: string): string {
  return [firstName, middleName, lastName].filter((part) => part && part.length > 0).join(' ');
}
