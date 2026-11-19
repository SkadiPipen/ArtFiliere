const symbols = "^$*.[]{}()?-\"!@#%&/\\,><':;|_~`+=";

export function getSignupPasswordError(password: string): string | null {
  if (password.length < 8) return "Use at least 8 characters.";
  if (!/[A-Z]/.test(password)) return "Add an uppercase letter.";
  if (!/[a-z]/.test(password)) return "Add a lowercase letter.";
  if (!/[0-9]/.test(password)) return "Add a number.";
  if (![...password].some((character) => symbols.includes(character))) return "Add a symbol like ! or @.";
  return null;
}
