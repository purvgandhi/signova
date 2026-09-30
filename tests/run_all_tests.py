"""
Comprehensive Test Runner for SignBridge Intelligence Studio
Runs all automated unit, integration, and contract tests.
"""
import sys
import time
from pathlib import Path

# Ensure repo root is on sys.path
REPO_ROOT = str(Path(__file__).parent.parent.resolve())
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

def run():
    print("=" * 70)
    print(" SIGNBRIDGE INTELLIGENCE STUDIO — AUTOMATED TEST SUITE")
    print("=" * 70)

    start = time.time()
    tests = []

    # 1. Buffer Synchronization
    try:
        import tests.test_buffer_synchronization as t1
        t1.test_buffer_synchronization_three_way_match()
        tests.append(("Part 1 Bug 2: Buffer Synchronization (HUD == Chips == Raw)", "PASS", None))
    except Exception as e:
        tests.append(("Part 1 Bug 2: Buffer Synchronization", "FAIL", str(e)))

    # 2. WCAG Contrast
    try:
        import tests.test_wcag_contrast as t2
        t2.test_light_theme_meets_wcag_aa()
        t2.test_standard_dark_theme_meets_wcag_aa()
        tests.append(("Part 3 Feature 5: WCAG AA Color Contrast (>4.5:1 / >7:1)", "PASS", None))
    except Exception as e:
        tests.append(("Part 3 Feature 5: WCAG AA Color Contrast", "FAIL", str(e)))

    # 3. Sentence Versioning & Matching
    try:
        import tests.test_sentence_versioning as t3
        t3.test_empty_buffer_reconstruction()
        t3.test_exact_sentence_matching()
        t3.test_custom_wordpack_matching()
        t3.test_version_id_preservation()
        tests.append(("Part 1 Bug 3: Sentence Reconstruction & Monotonic Versioning", "PASS", None))
    except Exception as e:
        tests.append(("Part 1 Bug 3: Sentence Reconstruction", "FAIL", str(e)))

    # 4. Marathi Translation
    try:
        import tests.test_marathi_translation as t4
        t4.test_marathi_translation_devanagari()
        t4.test_hindi_translation_devanagari()
        t4.test_english_bypass()
        t4.test_unknown_phrase_fallback_has_explicit_reason()
        tests.append(("Part 1 Bug 4: Marathi Devanagari Translation & Error Reasons", "PASS", None))
    except Exception as e:
        tests.append(("Part 1 Bug 4: Marathi Devanagari Translation", "FAIL", str(e)))

    # 5. Undo Sign
    try:
        import tests.test_undo_sign as t5
        t5.test_undo_pipeline_sequence()
        tests.append(("Part 1 Bug 5: Undo Sign Pipeline & Sentence Regeneration", "PASS", None))
    except Exception as e:
        tests.append(("Part 1 Bug 5: Undo Sign Pipeline", "FAIL", str(e)))

    # 6. State Machine & Confidence Telemetry (Part 1 & Part 2)
    try:
        import tests.test_state_machine_telemetry as t6
        t6.test_state_machine_idle_to_accepted_lifecycle()
        t6.test_telemetry_consistency_no_drift()
        tests.append(("Part 2: Confidence Telemetry & State Machine (IDLE->STABLE->ACCEPTED)", "PASS", None))
    except Exception as e:
        tests.append(("Part 2: Confidence Telemetry & State Machine", "FAIL", str(e)))

    # 7. Word Packs, Profiles & Health
    try:
        import tests.test_word_packs_and_profiles as t7
        t7.test_wordpacks_crud()
        t7.test_calibration_profiles()
        t7.test_health_endpoint()
        t7.test_emergency_card_endpoint()
        tests.append(("Part 3 Features: Word Packs CRUD, Calibration Profiles, Health, Card", "PASS", None))
    except Exception as e:
        tests.append(("Part 3 Features", "FAIL", str(e)))

    elapsed = time.time() - start
    print(f"\nRan {len(tests)} test suites in {elapsed:.3f}s\n")

    failed = 0
    for name, status, err in tests:
        status_icon = "PASS" if status == "PASS" else "FAIL"
        print(f"[{status_icon}] {name}")
        if err:
            print(f"       Error: {err}")
            failed += 1

    print("\n" + "=" * 70)
    if failed == 0:
        print(f" ALL {len(tests)} TEST SUITES PASSED PERFECTLY!")
        print("=" * 70)
        return 0
    else:
        print(f" {failed} TEST SUITES FAILED")
        print("=" * 70)
        return 1

if __name__ == "__main__":
    sys.exit(run())
