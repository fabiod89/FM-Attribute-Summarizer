require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cheerio = require('cheerio');
const expressLayouts = require('express-ejs-layouts');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Use memory storage instead of disk storage
const storage = multer.memoryStorage(); // Store files in memory
const upload = multer({ storage });

const app = express();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const examples = require('./examples.json');

app.use(express.static(path.join(__dirname, 'public')));

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

// Configure Multer
const storage = multer.diskStorage({
destination: (req, file, cb) => {
    // fs.mkdirSync('public/uploads/', { recursive: true });
    cb(null, 'public/uploads/');
},
filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
},
});
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

// Progress endpoint
app.get('/progress', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  const sendProgress = () => {
    res.write(`data: ${JSON.stringify({ 
      current: currentProgress,
      total: totalPlayers
    })}\n\n`);
  };

  sendProgress();
  const interval = setInterval(sendProgress, 1000);
  req.on('close', () => clearInterval(interval));
});

// Upload route
app.post('/upload', upload.single('fmFile'), async (req, res) => {
    console.log('Upload route hit'); // Debugging
    if (!req.file) {
      console.log('No file uploaded'); // Debugging
      return res.status(400).send('No file uploaded');
    }
  
    try {
      console.log('Processing file from memory'); // Debugging
      const html = req.file.buffer.toString('utf8'); // Read file from memory
      const $ = cheerio.load(html);
      const players = [];
  
      const rows = $('tr').slice(1); // Skip header
      console.log(`Found ${rows.length} players`); // Debugging
  
      const headers = $('th')
        .map((i, th) => $(th).text().trim())
        .get();
      console.log('Headers:', headers); // Debugging
  
      for (const row of rows) {
        const cols = $(row).find('td');
        const player = {};
  
        headers.forEach((header, index) => {
          player[header] = $(cols[index]).text().trim();
        });
  
        console.log('Analyzing player:', player.Name); // Debugging
        player.analysis = await analyzePlayer(player);
        players.push(player);
      }
  
      console.log('Players processed successfully'); // Debugging
      res.render('players', { players });
    } catch (error) {
      console.error('Error processing file:', error); // Debugging
      res.status(500).send('Error processing file');
    }
  });

// Analyze player function
async function analyzePlayer(player) {
  const attributeCategories = {
    goalkeeping: ['Aer','Cmd','Com','Ecc','Han','Kic','1v1','Pun','Ref','TRO','Thr'],
    technical: ['Cor','Cro','Dri','Fin','Fir','Fre','Hea','Lon','L Th','Mar','Pas','Pen','Tck','Tec'],
    mental: ['Agg','Ant','Bra','Cmp','Cnt','Dec','Det','Fla','Ldr','OtB','Pos','Tea','Vis','Wor'],
    physical: ['Acc','Agi','Bal','Jum','Nat','Pac','Sta','Str']
  };

  let prompt = '';
  examples.forEach(example => {
    prompt += `input: ${example.input}\n`;
    prompt += `output: ${example.output}\n\n`;
  });

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

// Routes
app.get('/', (req, res) => {
  res.render('index');
});

app.get('/players', (req, res) => {
    // If players data is passed from the upload route, render it
    if (req.query.players) {
      const players = JSON.parse(req.query.players);
      res.render('players', { players });
    } else {
      res.status(400).send('No players data found');
    }
  });

app.get('/player/:uid', (req, res) => {
  try {
    const players = JSON.parse(fs.readFileSync('public/data/players.json'));
    const player = players.find((p) => p.UID === req.params.uid);

    if (!player) {
      return res.status(404).send('Player not found');
    }

    res.render('player', { player, attributeMap });
  } catch (error) {
    console.error('Error loading player:', error);
    res.status(500).send('Error loading player');
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));