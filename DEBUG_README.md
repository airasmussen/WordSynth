# WordSynth Threading Debug Setup

This directory contains automated debugging tools to identify and fix threading issues in the WordSynth application.

## Quick Start

### 1. Install Dependencies
```bash
pip install -r requirements-debug.txt
playwright install
```

### 2. Run Simple Debug Test
```bash
# Test with default word "king"
python run_debug.py

# Test with specific word
python run_debug.py queen

# Run full debug suite
python run_debug.py --full

# Run pytest tests
python run_debug.py --pytest
```

## Debugging Scripts

### 1. `run_debug.py` - Main Entry Point
The easiest way to run debugging tests.

**Usage:**
```bash
python run_debug.py [word] [options]
```

**Options:**
- `word`: Word to test (default: "king")
- `--full`: Run comprehensive debug suite
- `--pytest`: Run pytest-based tests
- `--simple`: Run simple debug (default)

### 2. `simple_debug.py` - Quick Test
Lightweight script for quick testing of specific words.

**Usage:**
```bash
python simple_debug.py [word]
```

**Features:**
- Starts Flask app automatically
- Opens browser and tests word input
- Takes screenshots on success/error
- Minimal overhead

### 3. `debug_threading.py` - Comprehensive Testing
Full-featured debugging suite with detailed logging and analysis.

**Usage:**
```bash
python debug_threading.py
```

**Features:**
- Tests multiple words automatically
- Detailed timing analysis
- Console error monitoring
- Network request logging
- Comprehensive error reporting
- JSON debug reports

### 4. `test_threading.py` - Pytest Test Suite
Structured tests using pytest framework.

**Usage:**
```bash
pytest test_threading.py -v -s
```

**Features:**
- Multiple test scenarios
- Threading environment validation
- Import safety tests
- Structured test reporting

## Understanding the Threading Issue

Based on the code analysis, the threading crash likely occurs due to:

1. **UMAP Threading Conflicts**: Even with `n_jobs=1`, UMAP may use internal threading
2. **FAISS Index Threading**: FAISS operations might conflict with other threading
3. **Gensim Model Threading**: Model operations during concurrent requests
4. **Environment Variable Conflicts**: Multiple threading libraries competing

## Debugging Process

### Step 1: Identify the Crash
Run a simple test to reproduce the issue:
```bash
python run_debug.py king
```

### Step 2: Analyze the Error
Check the output for:
- Console errors in the browser
- Flask app stderr output
- Screenshots of the UI state
- Timing information

### Step 3: Test Multiple Scenarios
Run comprehensive tests:
```bash
python run_debug.py --full
```

### Step 4: Review Debug Report
The full debug suite generates a JSON report with:
- Timing statistics
- Error patterns
- Console logs
- Network requests
- Screenshots

## Common Threading Issues and Solutions

### Issue 1: UMAP Threading
**Symptoms:** Crash during 3D visualization generation
**Solution:** Force single-threaded UMAP:
```python
reducer = umap.UMAP(n_jobs=1, verbose=False)
```

### Issue 2: FAISS Threading
**Symptoms:** Crash during nearest neighbor search
**Solution:** Disable FAISS or use single-threaded mode:
```python
# In synth.py, disable FAISS
FAISS_AVAILABLE = False
```

### Issue 3: Gensim Threading
**Symptoms:** Crash during model operations
**Solution:** Ensure single-threaded gensim:
```python
# Set environment variables before importing gensim
os.environ['NUMBA_NUM_THREADS'] = '1'
```

### Issue 4: Flask Threading
**Symptoms:** Crash during concurrent requests
**Solution:** Use single-threaded Flask:
```python
app.run(debug=True, threaded=False)
```

## Environment Variables

The debugging scripts set these environment variables to minimize threading conflicts:

```bash
NUMBA_NUM_THREADS=1
NUMBA_THREADING_LAYER=omp
OMP_NUM_THREADS=1
MKL_NUM_THREADS=1
OPENBLAS_NUM_THREADS=1
```

## Output Files

### Screenshots
- `debug_[word]_[timestamp].png` - Success screenshots
- `error_[word]_[timestamp].png` - Error screenshots
- `test_[word]_[timestamp].png` - Pytest screenshots

### Debug Reports
- `debug_report_[timestamp].json` - Comprehensive debug data

### Logs
- Console output with timestamps
- Flask app stdout/stderr
- Browser console logs
- Network request logs

## Troubleshooting

### Browser Won't Start
```bash
playwright install chromium
```

### Flask App Won't Start
Check if port 5801 is available:
```bash
lsof -i :5801
```

### Import Errors
Ensure all dependencies are installed:
```bash
pip install -r requirements-debug.txt
```

### Permission Errors
Make scripts executable:
```bash
chmod +x *.py
```

## Next Steps

1. **Run the simple debug** to reproduce the issue
2. **Analyze the error output** to identify the root cause
3. **Apply the appropriate fix** based on the error type
4. **Re-test** to confirm the fix works
5. **Run full test suite** to ensure no regressions

## Contributing

When adding new debugging features:
1. Update this README
2. Add tests to `test_threading.py`
3. Update `run_debug.py` with new options
4. Document any new environment variables or requirements
