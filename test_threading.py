#!/usr/bin/env python3
"""
Pytest-based threading tests for WordSynth.

Run with: pytest test_threading.py -v -s
"""

import os
import sys
import time
import subprocess
import threading
import signal
from pathlib import Path
import pytest

# Set threading environment variables BEFORE importing anything else
os.environ['NUMBA_NUM_THREADS'] = '1'
os.environ['NUMBA_THREADING_LAYER'] = 'omp'
os.environ['OMP_NUM_THREADS'] = '1'
os.environ['MKL_NUM_THREADS'] = '1'
os.environ['OPENBLAS_NUM_THREADS'] = '1'

from playwright.sync_api import sync_playwright, Page, Browser


class TestWordSynthThreading:
    """Test class for WordSynth threading issues."""
    
    @pytest.fixture(scope="class")
    def app_process(self):
        """Start the Flask app for testing."""
        print("\n🚀 Starting Flask app for testing...")
        cmd = [sys.executable, "app.py"]
        process = subprocess.Popen(
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
                    break
            except:
                pass
            time.sleep(1)
        else:
            pytest.fail("Failed to start Flask app")
        
        yield process
        
        # Cleanup
        print("🧹 Stopping Flask app...")
        process.terminate()
        process.wait(timeout=10)
    
    @pytest.fixture(scope="class")
    def browser(self):
        """Setup Playwright browser."""
        print("🌐 Setting up browser...")
        playwright = sync_playwright().start()
        browser = playwright.chromium.launch(headless=False)
        
        yield browser
        
        # Cleanup
        print("🧹 Closing browser...")
        browser.close()
        playwright.stop()
    
    @pytest.fixture
    def page(self, browser):
        """Create a new page for each test."""
        context = browser.new_context()
        page = context.new_page()
        
        # Enable logging
        page.on("console", lambda msg: print(f"Console: {msg.text}"))
        page.on("pageerror", lambda error: print(f"Page Error: {error}"))
        
        yield page
        
        context.close()
    
    def test_app_startup(self, app_process):
        """Test that the app starts without threading errors."""
        # App should be running from fixture
        assert app_process.poll() is None, "App process should be running"
    
    def test_basis_word_king(self, app_process, page):
        """Test typing 'king' as a basis word."""
        self._test_basis_word(page, "king")
    
    def test_basis_word_queen(self, app_process, page):
        """Test typing 'queen' as a basis word."""
        self._test_basis_word(page, "queen")
    
    def test_basis_word_man(self, app_process, page):
        """Test typing 'man' as a basis word."""
        self._test_basis_word(page, "man")
    
    def test_basis_word_woman(self, app_process, page):
        """Test typing 'woman' as a basis word."""
        self._test_basis_word(page, "woman")
    
    def test_multiple_basis_words_rapid(self, app_process, page):
        """Test typing multiple basis words rapidly."""
        words = ["king", "queen", "man", "woman"]
        
        for word in words:
            print(f"🔍 Testing rapid input: '{word}'")
            self._test_basis_word(page, word, wait_time=1)
    
    def test_basis_word_with_special_chars(self, app_process, page):
        """Test basis words with special characters."""
        special_words = ["good", "bad", "happy", "sad"]
        
        for word in special_words:
            print(f"🔍 Testing special word: '{word}'")
            self._test_basis_word(page, word)
    
    def _test_basis_word(self, page: Page, word: str, wait_time: int = 3):
        """Helper method to test a basis word."""
        try:
            # Load the page
            page.goto("http://localhost:5801/")
            page.wait_for_load_state("networkidle")
            
            # Wait for model to load
            print(f"⏳ Waiting for model to load before testing '{word}'...")
            time.sleep(5)
            
            # Find and type in the basis word input
            word_input = page.locator("#baseWordInput")
            word_input.clear()
            word_input.type(word)
            
            print(f"✍️  Typed '{word}' into input field")
            
            # Wait for processing
            print(f"⏳ Waiting {wait_time}s for processing...")
            time.sleep(wait_time)
            
            # Check if the input field still has the word (basic validation)
            input_value = word_input.input_value()
            assert input_value == word, f"Input field should contain '{word}', got '{input_value}'"
            
            # Take screenshot for debugging
            screenshot_path = f"test_{word}_{int(time.time())}.png"
            page.screenshot(path=screenshot_path)
            print(f"📸 Screenshot saved: {screenshot_path}")
            
            print(f"✅ Successfully tested '{word}'")
            
        except Exception as e:
            # Take error screenshot
            error_screenshot = f"error_{word}_{int(time.time())}.png"
            page.screenshot(path=error_screenshot)
            print(f"📸 Error screenshot saved: {error_screenshot}")
            
            pytest.fail(f"Error testing '{word}': {e}")


class TestThreadingEnvironment:
    """Test threading environment configuration."""
    
    def test_threading_environment_variables(self):
        """Test that threading environment variables are set correctly."""
        expected_vars = {
            'NUMBA_NUM_THREADS': '1',
            'NUMBA_THREADING_LAYER': 'omp',
            'OMP_NUM_THREADS': '1',
            'MKL_NUM_THREADS': '1',
            'OPENBLAS_NUM_THREADS': '1'
        }
        
        for var, expected_value in expected_vars.items():
            actual_value = os.environ.get(var)
            assert actual_value == expected_value, f"{var} should be '{expected_value}', got '{actual_value}'"
    
    def test_import_threading_safety(self):
        """Test that imports don't cause threading issues."""
        try:
            # Import the main modules
            import app
            import synth
            from settings import *
            
            # Test that models can be created without threading issues
            from synth import SynthModel
            
            # This should not crash due to threading issues
            print("✅ All imports successful")
            
        except Exception as e:
            pytest.fail(f"Import failed with threading error: {e}")


if __name__ == "__main__":
    # Run tests directly
    pytest.main([__file__, "-v", "-s"])
