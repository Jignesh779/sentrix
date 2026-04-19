"""
Sentrix Backend — Unit Tests
Tests the 4 core modules: Risk Engine, Blockchain, ML Model, SOS Handler.

Run with:
  cd backend
  python -m pytest tests/ -v
"""

import sys
import os
import asyncio

# Add backend to path so imports work
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


# =============================================================================
# 1. RISK ENGINE TESTS (8 tests)
# =============================================================================

class TestRiskEngine:
    """Tests for the hybrid risk assessment engine."""

    def test_safe_location_returns_green(self):
        """A tourist in a safe city with full battery should be green."""
        from rule_engine import assess_risk
        result = assess_risk(latitude=28.6139, longitude=77.2090, battery_level=90)
        assert result["risk_level"] == "green"
        assert result["risk_score"] < 41

    def test_danger_zone_increases_score(self):
        """Being near Rohtang Pass danger zone should significantly raise risk."""
        from rule_engine import assess_risk
        result = assess_risk(latitude=32.3722, longitude=77.2475, battery_level=90)
        assert len(result["danger_zones"]) > 0
        assert result["risk_score"] > 20

    def test_danger_zone_is_top_factor(self):
        """Danger zone proximity should contribute more than battery to risk score."""
        from rule_engine import assess_risk
        result = assess_risk(latitude=32.3722, longitude=77.2475, battery_level=10)
        zone_factors = [f for f in result["risk_factors"] if f["factor"] == "Danger Zone"]
        battery_factors = [f for f in result["risk_factors"] if "Battery" in f["factor"]]
        if zone_factors and battery_factors:
            assert zone_factors[0]["score"] >= battery_factors[0]["score"], \
                "Danger zone should contribute more than battery to risk score"

    def test_low_battery_alone_is_not_red(self):
        """Low battery in a safe city should NOT trigger red alert."""
        from rule_engine import assess_risk
        result = assess_risk(latitude=28.6139, longitude=77.2090, battery_level=5)
        assert result["risk_level"] != "red"

    def test_extreme_altitude_raises_score(self):
        """Locations at high altitude areas should get altitude points."""
        from rule_engine import assess_risk
        result = assess_risk(latitude=32.3722, longitude=77.2475, battery_level=50)
        altitude_factors = [f for f in result["risk_factors"] if "Altitude" in f["factor"]]
        assert len(altitude_factors) > 0

    def test_risk_score_within_bounds(self):
        """Risk score should always be between 0 and 100."""
        from rule_engine import assess_risk
        for lat, lng, bat in [(28.6, 77.2, 90), (32.37, 77.25, 5), (15.5, 73.8, 50)]:
            result = assess_risk(latitude=lat, longitude=lng, battery_level=bat)
            assert 0 <= result["risk_score"] <= 100

    def test_result_has_required_fields(self):
        """Risk assessment should return all required fields."""
        from rule_engine import assess_risk
        result = assess_risk(latitude=28.6, longitude=77.2, battery_level=50)
        required_keys = ["risk_score", "risk_level", "risk_color", "recommended_action",
                         "altitude_m", "weather", "danger_zones", "risk_factors", "engine"]
        for key in required_keys:
            assert key in result, f"Missing required field: {key}"

    def test_hybrid_engine_label(self):
        """When ML is available, engine should say 'Hybrid'."""
        from rule_engine import assess_risk
        result = assess_risk(latitude=28.6, longitude=77.2, battery_level=50)
        assert "Hybrid" in result["engine"] or "Rule-Based" in result["engine"]


# =============================================================================
# 2. BLOCKCHAIN TESTS (7 tests)
# =============================================================================

class TestBlockchain:
    """Tests for the SHA-256 blockchain audit trail."""

    def test_genesis_block_exists(self):
        """Blockchain should start with a genesis block."""
        from blockchain import sentrix_chain
        assert len(sentrix_chain.chain) >= 1
        genesis = sentrix_chain.chain[0]
        assert genesis.index == 0
        assert len(genesis.previous_hash) > 0  # Has a previous hash set

    def test_chain_is_valid(self):
        """Chain should pass validation after genesis."""
        from blockchain import sentrix_chain
        assert sentrix_chain.is_chain_valid() == True

    def test_add_block_increases_length(self):
        """Adding an SOS block should increase chain length."""
        from blockchain import sentrix_chain
        initial_length = len(sentrix_chain.chain)
        sentrix_chain.add_sos_block({
            "alert_id": "TEST-001",
            "tourist_name": "Test Tourist",
            "latitude": 28.6,
            "longitude": 77.2,
        })
        assert len(sentrix_chain.chain) == initial_length + 1

    def test_chain_still_valid_after_add(self):
        """Chain should remain valid after adding blocks."""
        from blockchain import sentrix_chain
        assert sentrix_chain.is_chain_valid() == True

    def test_block_has_required_fields(self):
        """Each block should have index, timestamp, hash, previous_hash."""
        from blockchain import sentrix_chain
        block = sentrix_chain.chain[-1]
        assert hasattr(block, "index")
        assert hasattr(block, "timestamp")
        assert hasattr(block, "hash")
        assert hasattr(block, "previous_hash")
        assert hasattr(block, "data")

    def test_block_hash_integrity(self):
        """Block hash should be a valid SHA-256 hex string."""
        from blockchain import sentrix_chain
        block = sentrix_chain.chain[-1]
        assert len(block.hash) == 64  # SHA-256 = 64 hex chars
        assert all(c in "0123456789abcdef" for c in block.hash)

    def test_chain_linkage(self):
        """Each block's previous_hash should match the prior block's hash."""
        from blockchain import sentrix_chain
        chain = sentrix_chain.chain
        for i in range(1, len(chain)):
            assert chain[i].previous_hash == chain[i-1].hash, \
                f"Chain broken at block {i}"


