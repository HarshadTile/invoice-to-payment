"""The rules every new password must meet (staff setup / reset and supplier setup).

Existing passwords keep working; the rules apply whenever a password is set. They follow the
usual corporate VAPT checklist: a minimum length, a mix of character types, and no common or
personal passwords. Every rule's message is shown to the person setting the password.
"""
import re

MIN_LENGTH = 12
MAX_LENGTH = 64
MAX_BYTES = 72  # bcrypt ignores anything beyond this, so longer would give a false sense of strength
MIN_CHARACTER_TYPES = 3

# Passwords (and stems) that attackers try first. A password is rejected when, ignoring case,
# it equals one of these, or is one of these with digits / symbols added before or after
# ("Password@123", "Welcome2026!", "Mahindra#1").
COMMON = {
    "password", "passw0rd", "p@ssword", "p@ssw0rd", "pass", "passcode", "welcome", "welcome1", "letmein",
    "admin", "administrator", "root", "user", "guest", "login", "default", "changeme", "secret",
    "qwerty", "qwertyuiop", "asdfgh", "asdfghjkl", "zxcvbnm", "abc", "abcd", "abcdef", "abcdefgh",
    "iloveyou", "monkey", "dragon", "sunshine", "princess", "football", "cricket", "master", "superman",
    "india", "bharat", "mumbai", "delhi", "pune", "chennai", "hello", "test", "testing", "demo", "temp",
    "mahindra", "mahindr@", "m&m", "mandm", "techmahindra", "invoice", "payment", "supplier", "vendor",
    "company", "summer", "winter", "spring", "autumn", "monday", "january", "december",
    "123456", "1234567", "12345678", "123456789", "1234567890", "111111", "000000", "121212", "654321",
}
_TYPES = (re.compile(r"[a-z]"), re.compile(r"[A-Z]"), re.compile(r"[0-9]"), re.compile(r"[^A-Za-z0-9]"))
_EDGES = re.compile(r"^[^A-Za-z]+|[^A-Za-z]+$")
_SEQUENCES = ("0123456789", "abcdefghijklmnopqrstuvwxyz", "qwertyuiop", "asdfghjkl", "zxcvbnm")

RULES_TEXT = (f"{MIN_LENGTH}-{MAX_LENGTH} characters, with at least {MIN_CHARACTER_TYPES} of: "
              "uppercase, lowercase, number, symbol. Avoid common words and your own name or email.")


def _personal_words(personal: list[str | None]) -> set[str]:
    words = set()
    for value in personal:
        for part in re.split(r"[^a-z0-9]+", (value or "").lower()):
            if len(part) >= 4:
                words.add(part)
    return words


def _is_sequence(text: str) -> bool:
    lowered = text.lower()
    return len(lowered) >= 6 and any(lowered in seq or lowered in seq[::-1] for seq in _SEQUENCES)


def problems(password: str, personal: list[str | None] = ()) -> list[str]:
    """Every rule the password breaks, as messages for the person (empty when it is fine).
    `personal`: the username, email and name of the account, which must not appear in it."""
    password = password or ""
    found = []
    if len(password) < MIN_LENGTH:
        found.append(f"Use at least {MIN_LENGTH} characters.")
    if len(password) > MAX_LENGTH or len(password.encode("utf-8")) > MAX_BYTES:
        found.append(f"Use at most {MAX_LENGTH} characters.")
    if sum(1 for pattern in _TYPES if pattern.search(password)) < MIN_CHARACTER_TYPES:
        found.append(f"Use at least {MIN_CHARACTER_TYPES} of: uppercase letters, lowercase letters, numbers, symbols.")
    if password and len(set(password)) < 5:
        found.append("Use more different characters.")
    lowered = password.lower()
    core = _EDGES.sub("", lowered)
    if lowered in COMMON or core in COMMON or _is_sequence(core or lowered):
        found.append("This password is too common or easy to guess.")
    if any(word in lowered for word in _personal_words(list(personal))):
        found.append("Don't use your name, username or email in your password.")
    return found
