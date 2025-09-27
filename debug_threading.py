#!/usr/bin/env python3
"""
WordSynth Threading Debug Script

This script uses Playwright to automatically test the WordSynth app and identify
threading issues when basis words are typed in. It will:

1. Start the Flask app in a subprocess
2. Use Playwright to interact with the web interface
3. Monitor for crashes and threading errors
4. Capture detailed logs and screenshots
5. Test various scenarios that might trigger threading issues
"""

import os
import sys
import time
import signal
import subprocess
import threading
import json
import traceback
from pathlib import Path
from typing import Optional, Dict, Any

# Set threading environment variables BEFORE importing anything else
os.environ['NUMBA_NUM_THREADS'] = '1'
os.environ['NUMBA_THREADING_LAYER'] = 'omp'
os.environ['OMP_NUM_THREADS'] = '1'
os.environ['MKL_NUM_THREADS'] = '1'
os.environ['OPENBLAS_NUM_THREADS'] = '1'

from playwright.sync_api import sync_playwright, Page, Browser, BrowserContext
import pytest


class WordSynthDebugger:
    """Main debugging class for WordSynth threading issues."""
    
    def __init__(self, app_port: int = 5801):
        self.app_port = app_port
        self.app_url = f"http://localhost:{app_port}"
        self.app_process: Optional[subprocess.Popen] = None
        self.browser: Optional[Browser] = None
        self.context: Optional[BrowserContext] = None
        self.page: Optional[Page] = None
        self.playwright = None
        self.debug_logs = []
        self.screenshots_dir = Path("debug_screenshots")
        self.screenshots_dir.mkdir(exist_ok=True)
        
    def log(self, message: str, level: str = "INFO"):
        """Log a debug message with timestamp."""
        timestamp = time.strftime("%H:%M:%S")
        log_entry = f"[{timestamp}] {level}: {message}"
        print(log_entry)
        self.debug_logs.append(log_entry)
        
    def start_app(self) -> bool:
        """Start the Flask app in a subprocess."""
        try:
            self.log("Starting Flask app...")
            
            # Start the app with explicit Python path
            cmd = [sys.executable, "app.py"]
            self.app_process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                cwd=Path(__file__).parent
            )
            
            # Wait for app to start
            max_wait = 30
            for i in range(max_wait):
                try:
                    import requests
                    response = requests.get(f"{self.app_url}/", timeout=2)
                    if response.status_code == 200:
                        self.log("Flask app started successfully")
                        return True
                except:
                    pass
                time.sleep(1)
                
            self.log("Failed to start Flask app within timeout", "ERROR")
            return False
            
        except Exception as e:
            self.log(f"Error starting Flask app: {e}", "ERROR")
            return False
    
    def stop_app(self):
        """Stop the Flask app subprocess."""
        if self.app_process:
            try:
                self.log("Stopping Flask app...")
                self.app_process.terminate()
                self.app_process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                self.log("Force killing Flask app...", "WARN")
                self.app_process.kill()
            except Exception as e:
                self.log(f"Error stopping Flask app: {e}", "ERROR")
    
    def setup_browser(self):
        """Set up Playwright browser with debugging options."""
        try:
            self.log("Setting up Playwright browser...")
            self.playwright = sync_playwright().start()
            
            # Launch browser with debugging options
            self.browser = self.playwright.chromium.launch(
                headless=False,  # Show browser for debugging
                args=[
                    '--disable-web-security',
                    '--disable-features=VizDisplayCompositor',
                    '--enable-logging',
                    '--log-level=0'
                ]
            )
            
            # Create context with console logging
            self.context = self.browser.new_context(
                viewport={'width': 1280, 'height': 720}
            )
            
            # Enable console logging
            self.context.on("console", lambda msg: self.log(f"Console: {msg.text}", "CONSOLE"))
            self.context.on("pageerror", lambda error: self.log(f"Page Error: {error}", "ERROR"))
            
            self.page = self.context.new_page()
            
            # Enable request/response logging
            self.page.on("request", lambda req: self.log(f"Request: {req.method} {req.url}", "NETWORK"))
            self.page.on("response", lambda resp: self.log(f"Response: {resp.status} {resp.url}", "NETWORK"))
            
            self.log("Browser setup complete")
            return True
            
        except Exception as e:
            self.log(f"Error setting up browser: {e}", "ERROR")
            return False
    
    def close_browser(self):
        """Close the browser and cleanup."""
        try:
            if self.page:
                self.page.close()
            if self.context:
                self.context.close()
            if self.browser:
                self.browser.close()
            if self.playwright:
                self.playwright.stop()
        except Exception as e:
            self.log(f"Error closing browser: {e}", "ERROR")
    
    def take_screenshot(self, name: str):
        """Take a screenshot for debugging."""
        try:
            if self.page:
                screenshot_path = self.screenshots_dir / f"{name}_{int(time.time())}.png"
                self.page.screenshot(path=str(screenshot_path))
                self.log(f"Screenshot saved: {screenshot_path}")
        except Exception as e:
            self.log(f"Error taking screenshot: {e}", "ERROR")
    
    def wait_for_app_ready(self) -> bool:
        """Wait for the app to be fully loaded and ready."""
        try:
            self.log("Loading app page...")
            self.page.goto(self.app_url)
            
            # Wait for the page to load
            self.page.wait_for_load_state("networkidle")
            
            # Wait for model to be loaded (check for model info)
            self.log("Waiting for model to load...")
            max_wait = 60
            for i in range(max_wait):
                try:
                    # Check if model info is displayed
                    model_info = self.page.locator("#modelInfo")
                    if model_info.is_visible():
                        self.log("Model loaded successfully")
                        return True
                except:
                    pass
                time.sleep(1)
            
            self.log("Model failed to load within timeout", "WARN")
            return False
            
        except Exception as e:
            self.log(f"Error waiting for app ready: {e}", "ERROR")
            return False
    
    def test_basis_word_input(self, test_word: str = "king") -> Dict[str, Any]:
        """Test typing a basis word and monitor for threading issues."""
        result = {
            "test_word": test_word,
            "success": False,
            "error": None,
            "timing": {},
            "console_errors": [],
            "network_errors": []
        }
        
        try:
            self.log(f"Testing basis word input: '{test_word}'")
            start_time = time.time()
            
            # Clear any existing input
            word_input = self.page.locator("#baseWordInput")
            word_input.clear()
            
            # Type the word slowly to simulate real user input
            self.log("Typing basis word...")
            word_input.type(test_word, delay=100)
            result["timing"]["typing_complete"] = time.time() - start_time
            
            # Wait for word validation
            self.log("Waiting for word validation...")
            validation_start = time.time()
            
            # Wait for the word to be validated (check for success indicator)
            try:
                # Look for validation success or error indicators
                self.page.wait_for_selector(".word-valid, .word-invalid", timeout=10000)
                result["timing"]["validation_complete"] = time.time() - validation_start
            except:
                result["timing"]["validation_timeout"] = time.time() - validation_start
                self.log("Word validation timed out", "WARN")
            
            # Check if basis words are loaded
            self.log("Waiting for basis words to load...")
            basis_start = time.time()
            
            try:
                # Wait for basis words to appear
                self.page.wait_for_selector(".basis-word", timeout=15000)
                result["timing"]["basis_words_loaded"] = time.time() - basis_start
                result["success"] = True
                self.log("Basis words loaded successfully")
            except:
                result["timing"]["basis_words_timeout"] = time.time() - basis_start
                self.log("Basis words failed to load", "ERROR")
            
            # Take screenshot after test
            self.take_screenshot(f"basis_word_test_{test_word}")
            
            result["timing"]["total"] = time.time() - start_time
            
        except Exception as e:
            result["error"] = str(e)
            result["traceback"] = traceback.format_exc()
            self.log(f"Error in basis word test: {e}", "ERROR")
            self.take_screenshot(f"error_basis_word_{test_word}")
        
        return result
    
    def test_multiple_basis_words(self, words: list = None) -> Dict[str, Any]:
        """Test multiple basis words to identify patterns."""
        if words is None:
            words = ["king", "queen", "man", "woman", "good", "bad", "happy", "sad"]
        
        results = {
            "total_tests": len(words),
            "successful_tests": 0,
            "failed_tests": 0,
            "word_results": {},
            "common_errors": [],
            "timing_stats": {}
        }
        
        self.log(f"Testing {len(words)} basis words...")
        
        for word in words:
            self.log(f"Testing word: {word}")
            result = self.test_basis_word_input(word)
            results["word_results"][word] = result
            
            if result["success"]:
                results["successful_tests"] += 1
            else:
                results["failed_tests"] += 1
                if result["error"]:
                    results["common_errors"].append(result["error"])
            
            # Wait between tests to avoid overwhelming the server
            time.sleep(2)
        
        # Calculate timing statistics
        all_timings = []
        for word_result in results["word_results"].values():
            if "total" in word_result["timing"]:
                all_timings.append(word_result["timing"]["total"])
        
        if all_timings:
            results["timing_stats"] = {
                "min": min(all_timings),
                "max": max(all_timings),
                "avg": sum(all_timings) / len(all_timings)
            }
        
        return results
    
    def monitor_app_logs(self):
        """Monitor the Flask app logs for threading errors."""
        if not self.app_process:
            return
        
        def log_reader():
            try:
                for line in iter(self.app_process.stdout.readline, ''):
                    if line.strip():
                        self.log(f"APP: {line.strip()}", "APP")
            except:
                pass
        
        def error_reader():
            try:
                for line in iter(self.app_process.stderr.readline, ''):
                    if line.strip():
                        self.log(f"APP ERROR: {line.strip()}", "APP_ERROR")
            except:
                pass
        
        # Start log monitoring threads
        stdout_thread = threading.Thread(target=log_reader, daemon=True)
        stderr_thread = threading.Thread(target=error_reader, daemon=True)
        
        stdout_thread.start()
        stderr_thread.start()
        
        return stdout_thread, stderr_thread
    
    def run_full_debug(self) -> Dict[str, Any]:
        """Run the complete debugging session."""
        debug_results = {
            "start_time": time.time(),
            "app_startup": False,
            "browser_setup": False,
            "app_ready": False,
            "basis_word_tests": None,
            "errors": [],
            "logs": []
        }
        
        try:
            # Start app
            if not self.start_app():
                debug_results["errors"].append("Failed to start Flask app")
                return debug_results
            debug_results["app_startup"] = True
            
            # Monitor app logs
            self.monitor_app_logs()
            
            # Setup browser
            if not self.setup_browser():
                debug_results["errors"].append("Failed to setup browser")
                return debug_results
            debug_results["browser_setup"] = True
            
            # Wait for app to be ready
            if not self.wait_for_app_ready():
                debug_results["errors"].append("App not ready within timeout")
                return debug_results
            debug_results["app_ready"] = True
            
            # Run basis word tests
            self.log("Starting basis word tests...")
            debug_results["basis_word_tests"] = self.test_multiple_basis_words()
            
        except Exception as e:
            error_msg = f"Debug session error: {e}"
            self.log(error_msg, "ERROR")
            debug_results["errors"].append(error_msg)
            debug_results["traceback"] = traceback.format_exc()
        
        finally:
            # Cleanup
            self.log("Cleaning up...")
            self.close_browser()
            self.stop_app()
            
            # Save logs
            debug_results["logs"] = self.debug_logs
            debug_results["end_time"] = time.time()
            debug_results["duration"] = debug_results["end_time"] - debug_results["start_time"]
        
        return debug_results
    
    def save_debug_report(self, results: Dict[str, Any], filename: str = None):
        """Save debug results to a JSON file."""
        if filename is None:
            timestamp = time.strftime("%Y%m%d_%H%M%S")
            filename = f"debug_report_{timestamp}.json"
        
        try:
            with open(filename, 'w') as f:
                json.dump(results, f, indent=2, default=str)
            self.log(f"Debug report saved: {filename}")
        except Exception as e:
            self.log(f"Error saving debug report: {e}", "ERROR")