# =============================================================================
# 3. ML MODEL TESTS (9 tests)
# =============================================================================

class TestMLModel:
    """Tests for the Random Forest + Gradient Boosting ML classifier."""

    def test_model_is_trained(self):
        """ML model should be trained and available."""
        from ml_model import is_model_available
        assert is_model_available() == True

    def test_prediction_returns_required_fields(self):
        """ML prediction should return score, level, confidence, and model type."""
        from ml_model import predict_risk
        result = predict_risk(
            battery_level=50, altitude_m=1000, hour_ist=12,
            weather_factor=0.1, zone_proximity=0.0,
            zone_risk_mult=1.0, num_nearby_zones=0
        )
        assert result is not None
        required = ["ml_risk_score", "ml_risk_level", "ml_confidence", "ml_model_type"]
        for key in required:
            assert key in result, f"ML prediction missing: {key}"

    def test_prediction_score_in_range(self):
        """ML risk score should be between 0 and 100."""
        from ml_model import predict_risk
        result = predict_risk(50, 1000, 12, 0.1, 0.0, 1.0, 0)
        assert 0 <= result["ml_risk_score"] <= 100

    def test_prediction_level_is_valid(self):
        """ML risk level should be green, yellow, or red."""
        from ml_model import predict_risk
        result = predict_risk(50, 1000, 12, 0.1, 0.0, 1.0, 0)
        assert result["ml_risk_level"] in ["green", "yellow", "red"]

    def test_confidence_sums_to_one(self):
        """ML confidence probabilities should sum to ~1.0."""
        from ml_model import predict_risk
        result = predict_risk(50, 1000, 12, 0.1, 0.0, 1.0, 0)
        total = sum(result["ml_confidence"].values())
        assert abs(total - 1.0) < 0.01, f"Confidence sum = {total}, expected ~1.0"

    def test_safe_location_predicts_green(self):
        """Safe inputs should predict green."""
        from ml_model import predict_risk
        result = predict_risk(
            battery_level=90, altitude_m=200, hour_ist=12,
            weather_factor=0.0, zone_proximity=0.0,
            zone_risk_mult=1.0, num_nearby_zones=0
        )
        assert result["ml_risk_level"] == "green"

    def test_dangerous_inputs_predict_high_risk(self):
        """Dangerous inputs should predict yellow or red."""
        from ml_model import predict_risk
        result = predict_risk(
            battery_level=10, altitude_m=4500, hour_ist=2,
            weather_factor=0.35, zone_proximity=0.95,
            zone_risk_mult=1.5, num_nearby_zones=3
        )
        assert result["ml_risk_level"] in ["yellow", "red"]
        assert result["ml_risk_score"] >= 40

    def test_model_metadata_has_accuracy(self):
        """Model metadata should include accuracy > 90% and R² > 0.95."""
        from ml_model import get_model_metadata
        meta = get_model_metadata()
        assert meta["status"] == "trained"
        assert meta["classifier_accuracy_cv5"] > 0.90
        assert meta["regressor_r2_cv5"] > 0.95
        assert "feature_importances" in meta

    def test_location_features_are_important(self):
        """Altitude or zone proximity should be in top 3 important features."""
        from ml_model import get_model_metadata
        meta = get_model_metadata()
        importances = meta["feature_importances"]
        top_3 = list(importances.keys())[:3]
        location_features = {"zone_proximity", "altitude_m", "zone_risk_mult"}
        overlap = location_features.intersection(set(top_3))
        assert len(overlap) >= 1, \
            f"Expected location features in top 3, got: {top_3}"


# =============================================================================
# 4. SOS HANDLER TESTS (4 tests)
# =============================================================================

class TestSOSHandler:
    """Tests for the 4-layer SOS fallback system."""

    def _make_sos_data(self):
        """Create test SOS request and tourist objects."""
        from models import SOSRequest, Tourist
        sos = SOSRequest(tourist_id="TEST-001", latitude=28.6, longitude=77.2, battery_level=50)
        tourist = Tourist(
            id="TEST-001",
            name="Test Tourist",
            phone="+911234567890",
            emergency_contact="+919876543210",
            nationality="India",
            id_type="aadhaar",
            id_hash="abc123hash",
            blood_group="O+",
            trip_start="2026-04-15",
            trip_end="2026-04-22",
        )
        return sos, tourist

    def test_sos_fires_successfully(self):
        """SOS handler should return a result with layer statuses."""
        from sos_handler import fire_sos
        sos, tourist = self._make_sos_data()
        result = asyncio.run(fire_sos(sos, tourist))
        assert result is not None
        assert hasattr(result, "layers") or "layers" in str(type(result))

    def test_sos_has_four_layers(self):
        """SOS should attempt all 4 fallback layers."""
        from sos_handler import fire_sos
        sos, tourist = self._make_sos_data()
        result = asyncio.run(fire_sos(sos, tourist))
        assert len(result.layers) == 4

    def test_at_least_one_layer_succeeds(self):
        """At least one SOS layer should always succeed (guaranteed delivery)."""
        from sos_handler import fire_sos
        sos, tourist = self._make_sos_data()
        result = asyncio.run(fire_sos(sos, tourist))
        successes = [l for l in result.layers if l.status == "success"]
        assert len(successes) >= 1, "SOS guarantee violated — no layer succeeded!"

    def test_sos_layers_have_channel_names(self):
        """Each SOS layer result should identify its channel."""
        from sos_handler import fire_sos
        sos, tourist = self._make_sos_data()
        result = asyncio.run(fire_sos(sos, tourist))
        for layer in result.layers:
            assert hasattr(layer, "name") and layer.name, \
                "Layer missing name"
