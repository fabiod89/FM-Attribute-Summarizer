require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const cheerio = require('cheerio');
const expressLayouts = require('express-ejs-layouts');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const examples = require('./examples.json');

// Configure model
const model = genAI.getGenerativeModel({
  model: "gemini-2.0-flash",
  generationConfig: {
    temperature: 1,
    topP: 0.95,
    topK: 64,
    maxOutputTokens: 8192,
    responseMimeType: "text/plain"
  }
});

// Progress tracking
let processing = false;
let currentProgress = 0;
let totalPlayers = 0;

// Configure Multer for memory storage
const storage = multer.memoryStorage(); // Store files in memory
const upload = multer({ storage });

// EJS setup
app.use(expressLayouts);
app.set('view engine', 'ejs');
app.set('layout', 'layout');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

// Attribute mapping
const attributeMap = {
  // Technical
  Cro: 'Crossing',
  Dri: 'Dribbling',
  Fin: 'Finishing',
  Fir: 'First Touch',
  Hea: 'Heading',
  Lon: 'Long Shots',
  Mar: 'Marking',
  Pas: 'Passing',
  Tck: 'Tackling',
  Tec: 'Technique',
  'L Th': 'Long Throws',
  Fre: 'Free Kick Taking',
  Pen: 'Penalty Taking',
  Cor: 'Corners',

  // Mental
  Agg: 'Aggression',
  Ant: 'Anticipation',
  Bra: 'Bravery',
  Cmp: 'Composure',
  Cnt: 'Concentration',
  Dec: 'Decisions',
  Det: 'Determination',
  Fla: 'Flair',
  Ldr: 'Leadership',
  OtB: 'Off The Ball',
  Pos: 'Positioning',
  Tea: 'Teamwork',
  Vis: 'Vision',
  Wor: 'Work Rate',

  // Physical
  Acc: 'Acceleration',
  Agi: 'Agility',
  Bal: 'Balance',
  Jum: 'Jumping Reach',
  Nat: 'Natural Fitness',
  Pac: 'Pace',
  Sta: 'Stamina',
  Str: 'Strength',

  // Goalkeeping
  Aer: 'Aerial Reach',
  Cmd: 'Command of Area',
  Com: 'Communication',
  Ecc: 'Eccentricity',
  Han: 'Handling',
  Kic: 'Kicking',
  '1v1': 'One on Ones',
  Pun: 'Punching (Tendency)',
  Ref: 'Reflexes',
  TRO: 'Rushing Out (Tendency)',
  Thr: 'Throwing',
};

// Analyze player function
async function analyzePlayer(player) {
  const attributeCategories = {
    goalkeeping: ['Aer','Cmd','Com','Ecc','Han','Kic','1v1','Pun','Ref','TRO','Thr'],
    technical: ['Cor','Cro','Dri','Fin','Fir','Fre','Hea','Lon','L Th','Mar','Pas','Pen','Tck','Tec'],
    mental: ['Agg','Ant','Bra','Cmp','Cnt','Dec','Det','Fla','Ldr','OtB','Pos','Tea','Vis','Wor'],
    physical: ['Acc','Agi','Bal','Jum','Nat','Pac','Sta','Str']
  };

  // Build prompt with examples
  let prompt = '';
  examples.forEach(example => {
    prompt += `input: ${example.input}\n`;
    prompt += `output: ${example.output}\n\n`;
  });

  // Add current player's data
  prompt += 'input: ';
  for (const [category, attributes] of Object.entries(attributeCategories)) {
    prompt += `${category.charAt(0).toUpperCase() + category.slice(1)} Attributes:\n`;
    attributes.forEach(attr => {
      if (player[attr]) {
        const attributeName = attributeMap[attr];
        prompt += `- ${attributeName}: ${player[attr]}\n`;
      }
    });
    prompt += '\n';
  }

  prompt = prompt.trim();

  try {
    const result = await model.generateContent(prompt);
    return result.response.text();
  } catch (error) {
    console.error("AI Analysis Error:", error);
    return "Analysis unavailable";
  }
}

let playersData = []; // Global variable to store players

// Upload route with memory storage
app.post('/upload', upload.single('fmFile'), async (req, res) => {
    console.log('Upload route hit'); // Debugging
    if (!req.file) {
      console.log('No file uploaded'); // Debugging
      return res.status(400).send('No file uploaded');
    }
  
    try {
      processing = true;
      console.log('Processing file from memory'); // Debugging
      const html = req.file.buffer.toString('utf8'); // Read file from memory
      const $ = cheerio.load(html);
      playersData = []; // Reset players data
  
      const rows = $('tr').slice(1); // Skip header
      totalPlayers = rows.length;
      currentProgress = 0;
  
      const headers = $('th')
        .map((i, th) => $(th).text().trim())
        .get();
  
      for (const row of rows) {
        const cols = $(row).find('td');
        const player = {};
  
        headers.forEach((header, index) => {
          player[header] = $(cols[index]).text().trim();
        });
  
        player.analysis = await analyzePlayer(player);
        playersData.push(player);
        currentProgress++;
      }
  
      processing = false;
      res.redirect('/players');
    } catch (error) {
      processing = false;
      console.error('Error processing file:', error);
      res.status(500).send('Error processing file');
    }
  });

// Routes
app.get('/', (req, res) => {
  res.render('index');
});

app.get('/players', (req, res) => {
    res.render('players', { players: playersData });
  });

  app.get('/player/:uid', (req, res) => {
    const player = playersData.find((p) => p.UID === req.params.uid);
  
    if (!player) {
      return res.status(404).send('Player not found');
    }
  
    res.render('player', { player, attributeMap });
  });

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));