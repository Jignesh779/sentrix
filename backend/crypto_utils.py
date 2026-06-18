"""
Sentrix — Encryption Utilities (PII Protection)

Provides AES encryption/decryption for sensitive tourist data (PII)
stored in the database. Uses Fernet symmetric encryption (AES-128-CBC
+ HMAC-SHA256 = 256-bit total key material).

Features:
  - Encrypt PII before database storage
  - Decrypt PII when reading from database
  - SHA-256 hashing for blockchain (one-way)
  - Backward compatibility with unencrypted legacy data
  - Auto-generates encryption key in development mode

Environment:
  SENTRIX_ENCRYPTION_KEY — Base64-encoded Fernet key. If not set,
  a key is auto-generated and logged (development only).
"""

import os
import hashlib
import logging
import base64

logger = logging.getLogger("sentrix.crypto")

# Encrypted value prefix — used to detect encrypted vs plaintext data
ENC_PREFIX = "ENC:"

# ---------------------------------------------------------------------------
# Key Management
# ---------------------------------------------------------------------------
_fernet = None
_key_source = "none"


def _init_fernet():
    """Initialize Fernet cipher with key from env or auto-generated."""
    global _fernet, _key_source

    try:
        from cryptography.fernet import Fernet
    except ImportError:
        logger.warning(
            "cryptography not installed. PII encryption disabled. "
            "Install with: pip install cryptography"
        )
        return

    key = os.getenv("SENTRIX_ENCRYPTION_KEY")

    if key:
        _key_source = "environment"
        logger.info("[Crypto] Using encryption key from SENTRIX_ENCRYPTION_KEY")
    else:
        # Auto-generate for development
        key = Fernet.generate_key().decode()
        _key_source = "auto-generated"
        logger.info(f"[Crypto] Auto-generated encryption key (dev mode)")
        # Save to .env if it exists
        env_path = os.path.join(os.path.dirname(__file__), ".env")
        try:
            with open(env_path, "a") as f:
                f.write(f"\nSENTRIX_ENCRYPTION_KEY={key}\n")
            logger.info(f"[Crypto] Key saved to .env")
        except Exception:
            pass

    try:
        _fernet = Fernet(key.encode() if isinstance(key, str) else key)
        logger.info(f"[Crypto] Fernet cipher initialized (key source: {_key_source})")
    except Exception as e:
        logger.error(f"[Crypto] Failed to initialize Fernet: {e}")
        _fernet = None


# ---------------------------------------------------------------------------
# Encryption / Decryption
# ---------------------------------------------------------------------------
def encrypt_pii(plaintext: str) -> str:
    """
    Encrypt a plaintext string for database storage.
    Returns ENC:-prefixed base64 ciphertext.
    Returns empty string if input is empty/None.
    Returns plaintext as-is if encryption is unavailable.
    """
    if not plaintext:
        return plaintext or ""

    if _fernet is None:
        return plaintext  # Graceful fallback

    try:
        encrypted = _fernet.encrypt(plaintext.encode("utf-8")).decode("utf-8")
        return f"{ENC_PREFIX}{encrypted}"
    except Exception as e:
        logger.error(f"[Crypto] Encryption failed: {e}")
        return plaintext


def decrypt_pii(ciphertext: str) -> str:
    """
    Decrypt an ENC:-prefixed ciphertext back to plaintext.
    If the value is not encrypted (no ENC: prefix), returns as-is
    for backward compatibility with pre-encryption data.
    """
    if not ciphertext:
        return ciphertext or ""

    # Not encrypted — return as-is (backward compatibility)
    if not ciphertext.startswith(ENC_PREFIX):
        return ciphertext

    if _fernet is None:
        logger.warning("[Crypto] Cannot decrypt — Fernet not initialized")
        return ciphertext

    try:
        token = ciphertext[len(ENC_PREFIX):]
        return _fernet.decrypt(token.encode("utf-8")).decode("utf-8")
    except Exception as e:
        logger.error(f"[Crypto] Decryption failed: {e}")
        return ciphertext  # Return raw on failure


def is_encrypted(value: str) -> bool:
    """Check if a value is encrypted (has ENC: prefix)."""
    return bool(value) and value.startswith(ENC_PREFIX)


# ---------------------------------------------------------------------------
# Hashing (for blockchain — one-way)
# ---------------------------------------------------------------------------
def hash_pii(value: str) -> str:
    """
    SHA-256 hash for blockchain storage (irreversible).
    Returns '0x' + first 16 hex characters.
    """
    if not value:
        return "0x0000000000000000"
    return "0x" + hashlib.sha256(value.encode("utf-8")).hexdigest()[:16].upper()


# ---------------------------------------------------------------------------
# Status
# ---------------------------------------------------------------------------
def get_encryption_status() -> dict:
    """Return encryption configuration status for API/dashboard."""
    return {
        "enabled": _fernet is not None,
        "algorithm": "AES-128-CBC + HMAC-SHA256 (Fernet)",
        "key_source": _key_source,
        "pii_fields_encrypted": [
            "name", "phone", "email", "emergency_contact", "medical_conditions"
        ],
        "blockchain_fields_hashed": ["name → name_hash", "id_number → document_hash"],
    }


# ---------------------------------------------------------------------------
# Auto-Initialize on Import
# ---------------------------------------------------------------------------
_init_fernet()
print(f"[Crypto] Encryption {'enabled' if _fernet else 'disabled'} (key: {_key_source})")
