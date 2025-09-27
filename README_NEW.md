# Word Synthesizer - Flask Version 🔤

A modern, visual word embedding explorer built with Flask and Plotly.js. This is a complete rewrite of the original Streamlit app, featuring a beautiful 3D visualization interface and real-time word mixing capabilities.

## ✨ Features

- **🎨 Beautiful 3D Visualization**: Interactive 3D semantic neighborhoods using UMAP and Plotly.js
- **🎚️ Real-time Mixing Board**: Adjust word weights with sliders and see results update instantly
- **🖱️ Interactive Controls**: Click words in 3D space to set as new base word
- **🔊 Text-to-Speech**: Hover over words to hear them spoken
- **📊 Advanced Filtering**: Filter out proper nouns, conjugations, and mixer words
- **📋 Export Results**: Download nearest neighbors as CSV
- **⚡ Fast Performance**: Flask backend with optional FAISS acceleration
- **📱 Responsive Design**: Works on desktop and mobile devices

## 🚀 Quick Start

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

### 2. Download Embeddings

Choose one of these options:

#### Option A: GoogleNews word2vec (Recommended)
```bash
# Download GoogleNews vectors (1.5GB)
wget https://drive.google.com/uc?id=0B7XkCwpI5KDYNlNUTTlSS21pQmM&export=download -O GoogleNews-vectors-negative300.bin
```

#### Option B: GloVe
```bash
# Download GloVe vectors
wget https://nlp.stanford.edu/data/glove.6B.zip
unzip glove.6B.zip
```

### 3. Run the Application

```bash
python app.py
```

The app will be available at `http://localhost:5000`

## 🎯 How to Use

1. **Enter a Base Word**: Type a word in the sidebar (default: "king")
2. **Adjust Sliders**: Use the mixing board to blend different words with weights from -2.0 to 2.0
3. **View 3D Visualization**: Explore the semantic neighborhood in 3D space
4. **Click Words**: Click any word in the 3D plot to set it as your new base word
5. **Filter Results**: Use the filter options to customize your results
6. **Export Data**: Download your results as CSV for further analysis

## 🏗️ Architecture

### Backend (Flask)
- **`app.py`**: Main Flask application with REST API endpoints
- **`synth.py`**: Word embedding model and similarity search (unchanged)
- **`settings.py`**: Configuration parameters (unchanged)

### Frontend (HTML/CSS/JavaScript)
- **`templates/index.html`**: Main application interface
- **`static/css/style.css`**: Modern, dark-themed styling
- **`static/js/api.js`**: API client for backend communication
- **`static/js/visualization.js`**: 3D visualization manager using Plotly.js
- **`static/js/app.js`**: Main application logic and user interactions

## 🔧 API Endpoints

- `GET /` - Main application page
- `POST /api/model/load` - Load word embedding model
- `GET /api/model/info` - Get model information
- `POST /api/word/check` - Check if word exists in vocabulary
- `POST /api/word/basis` - Get basis word candidates
- `POST /api/word/mix` - Mix word vectors with weights
- `POST /api/word/neighbors` - Get nearest neighbors
- `POST /api/visualization/3d` - Get 3D visualization data
- `POST /api/word/random_directions` - Get random direction words

## 🎨 Key Improvements Over Streamlit

1. **Better Performance**: No Streamlit overhead, direct API calls
2. **Custom 3D Visualization**: Full control over Plotly.js interactions
3. **Modern UI**: Beautiful dark theme with smooth animations
4. **Real-time Updates**: Instant feedback as you adjust sliders
5. **Click Interactions**: Click words in 3D to set as base word
6. **Responsive Design**: Works perfectly on mobile devices
7. **Better Error Handling**: Graceful error messages and loading states
8. **Export Functionality**: Download results as CSV

## 🔍 Example: Word Arithmetic

Try these classic examples:

- **king - man + woman ≈ queen**
  - Set "king" to 1.0, "man" to -1.0, "woman" to 1.0

- **paris - france + italy ≈ rome**
  - Set "paris" to 1.0, "france" to -1.0, "italy" to 1.0

## 🛠️ Development

### Project Structure
```
WordSynth/
├── app.py                 # Flask backend
├── synth.py              # Word embedding model
├── settings.py           # Configuration
├── requirements.txt      # Dependencies
├── templates/
│   └── index.html        # Main HTML template
├── static/
│   ├── css/
│   │   └── style.css     # Styling
│   └── js/
│       ├── api.js        # API client
│       ├── visualization.js # 3D visualization
│       └── app.js        # Main app logic
└── README_NEW.md         # This file
```

### Adding New Features

1. **Backend**: Add new API endpoints in `app.py`
2. **Frontend**: Add new functionality in the appropriate JavaScript file
3. **Styling**: Update `style.css` for new UI elements

## 🐛 Troubleshooting

### Common Issues

**"Model not found"**
- Ensure your embedding file is in the project directory
- Check the file path in `settings.py`

**"Word not found in vocabulary"**
- Try a more common word
- Check spelling and case sensitivity

**FAISS installation fails (Apple Silicon)**
- This is expected on M1/M2 Macs
- The app will work fine with gensim fallback

**3D visualization not loading**
- Check browser console for JavaScript errors
- Ensure Plotly.js is loading correctly

## 📄 License

MIT License - see LICENSE file for details.

## 🙏 Acknowledgments

- **GoogleNews Word2Vec**: Free for research and commercial use
- **GloVe**: Apache 2.0 License - Stanford NLP Group
- **Plotly.js**: MIT License
- **UMAP**: BSD License

