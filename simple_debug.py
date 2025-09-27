#!/usr/bin/env python3
"""
Simple WordSynth Threading Debug Script

A lightweight script to quickly test and identify threading issues.
"""

import os
import sys
import time
import subprocess
import threading
import signal
from pathlib import Path

# Set threading environment variables BEFORE importing anything else
os.environ['NUMBA_NUM_THREADS'] = '1'
os.environ['NUMBA_THREADING_LAYER'] = 'omp'
os.environ['OMP_NUM_THREADS'] = '1'
os.environ['MKL_NUM_THREADS'] = '1'
os.environ['OPENBLAS_NUM_THREADS'] = '1'

from playwright.sync_api import sync_playwright


class SimpleDebugger:
    def __init__(self):
        self.app_process = None
        self.playwright = None
        self.browser = None
        self.page = None
        
    def start_app(self):
        """Start the Flask app."""
        print("🚀 Starting Flask app...")
        cmd = [sys.executable, "app.py"]
        self.app_process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            cwd=Path(__file__).parent
        )
        
        # Wait for app to start
        for i in range(30):
            try:
                import requests
                response = requests.get("http://localhost:5801/", timeout=2)
                if response.status_code == 200:
                    print("✅ Flask app started successfully")
                    return True
            except:
                pass
            time.sleep(1)
        
        print("❌ Failed to start Flask app")
        return False
    
    def setup_browser(self):
        """Setup Playwright browser."""
        print("🌐 Setting up browser...")
        self.playwright = sync_playwright().start()
        self.browser = self.playwright.chromium.launch(headless=False)
        self.page = self.browser.new_page()
        
        # Enable console logging
        self.page.on("console", lambda msg: print(f"Console: {msg.text}"))
        self.page.on("pageerror", lambda error: print(f"Page Error: {error}"))
        
        print("✅ Browser setup complete")
        return True
    
    def test_basis_word(self, word="king"):
        """Test typing a basis word."""
        print(f"🔍 Testing basis word: '{word}'")
        
        try:
            # Load the page
            self.page.goto("http://localhost:5801/")
            self.page.wait_for_load_state("networkidle")
            
            # Wait for model to load
            print("⏳ Waiting for model to load...")
            time.sleep(5)  # Give model time to load
            
            # Find and type in the basis word input
            word_input = self.page.locator("#baseWordInput")
            word_input.clear()
            word_input.type(word)
            
            print(f"✍️  Typed '{word}' into input field")
            
            # Wait for processing
            print("⏳ Waiting for processing...")
            time.sleep(10)  # Give more time for processing
            
            # Check for errors in console
            print("🔍 Checking for errors...")
            
            # Take screenshot
            self.page.screenshot(path=f"debug_{word}_{int(time.time())}.png")
            print(f"📸 Screenshot saved for '{word}'")
            
            return True
            
        except Exception as e:
            print(f"❌ Error testing '{word}': {e}")
            return False
    
    def cleanup(self):
        """Cleanup resources."""
        print("🧹 Cleaning up...")
        if self.page:
            self.page.close()
        if self.browser:
            self.browser.close()
        if self.playwright:
            self.playwright.stop()
        if self.app_process:
            self.app_process.terminate()
            self.app_process.wait(timeout=5)
    
    def run_test(self, word="king"):
        """Run a single test."""
        try:
            if not self.start_app():
                return False
            
            if not self.setup_browser():
                return False
            
            return self.test_basis_word(word)
            
        except Exception as e:
            print(f"❌ Test failed: {e}")
            return False
        finally:
            self.cleanup()


def main():
    """Main function."""
    if len(sys.argv) > 1:
        test_word = sys.argv[1]
    else:
        test_word = "king"
    
    print(f"WordSynth Simple Debug - Testing: '{test_word}'")
    print("=" * 50)
    
    debugger = SimpleDebugger()
    success = debugger.run_test(test_word)
    
    if success:
        print("✅ Test completed successfully")
    else:
        print("❌ Test failed")
    
    return 0 if success else 1


if __name__ == "__main__":
    sys.exit(main())
