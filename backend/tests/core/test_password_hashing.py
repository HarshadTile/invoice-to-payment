"""Password hashing moved from passlib to bcrypt directly. Hashes already stored in the database
were made by passlib; these reference hashes were generated with passlib 1.7.4 before the switch,
so this proves every existing password still works."""
from app.core.security import get_password_hash, verify_password

LONG = "Lönger-pässword-" * 7  # 112 characters, non-ASCII, longer than bcrypt's 72-byte limit
PASSLIB_HASHES = {
    "Passw0rd!": "$2b$12$CyyKriUgy3JHRGeDllyU8eI8r9IihwAoX4FAOioS7ldmuHImcvGa2",
    LONG: "$2b$12$KB9yejJzRVQZRyckm98zxeN15FGZOafo4Rrm7RLZ6/bq9JGCh1uR2",
}


def test_hashes_made_by_passlib_still_verify():
    for password, stored in PASSLIB_HASHES.items():
        assert verify_password(password, stored), password[:12]
        assert not verify_password(password + "x" if len(password) < 72 else "wrong", stored)


def test_new_hashes_use_the_same_format_and_cost():
    hashed = get_password_hash("Passw0rd!")
    assert hashed.startswith("$2b$12$") and len(hashed) == 60
    assert verify_password("Passw0rd!", hashed)
    assert not verify_password("passw0rd!", hashed)
    assert get_password_hash("Passw0rd!") != hashed  # salted


def test_long_passwords_behave_as_before():
    hashed = get_password_hash(LONG)
    assert verify_password(LONG, hashed)
    assert verify_password(LONG + "anything after byte 72", hashed)  # bcrypt's (and passlib's) rule


def test_missing_or_broken_hashes_never_match():
    for stored in ("", None, "not-a-hash", "$2b$12$short"):
        assert verify_password("Passw0rd!", stored) is False
