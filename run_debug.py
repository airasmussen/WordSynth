#!/usr/bin/env python3
"""
Quick debug runner for WordSynth threading issues.

Usage:
    python run_debug.py                    # Test with "king"
    python run_debug.py queen              # Test with "queen"
    python run_debug.py --full             # Run full test suite
    python run_debug.py --pytest           # Run pytest tests
"""

import sys
import argparse
from pathlib import Path

def main():
    parser = argparse.ArgumentParser(description="Debug WordSynth threading issues")
    parser.add_argument("word", nargs="?", default="king", help="Word to test (default: king)")
    parser.add_argument("--full", action="store_true", help="Run full debug suite")
    parser.add_argument("--pytest", action="store_true", help="Run pytest tests")
    parser.add_argument("--simple", action="store_true", help="Run simple debug (default)")
    
    args = parser.parse_args()
    
    if args.pytest:
        print("🧪 Running pytest tests...")
        import subprocess
        result = subprocess.run([sys.executable, "-m", "pytest", "test_threading.py", "-v", "-s"], 
                              cwd=Path(__file__).parent)
        return result.returncode
    
    elif args.full:
        print("🔍 Running full debug suite...")
        from debug_threading import WordSynthDebugger
        debugger = WordSynthDebugger()
        results = debugger.run_full_debug()
        debugger.save_debug_report(results)
        return 0 if results.get("basis_word_tests", {}).get("successful_tests", 0) > 0 else 1
    
    else:
        print(f"🔍 Running simple debug for word: '{args.word}'")
        from simple_debug import SimpleDebugger
        debugger = SimpleDebugger()
        success = debugger.run_test(args.word)
        return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())


