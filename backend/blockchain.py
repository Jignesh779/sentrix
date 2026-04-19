"""
Sentrix — Blockchain Ledger (Simulated Hyperledger Fabric)
Immutable chain for:
  - Digital ID issuance (Stage 3)
  - SOS alert records (Stage 5)
  - Dispatch logs (Stage 6)
  - Rescue completion / resolution (Stage 7)

Production deployment: Hyperledger Fabric permissioned network.
Demo: SHA-256 hash chain with proof-of-work (identical data model).
"""

import hashlib
import json
import time
from typing import Optional


class Block:
    """A single block in the Sentrix blockchain."""

    def __init__(self, index: int, timestamp: float, data: dict, previous_hash: str):
        self.index = index
        self.timestamp = timestamp
        self.data = data
        self.previous_hash = previous_hash
        self.nonce = 0
        self.hash = self.calculate_hash()

    def calculate_hash(self) -> str:
        block_string = json.dumps({
            "index": self.index,
            "timestamp": self.timestamp,
            "data": self.data,
            "previous_hash": self.previous_hash,
            "nonce": self.nonce,
        }, sort_keys=True)
        return hashlib.sha256(block_string.encode()).hexdigest()

    def mine_block(self, difficulty: int = 2):
        target = "0" * difficulty
        while self.hash[:difficulty] != target:
            self.nonce += 1
            self.hash = self.calculate_hash()

    def to_dict(self) -> dict:
        return {
            "index": self.index,
            "timestamp": self.timestamp,
            "data": self.data,
            "previous_hash": self.previous_hash,
            "nonce": self.nonce,
            "hash": self.hash,
        }


class SentrixBlockchain:
    """
    Sentrix Blockchain — immutable ledger.
    Handles Digital ID issuance, SOS recording, dispatch logging, and resolution.
    """

    def __init__(self, difficulty: int = 2):
        self.chain: list[Block] = []
        self.difficulty = difficulty
        self._create_genesis_block()

    def _create_genesis_block(self):
        genesis = Block(
            index=0,
            timestamp=time.time(),
            data={
                "type": "genesis",
                "message": "Sentrix Blockchain Initialized",
                "system": "Sentrix v1.0",
                "coverage": "All India",
                "note": "Simulated Hyperledger Fabric for demo. Production uses permissioned Fabric network.",
            },
            previous_hash="0" * 64,
        )
        genesis.mine_block(self.difficulty)
        self.chain.append(genesis)

    def get_latest_block(self) -> Block:
        return self.chain[-1]

    # ── Stage 3: Digital ID Issuance ──

    def issue_digital_id(self, tourist_data: dict) -> Block:
        """Record a new Digital ID issuance on the chain."""
        block_data = {
            "type": "digital_id_issued",
            "tourist_id": tourist_data.get("tourist_id"),
            "name": tourist_data.get("name"),
            "nationality": tourist_data.get("nationality"),
            "id_type": tourist_data.get("id_type"),
            "id_hash": tourist_data.get("id_hash"),
            "trip_start": tourist_data.get("trip_start"),
            "trip_end": tourist_data.get("trip_end"),
            "timestamp": time.time(),
            "note": "Hash stored on-chain. Raw ID never saved.",
        }
        return self._add_block(block_data)

    def verify_digital_id(self, id_hash: str) -> dict:
        """Verify a Digital ID against the blockchain."""
        for block in self.chain:
            if (
                block.data.get("type") == "digital_id_issued"
                and block.data.get("id_hash") == id_hash
            ):
                return {
                    "verified": True,
                    "tourist_id": block.data.get("tourist_id"),
                    "name": block.data.get("name"),
                    "block_index": block.index,
                    "block_hash": block.hash,
                    "issued_at": block.data.get("timestamp"),
                    "trip_end": block.data.get("trip_end"),
                    "chain_valid": self.is_chain_valid(),
                }
        return {"verified": False, "message": "Digital ID not found on chain"}

    # ── Stage 5: SOS Alert ──

    def add_sos_block(self, alert_data: dict) -> Block:
        block_data = {
            "type": "sos_alert",
            "alert_id": alert_data.get("id"),
            "tourist_id": alert_data.get("tourist_id"),
            "name": alert_data.get("tourist_name"),
            "latitude": alert_data.get("latitude"),
            "longitude": alert_data.get("longitude"),
            "severity": alert_data.get("severity"),
            "risk_score": alert_data.get("risk_score"),
            "timestamp": time.time(),
        }
        return self._add_block(block_data)

    # ── Stage 6: Dispatch ──

    def add_dispatch_block(self, alert_id: str, unit_id: str, unit_type: str, unit_name: str) -> Block:
        block_data = {
            "type": "unit_dispatched",
            "alert_id": alert_id,
            "unit_id": unit_id,
            "unit_type": unit_type,
            "unit_name": unit_name,
            "timestamp": time.time(),
            "action": f"{unit_type.title()} dispatched to SOS location via ERSS-112",
        }
        return self._add_block(block_data)

    # ── Stage 7: Resolution ──

    def add_resolution_block(self, alert_id: str, resolved_by: str) -> Block:
        block_data = {
            "type": "incident_resolved",
            "alert_id": alert_id,
            "resolved_by": resolved_by,
            "timestamp": time.time(),
            "action": "Tourist secured — incident closed",
        }
        return self._add_block(block_data)

    def add_consent_block(self, tourist_id: str, consent_gps: bool) -> Block:
        block_data = {
            "type": "consent_change",
            "tourist_id": tourist_id,
            "consent_gps": consent_gps,
            "timestamp": time.time(),
        }
        return self._add_block(block_data)

    # ── Chain Operations ──

    def _add_block(self, data: dict) -> Block:
        new_block = Block(
            index=len(self.chain),
            timestamp=time.time(),
            data=data,
            previous_hash=self.get_latest_block().hash,
        )
        new_block.mine_block(self.difficulty)
        self.chain.append(new_block)
        return new_block

    def is_chain_valid(self) -> bool:
        for i in range(1, len(self.chain)):
            current = self.chain[i]
            previous = self.chain[i - 1]
            if current.hash != current.calculate_hash():
                return False
            if current.previous_hash != previous.hash:
                return False
            if current.hash[:self.difficulty] != "0" * self.difficulty:
                return False
        return True

    def get_chain_data(self) -> list[dict]:
        return [block.to_dict() for block in self.chain]

    def get_full_trail(self, alert_id: str) -> list[dict]:
        """Get complete audit trail for one incident — all related blocks in order."""
        return [
            block.to_dict() for block in self.chain
            if block.data.get("alert_id") == alert_id
        ]

    def get_blocks_by_type(self, block_type: str) -> list[dict]:
        return [
            block.to_dict() for block in self.chain
            if block.data.get("type") == block_type
        ]

    def get_stats(self) -> dict:
        return {
            "chain_length": len(self.chain),
            "is_valid": self.is_chain_valid(),
            "total_digital_ids": len(self.get_blocks_by_type("digital_id_issued")),
            "total_sos_records": len(self.get_blocks_by_type("sos_alert")),
            "total_dispatches": len(self.get_blocks_by_type("unit_dispatched")),
            "total_resolutions": len(self.get_blocks_by_type("incident_resolved")),
            "latest_hash": self.get_latest_block().hash,
            "difficulty": self.difficulty,
            "network": "Hyperledger Fabric (Simulated)",
        }


# Global blockchain instance
sentrix_chain = SentrixBlockchain(difficulty=2)