def main():
    """Main function to run the debugging session."""
    print("WordSynth Threading Debugger")
    print("=" * 50)
    
    debugger = WordSynthDebugger()
    
    try:
        results = debugger.run_full_debug()
        debugger.save_debug_report(results)
        
        # Print summary
        print("\n" + "=" * 50)
        print("DEBUG SUMMARY")
        print("=" * 50)
        print(f"App Startup: {'✅' if results['app_startup'] else '❌'}")
        print(f"Browser Setup: {'✅' if results['browser_setup'] else '❌'}")
        print(f"App Ready: {'✅' if results['app_ready'] else '❌'}")
        
        if results['basis_word_tests']:
            tests = results['basis_word_tests']
            print(f"Basis Word Tests: {tests['successful_tests']}/{tests['total_tests']} successful")
            
            if tests['timing_stats']:
                stats = tests['timing_stats']
                print(f"Timing Stats: min={stats['min']:.2f}s, max={stats['max']:.2f}s, avg={stats['avg']:.2f}s")
        
        if results['errors']:
            print(f"Errors: {len(results['errors'])}")
            for error in results['errors']:
                print(f"  - {error}")
        
        print(f"Total Duration: {results['duration']:.2f}s")
        
    except KeyboardInterrupt:
        print("\nDebug session interrupted by user")
    except Exception as e:
        print(f"Fatal error: {e}")
        traceback.print_exc()
    finally:
        debugger.close_browser()
        debugger.stop_app()


if __name__ == "__main__":
    main()
