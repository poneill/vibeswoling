"""Tests for warmup set generation."""

from warmup import _nice_weights, generate_warmup, generate_workout


class TestNiceWeights:
    def test_45_bar_sequence(self):
        # bar=45: 45, 95(+50), 135(+40), 185(+50), 225(+40), ...
        weights = _nice_weights(45, 300)
        assert weights[0] == 45
        assert weights[1] == 95   # 45 + 25*2
        assert weights[2] == 135  # 45 + 45*2
        assert weights[3] == 185  # 45 + (45+25)*2
        assert weights[4] == 225  # 45 + 2*45*2
        assert weights[5] == 275  # 45 + (2*45+25)*2

    def test_65_bar_sequence(self):
        # safety bar squat / hex bar: bar=65
        weights = _nice_weights(65, 250)
        assert weights[0] == 65
        assert weights[1] == 115  # 65 + 25*2
        assert weights[2] == 155  # 65 + 45*2
        assert weights[3] == 205  # 65 + (45+25)*2

    def test_stops_below_target(self):
        weights = _nice_weights(45, 135)
        assert all(w < 135 for w in weights)
        assert weights[-1] == 95  # highest nice weight below 135


class TestGenerateWarmup:
    def test_minimum_three_sets(self):
        sets = generate_warmup(185, 45)
        assert len(sets) >= 3

    def test_starts_with_bar(self):
        sets = generate_warmup(225, 45)
        assert sets[0].weight == 45

    def test_all_sets_are_warmup(self):
        sets = generate_warmup(225, 45)
        assert all(s.set_type == "warmup" for s in sets)

    def test_last_set_is_1_rep_with_rest(self):
        sets = generate_warmup(225, 45)
        assert sets[-1].reps == 1
        assert sets[-1].rest_seconds == 120

    def test_penultimate_is_3_reps(self):
        sets = generate_warmup(225, 45)
        assert sets[-2].reps == 3

    def test_no_gap_exceeds_90(self):
        for work_weight in [135, 185, 225, 275, 315, 405]:
            sets = generate_warmup(work_weight, 45)
            weights = [s.weight for s in sets] + [work_weight]
            for i in range(len(weights) - 1):
                gap = weights[i + 1] - weights[i]
                assert gap <= 90, (
                    f"Gap of {gap} between {weights[i]} and {weights[i+1]} "
                    f"for work_weight={work_weight}"
                )

    def test_last_warmup_is_nice_plate_level(self):
        # For 155 (45 bar + 55 per side), last warmup should be 135 (plate level)
        sets = generate_warmup(155, 45)
        assert sets[-1].weight == 135

    def test_work_weight_equals_bar(self):
        sets = generate_warmup(45, 45)
        assert len(sets) == 1
        assert sets[0].weight == 45

    def test_small_work_weight(self):
        # Work weight just above bar — only bar warmup possible
        sets = generate_warmup(55, 45)
        assert len(sets) == 1
        assert sets[0].weight == 45


class TestGenerateWorkout:
    def test_warmup_then_work_sets(self):
        sets = generate_workout(185, 5, 3, 45)
        types = [s.set_type for s in sets]
        # Warmups come first, then work sets
        warmup_end = max(i for i, t in enumerate(types) if t == "warmup")
        work_start = min(i for i, t in enumerate(types) if t == "work")
        assert warmup_end < work_start

    def test_correct_number_of_work_sets(self):
        sets = generate_workout(225, 5, 3, 45)
        work_sets = [s for s in sets if s.set_type == "work"]
        assert len(work_sets) == 3

    def test_work_sets_use_target_weight_and_reps(self):
        sets = generate_workout(185, 5, 3, 45)
        work_sets = [s for s in sets if s.set_type == "work"]
        for s in work_sets:
            assert s.weight == 185
            assert s.reps == 5

    def test_rest_between_work_sets(self):
        sets = generate_workout(185, 5, 3, 45)
        work_sets = [s for s in sets if s.set_type == "work"]
        # 5 min rest between work sets, none after last
        assert work_sets[0].rest_seconds == 300
        assert work_sets[1].rest_seconds == 300
        assert work_sets[2].rest_seconds is None
