/**
 * Client-side password strength validation.
 * Free-tier alternative to Supabase's "Leaked Password Protection" (Pro-only).
 * Blocks top 200+ most common leaked passwords.
 */

const COMMON_PASSWORDS = new Set([
  // Top 200+ most common passwords from breach databases
  "123456", "password", "12345678", "qwerty", "123456789", "12345", "1234",
  "111111", "1234567", "dragon", "123123", "baseball", "abc123", "football",
  "monkey", "letmein", "shadow", "master", "666666", "qwertyuiop", "123321",
  "mustang", "1234567890", "michael", "654321", "superman", "1qaz2wsx",
  "7777777", "121212", "000000", "qazwsx", "123qwe", "killer", "trustno1",
  "jordan", "jennifer", "zxcvbnm", "asdfgh", "hunter", "buster", "soccer",
  "harley", "batman", "andrew", "tigger", "sunshine", "iloveyou", "2000",
  "charlie", "robert", "thomas", "hockey", "ranger", "daniel", "starwars",
  "klaster", "112233", "george", "computer", "michelle", "jessica", "pepper",
  "1111", "zxcvbn", "555555", "11111111", "131313", "freedom", "777777",
  "pass", "maggie", "159753", "aaaaaa", "ginger", "princess", "joshua",
  "cheese", "amanda", "summer", "love", "ashley", "nicole", "chelsea",
  "biteme", "matthew", "access", "yankees", "987654321", "dallas", "austin",
  "thunder", "taylor", "matrix", "mobilemail", "mom", "monitor", "monitoring",
  "montana", "moon", "moscow", "welcome", "welcome1", "password1", "password123",
  "admin", "admin123", "root", "toor", "pass123", "pass1234", "p@ssw0rd",
  "passw0rd", "password!", "hello", "hello123", "lovely", "sunshine1",
  "princess1", "football1", "charlie1", "donald", "password2", "qwerty123",
  "letmein1", "baseball1", "iloveyou1", "master1", "monkey1", "dragon1",
  "login", "abc1234", "starwars1", "123abc", "abcdef", "abcdefg",
  "trustno1!", "batman1", "superman1", "whatever", "qwert", "qwerty1",
  "myspace1", "fuckyou", "fuckyou1", "test", "test123", "test1234",
  "123test", "fuck", "google", "google1", "lakers", "michael1",
  "internet", "internet1", "sexy", "jesus", "jesus1", "money", "money1",
  "pepper1", "daniel1", "0987654321", "computer1", "twitter", "twitter1",
  "soccer1", "hockey1", "ranger1", "samsung", "samsung1", "steelers",
  "joseph", "blink182", "asdfghjkl", "asdf", "asdf1234", "1q2w3e4r",
  "1q2w3e", "1q2w3e4r5t", "zaq1zaq1", "qwer1234", "q1w2e3r4",
  "pa$$word", "pa$$w0rd", "passpass", "changeme", "changeme1",
  "default", "guest", "guest123", "guest1", "flower", "flower1",
  "diamond", "angel", "angel1", "angels", "anthony", "friends",
  "butterfly", "purple", "purple1", "peanut", "peanut1", "bubbles",
  "11111", "22222", "33333", "44444", "55555", "99999", "88888",
  "00000", "aaa111", "abc111", "matrix1", "cookie", "cookie1",
  "chicken", "chicken1", "george1", "andrea", "junior", "junior1",
  "college", "college1", "america", "america1", "crystal", "crystal1",
  "oliver", "sophie", "william", "patricia", "elizabeth", "richard",
  "qazxsw", "zxcasd", "123654", "456789", "321654", "147258",
  "741852", "963852", "852963", "159357", "abcd1234", "aaaa1111",
]);

export type PasswordStrength = "weak" | "fair" | "strong";

export interface PasswordCheck {
  strength: PasswordStrength;
  errors: string[];
}

export function checkPasswordStrength(password: string): PasswordCheck {
  const errors: string[] = [];

  if (password.length < 6) errors.push("At least 6 characters required");
  if (COMMON_PASSWORDS.has(password.toLowerCase())) errors.push("This password is too common — pick something unique");
  if (password.length >= 6 && !/[A-Z]/.test(password) && !/\d/.test(password))
    errors.push("Add a number or uppercase letter for a stronger password");

  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasDigit = /\d/.test(password);
  const hasSpecial = /[^a-zA-Z0-9]/.test(password);
  const variety = [hasUpper, hasLower, hasDigit, hasSpecial].filter(Boolean).length;

  let strength: PasswordStrength = "weak";
  if (errors.length === 0 && password.length >= 8 && variety >= 3) strength = "strong";
  else if (errors.filter(e => !e.includes("stronger")).length === 0 && password.length >= 6) strength = "fair";

  return { strength, errors: errors.filter(e => !e.includes("stronger") || strength === "weak") };
}
