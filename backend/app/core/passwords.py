from __future__ import annotations

import asyncio
from concurrent.futures import ThreadPoolExecutor

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

_hasher = PasswordHasher()
_pool = ThreadPoolExecutor(max_workers=4, thread_name_prefix="argon2")
_DUMMY_HASH = _hasher.hash("edulit-dummy-password-not-a-secret")


def hash_password_sync(password: str) -> str:
    return _hasher.hash(password)


def verify_password_sync(password_hash: str, password: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def needs_rehash_sync(password_hash: str) -> bool:
    try:
        return _hasher.check_needs_rehash(password_hash)
    except (InvalidHashError, VerificationError):
        return True


async def hash_password(password: str) -> str:
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(_pool, hash_password_sync, password)


async def verify_password(password_hash: str, password: str) -> bool:
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(_pool, verify_password_sync, password_hash, password)


async def verify_dummy_password(password: str) -> None:
    """Keep login timing similar when the account does not exist."""
    await verify_password(_DUMMY_HASH, password)


async def maybe_rehash(password_hash: str, password: str) -> str | None:
    if not needs_rehash_sync(password_hash):
        return None
    return await hash_password(password)
