/**
 * Quote a literal argument for a POSIX shell, including embedded single quotes.
 * @param value The literal argument.
 * @returns The quoted argument.
 */
export const quoteShellArg = (value: string): string => `'${value.replace(/'/g, "'\\''")}'`;
